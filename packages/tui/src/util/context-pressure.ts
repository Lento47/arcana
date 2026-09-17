/**
 * Context pressure labels for TUI surfaces.
 * Aligns with engine `compaction.threshold_percent` default (85) and emergency band (95).
 * Callers with config access (`sync.data.config.compaction` or
 * `api.state.config.compaction`) pass it through so user overrides
 * (`auto`, `reserved`, `threshold_percent`, `default_context_tokens`) match the
 * engine's actual decisions instead of the built-in defaults.
 */

import { Token } from "@arcana/core/util/token"

/** Match engine auto-compact default (`threshold_percent`). */
export const COMPACT_SOON_PERCENT = 85

/** Emergency pressure — well above proactive compact. */
export const COMPACT_NOW_PERCENT = 95

/**
 * Engine parity constants (engine/src/session/overflow.ts + provider/transform.ts).
 * `reserved` and the assumed window are overridable via `CompactionLite`; the
 * output cap is a hard engine constant.
 */
const COMPACTION_BUFFER_TOKENS = 20_000
const OUTPUT_TOKEN_MAX = 32_000

/**
 * Engine `overflow.DEFAULT_PERFORMANCE_MAX_INPUT_TOKENS`: a latency budget,
 * independent of the context window. The engine compacts as soon as usage
 * reaches it (reason `"performance"`), which is why a session can compact at a
 * low percent of a large window — the TUI must be able to say so.
 */
export const PERFORMANCE_MAX_INPUT_TOKENS = 96_000

/** Config subset that affects engine context pressure (`ConfigV1.Info["compaction"]`). */
export type CompactionLite = {
  auto?: boolean
  reserved?: number
  threshold_percent?: number
  default_context_tokens?: number
  performance?: boolean
  performance_max_input_tokens?: number
}

/** Canonical token usage shape shared by SDK AssistantMessage.tokens (total is optional). */
export type ContextTokenUsage = Token.ContextTokens

/**
 * Canonical context size — delegates to the shared core rule (provider total
 * when it covers the non-overlapping buckets, else their sum) so the TUI can
 * never disagree with engine compaction pressure.
 */
export function contextTokenCount(tokens: ContextTokenUsage): number {
  return Token.contextCount(tokens)
}

/**
 * True when the message carries any real provider usage at all, including
 * reasoning- and cache-only steps (a fully cached prompt with reasoning-only
 * output has `input === 0` and no provider `total` on some providers).
 */
export function hasContextUsage(tokens: ContextTokenUsage): boolean {
  return (
    (tokens.input ?? 0) > 0 ||
    (tokens.output ?? 0) > 0 ||
    (tokens.reasoning ?? 0) > 0 ||
    (tokens.cache?.read ?? 0) > 0 ||
    (tokens.cache?.write ?? 0) > 0 ||
    (tokens.total != null && Number.isFinite(tokens.total) && tokens.total > 0)
  )
}

/** Engine `compaction.auto === false` disables auto-compact; labels must not promise it. */
export function compactionAutoEnabled(cfg?: CompactionLite): boolean {
  return cfg?.auto !== false
}

/** Engine `thresholdPercent`: clamps to 1–100, falls back to default on bad config. */
export function compactSoonPercent(cfg?: CompactionLite): number {
  const raw = cfg?.threshold_percent
  if (raw === undefined || raw === null) return COMPACT_SOON_PERCENT
  if (typeof raw !== "number" || !Number.isFinite(raw)) return COMPACT_SOON_PERCENT
  if (raw < 1 || raw > 100) return COMPACT_SOON_PERCENT
  return Math.floor(raw)
}

/** Emergency label band; never below the proactive threshold. */
export function compactNowPercent(cfg?: CompactionLite): number {
  return Math.max(compactSoonPercent(cfg), COMPACT_NOW_PERCENT)
}

/**
 * Engine `overflow.performanceMaxInputTokens`: the latency budget in tokens.
 * Returns 0 when auto-compaction or the performance pass is disabled, so
 * callers can treat 0 as "no performance constraint". Bad config falls back to
 * the engine default (positive, finite numbers win).
 */
export function performanceBudgetTokens(cfg?: CompactionLite): number {
  if (cfg?.auto === false || cfg?.performance === false) return 0
  const raw = cfg?.performance_max_input_tokens
  if (raw === undefined || raw === null) return PERFORMANCE_MAX_INPUT_TOKENS
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return PERFORMANCE_MAX_INPUT_TOKENS
  return Math.floor(raw)
}

