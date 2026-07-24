/**
 * Inter-turn compaction policy (P3).
 *
 * Runs between user turns (preflight before first sample, and/or after a turn
 * completes) when context is still hot, with hysteresis so we don't compact
 * twice without meaningful growth.
 */

import type { SessionV1 } from "@arcana/core/v1/session"
import { DEFAULT_THRESHOLD_PERCENT, tokenCount } from "./overflow"

/** Minimum token growth since last compact before inter may fire again. */
export const DEFAULT_INTER_MIN_TOKEN_DELTA = 5_000

/** Floor: also require at least this fraction of context as delta (whichever larger). */
export const DEFAULT_INTER_MIN_TOKEN_DELTA_FRACTION = 0.05

/** Metadata keys written on successful compact (session.metadata). */
export const META_LAST_COMPACT_TOKENS = "__arcana_last_compact_tokens"
export const META_LAST_COMPACT_AT = "__arcana_last_compact_at"
export const META_LAST_COMPACT_PASS = "__arcana_last_compact_pass"

export type InterCompactPass = "inter" | "intra" | "inline" | "manual"

/** Pending pass tag while a create()'d compact is waiting to process. */
export const META_PENDING_COMPACT_PASS = "__arcana_pending_compact_pass"

export function minInterTokenDelta(context: number): number {
  if (!(context > 0)) return DEFAULT_INTER_MIN_TOKEN_DELTA
  return Math.max(
    DEFAULT_INTER_MIN_TOKEN_DELTA,
    Math.floor(context * DEFAULT_INTER_MIN_TOKEN_DELTA_FRACTION),
  )
}

/**
 * Provider usage total used for hysteresis store + decide (same metric both sides).
 * Prefer this over summarizer JSON estimates.
 */
export function usageForHysteresis(tokens: SessionV1.Assistant["tokens"]): number {
  return tokenCount(tokens)
}

/**
 * Latest finished non-summary assistant usage in chronological message list.
 * Used to seed `__arcana_last_compact_tokens` when the caller does not pass an explicit count.
 */
export function hysteresisTokensFromMessages(
  messages: ReadonlyArray<{ info: SessionV1.Info }>,
): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]!.info
    if (info.role !== "assistant") continue
    if (!info.finish || info.summary || info.error) continue
    return usageForHysteresis(info.tokens)
  }
  return undefined
}

/**
 * Growth gate only: allow first compact always; after success require min delta.
 * `count` and `lastCompactTokens` must use the same metric (provider usage / tokenCount).
 */
export function passesCompactHysteresis(input: {
  count: number
  context: number
  lastCompactTokens?: number
  minTokenDelta?: number
}): boolean {
  const last = input.lastCompactTokens
  if (last === undefined) return true
  const minDelta = input.minTokenDelta ?? minInterTokenDelta(input.context)
  return input.count - last >= minDelta
}

/**
 * Whether an inter-turn compact should run.
 *
 * Requires:
 * 1. Hot context — either `alreadyHot` (caller ran isOverflow including hard ceiling)
 *    or usage at/above threshold_percent of context, and
 * 2. Enough token growth since last compact (hysteresis), unless never compacted.
 */
export function shouldInterCompact(input: {
  count: number
  context: number
  thresholdPercent?: number
  lastCompactTokens?: number
  /** Override min delta; default max(5k, 5% context) */
  minTokenDelta?: number
  /**
   * When true, skip the percent-of-context gate. Use after `isOverflow` so hard-ceiling
   * usable breaches still allow inter (M2).
   */
  alreadyHot?: boolean
}): boolean {
  const context = input.context
  if (!(context > 0)) return false
  if (!(input.count > 0)) return false

  if (!input.alreadyHot) {
    const pct = input.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT
    // count/context >= pct/100
    if (input.count * 100 < context * pct) return false
  }

  return passesCompactHysteresis({
    count: input.count,
    context,
    lastCompactTokens: input.lastCompactTokens,
    minTokenDelta: input.minTokenDelta,
  })
}

export function readLastCompactTokens(metadata: Record<string, unknown> | undefined): number | undefined {
  if (!metadata) return undefined
  const v = metadata[META_LAST_COMPACT_TOKENS]
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined
}

export function compactSuccessMetadata(
  previous: Record<string, unknown> | undefined,
  input: { tokens: number; pass: InterCompactPass },
): Record<string, unknown> {
  return {
    ...(previous ?? {}),
    [META_LAST_COMPACT_TOKENS]: input.tokens,
    [META_LAST_COMPACT_AT]: Date.now(),
    [META_LAST_COMPACT_PASS]: input.pass,
  }
}
