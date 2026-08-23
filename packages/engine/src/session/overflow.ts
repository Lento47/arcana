import { ConfigV1 } from "@arcana/core/v1/config/config"
import { SessionV1 } from "@arcana/core/v1/session"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"

const COMPACTION_BUFFER = 20_000

/** Grok-aligned default: auto-compact near 85% of the model context window. */
export const DEFAULT_THRESHOLD_PERCENT = 85
/** Routine prompt-size limit. This is a latency budget, not a context safety limit. */
export const DEFAULT_PERFORMANCE_MAX_INPUT_TOKENS = 96_000

export type CompactionPressureReason = "performance" | "safety"

export type CompactionPressure = {
  count: number
  hot: boolean
  limit: number
  reason?: CompactionPressureReason
}

export function usable(input: { cfg: ConfigV1.Info; model: Provider.Model; outputTokenMax?: number }) {
  const context = effectiveContext(input.cfg, input.model)
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
}

/**
 * Context window a model's pressure math should assume: the advertised window
 * when the provider reports one, else `compaction.default_context_tokens`.
 * Providers that report nothing (e.g. local ollama) get percent-based
 * proactive compaction only when the user assumes a window; 0 keeps the
 * legacy behavior (performance budget + reactive overflow only).
 */
export function effectiveContext(cfg: ConfigV1.Info, model: Pick<Provider.Model, "limit">): number {
  const advertised = model.limit.context
  if (advertised > 0) return advertised
  const assumed = cfg.compaction?.default_context_tokens
  return typeof assumed === "number" && Number.isFinite(assumed) && assumed > 0 ? Math.floor(assumed) : 0
}

/**
 * Same total used by isOverflow — input + output + reasoning + cache
 * (+ total if the provider already filled it).
 */
export function tokenCount(tokens: SessionV1.Assistant["tokens"]): number {
  if (tokens.total != null && Number.isFinite(tokens.total)) return tokens.total
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}

/**
 * Clamp configured threshold to 1–100. Default {@link DEFAULT_THRESHOLD_PERCENT}.
 * Values outside the range fall back to the default (safe against bad config).
 */
export function thresholdPercent(cfg: ConfigV1.Info): number {
  const raw = cfg.compaction?.threshold_percent
  if (raw === undefined || raw === null) return DEFAULT_THRESHOLD_PERCENT
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_THRESHOLD_PERCENT
  if (raw < 1 || raw > 100) return DEFAULT_THRESHOLD_PERCENT
  return Math.floor(raw)
}

export function performanceMaxInputTokens(cfg: ConfigV1.Info): number {
  const raw = cfg.compaction?.performance_max_input_tokens
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_PERFORMANCE_MAX_INPUT_TOKENS
  }
  return Math.floor(raw)
}

export function compactionPressure(input: {
  cfg: ConfigV1.Info
  tokens: SessionV1.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}): CompactionPressure {
  const count = tokenCount(input.tokens)
  const performanceLimit = performanceMaxInputTokens(input.cfg)
  if (input.cfg.compaction?.auto === false) {
    return { count, hot: false, limit: performanceLimit }
  }
  if (isOverflow(input)) {
    const contextLimit = effectiveContext(input.cfg, input.model) > 0
      ? Math.min(
          Math.floor(effectiveContext(input.cfg, input.model) * thresholdPercent(input.cfg) / 100),
          usable(input),
        )
      : performanceLimit
    return { count, hot: true, limit: Math.max(1, contextLimit), reason: "safety" }
  }
  if (input.cfg.compaction?.performance !== false && count >= performanceLimit) {
    return { count, hot: true, limit: performanceLimit, reason: "performance" }
  }
  return { count, hot: false, limit: performanceLimit }
}

/**
 * Auto-compact when:
 * 1. Token usage ≥ threshold_percent of model context (default 85%), or
 * 2. Token usage ≥ usable budget (hard ceiling — preserves output headroom / input caps).
 *
 * Disabled when `compaction.auto === false` or model has no context limit.
 */
export function isOverflow(input: {
  cfg: ConfigV1.Info
  tokens: SessionV1.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}) {
  if (input.cfg.compaction?.auto === false) return false
  const context = effectiveContext(input.cfg, input.model)
  if (context === 0) return false

  const count = tokenCount(input.tokens)
  const pct = thresholdPercent(input.cfg)

  // Proactive: Grok-style percent of full context window.
  // Integer compare avoids float noise: count/context >= pct/100 ⇔ count * 100 >= context * pct
  if (count * 100 >= context * pct) return true

  // Hard ceiling: still compact if past usable budget even when below percent
  // (e.g. large output reservation makes usable << 85% of context).
  if (count >= usable(input)) return true

  return false
}
