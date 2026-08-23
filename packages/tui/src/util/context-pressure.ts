/**
 * Context pressure labels for TUI surfaces.
 * Aligns with engine `compaction.threshold_percent` default (85) and emergency band (95).
 */

/** Match engine auto-compact default (`threshold_percent`). */
export const COMPACT_SOON_PERCENT = 85

/** Emergency pressure — well above proactive compact. */
export const COMPACT_NOW_PERCENT = 95

/**
 * Engine parity constants (engine/src/session/overflow.ts + provider/transform.ts).
 * The TUI has no ConfigV1 access, so these mirror the engine defaults:
 * reserved = min(COMPACTION_BUFFER, maxOutput), output cap 32k.
 */
const COMPACTION_BUFFER_TOKENS = 20_000
const OUTPUT_TOKEN_MAX = 32_000

/** Token usage shape shared by SDK AssistantMessage.tokens (total is optional). */
export type ContextTokenUsage = {
  total?: number
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

/**
 * Canonical context size — mirrors engine `session/overflow.tokenCount`:
 * prefer the provider-filled `total`, else sum input+output+reasoning+cache.
 */
export function contextTokenCount(tokens: ContextTokenUsage): number {
  if (tokens.total != null && Number.isFinite(tokens.total)) return tokens.total
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}

/** True when the message carries any real provider usage at all. */
export function hasContextUsage(tokens: ContextTokenUsage): boolean {
  return (
    (tokens.input ?? 0) > 0 ||
    (tokens.output ?? 0) > 0 ||
    (tokens.total != null && Number.isFinite(tokens.total) && tokens.total > 0)
  )
}

/** Engine `ProviderTransform.maxOutputTokens`: capped model output, falling back to the cap when unset. */
function maxOutputTokens(output: number | undefined): number {
  return Math.min(output ?? 0, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX
}

/**
 * Usable prompt budget before compaction fires — mirrors engine `session/overflow.usable`
 * with default config (no user overrides): input caps win, else context minus output headroom.
 * Returns 0 for unlimited windows (`context === 0`) so callers treat it as "no ceiling".
 */
export function usableContextWindow(limit: { context?: number; input?: number; output?: number } | undefined): number {
  const context = limit?.context ?? 0
  if (context <= 0) return 0
  const maxOut = maxOutputTokens(limit?.output)
  const reserved = Math.min(COMPACTION_BUFFER_TOKENS, maxOut)
  if (limit?.input && limit.input > 0) return Math.max(0, limit.input - reserved)
  return Math.max(0, context - maxOut)
}

export type ContextPressureLabel = "compact now" | "compact soon"

/**
 * Map usage percent of model context to a pressure label.
 * Returns undefined when percent is missing or below the soon threshold.
 */
export function contextPressure(
  percent: number | null | undefined,
): ContextPressureLabel | undefined {
  if (percent == null || !Number.isFinite(percent)) return undefined
  if (percent >= COMPACT_NOW_PERCENT) return "compact now"
  if (percent >= COMPACT_SOON_PERCENT) return "compact soon"
  return undefined
}