/**
 * Engine `session/overflow.effectiveContext`: advertised window when the
 * provider reports one, else `compaction.default_context_tokens` (0 = unknown,
 * callers treat it as "no ceiling").
 */
export function effectiveContext(
  limit: { context?: number } | undefined,
  cfg?: CompactionLite,
): number {
  const advertised = limit?.context ?? 0
  if (advertised > 0) return advertised
  const assumed = cfg?.default_context_tokens
  return typeof assumed === "number" && Number.isFinite(assumed) && assumed > 0 ? Math.floor(assumed) : 0
}

/** Engine `ProviderTransform.maxOutputTokens`: capped model output, falling back to the cap when unset. */
function maxOutputTokens(output: number | undefined): number {
  return Math.min(output ?? 0, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX
}

/**
 * Usable prompt budget before compaction fires — mirrors engine `session/overflow.usable`
 * with the caller's compaction config (defaults when absent): input caps win,
 * else context minus output headroom.
 * Returns 0 for unlimited windows (`context === 0`) so callers treat it as "no ceiling".
 */
export function usableContextWindow(
  limit: { context?: number; input?: number; output?: number } | undefined,
  cfg?: CompactionLite,
): number {
  const context = effectiveContext(limit, cfg)
  if (context <= 0) return 0
  const maxOut = maxOutputTokens(limit?.output)
  const reserved = cfg?.reserved ?? Math.min(COMPACTION_BUFFER_TOKENS, maxOut)
  if (limit?.input && limit.input > 0) return Math.max(0, limit.input - reserved)
  return Math.max(0, context - maxOut)
}

export type ContextPressureLabel = "compact now" | "compact soon"

/**
 * Map usage percent of model context to a pressure label.
 * Returns undefined when percent is missing, below the soon threshold, or
 * when auto-compaction is disabled (the engine will not act on the label).
 */
export function contextPressure(
  percent: number | null | undefined,
  opts?: { auto?: boolean; soon?: number; now?: number },
): ContextPressureLabel | undefined {
  if (opts?.auto === false) return undefined
  if (percent == null || !Number.isFinite(percent)) return undefined
  const now = opts?.now ?? COMPACT_NOW_PERCENT
  const soon = opts?.soon ?? COMPACT_SOON_PERCENT
  if (percent >= now) return "compact now"
  if (percent >= soon) return "compact soon"
  return undefined
}

export type ContextUsageSnapshot = {
  tokens: number
  /** Rounded percent of the effective window for display; null when unknown. */
  percent: number | null
  /** Engine hard-ceiling breach (`session/overflow.usable`) — compacts even below threshold. */
  overBudget: boolean
  pressure: ContextPressureLabel | undefined
  /**
   * Engine latency budget in tokens (0 when the performance pass or auto is
   * disabled). Independent of the context window: the engine compacts at this
   * count even when `percent` is low, so surfaces that explain compaction must
   * show it.
   */
  performanceBudget: number
  /** Usage has reached the performance budget — the engine's next compact reason. */
  performanceHot: boolean
}

/**
 * One-stop context usage snapshot so every TUI surface (statusbar, sidebar,
 * spine header, subagent footer, metrics bar) reports the same numbers and the
 * same config-aware thresholds. Percent is of the full effective window;
 * pressure uses the unrounded ratio so it tracks the engine's integer compare;
 * the performance budget mirrors the engine's second, latency-driven trigger.
 */
export function contextUsageFor(input: {
  tokens: ContextTokenUsage | undefined
  limit: { context?: number; input?: number; output?: number } | undefined
  compaction?: CompactionLite
}): ContextUsageSnapshot {
  const tokens = contextTokenCount(input.tokens ?? {})
  const context = effectiveContext(input.limit, input.compaction)
  const percent = context > 0 ? Math.max(0, Math.min(100, Math.round((tokens / context) * 100))) : null
  const usable = usableContextWindow(input.limit, input.compaction)
  const ratio = context > 0 ? (tokens / context) * 100 : null
  const performanceBudget = performanceBudgetTokens(input.compaction)
  return {
    tokens,
    percent,
    overBudget: usable > 0 && tokens >= usable,
    pressure: contextPressure(ratio, {
      auto: compactionAutoEnabled(input.compaction),
      soon: compactSoonPercent(input.compaction),
      now: compactNowPercent(input.compaction),
    }),
    performanceBudget,
    performanceHot: performanceBudget > 0 && tokens >= performanceBudget,
  }
}
