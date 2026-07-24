/**
 * Intra-loop compaction policy (P4).
 *
 * Mid multi-step tool loop: when context is hot, schedule a full-replace compact
 * before the next sample (same user turn), without waiting for turn end.
 *
 * Safety gates (Grok-aligned):
 * - min completed loop steps (default 3; hard usable breach may lower to 2)
 * - min compactable token mass (default 5k)
 * - usage hot via isOverflow (percent and/or usable ceiling) — caller, or percent here
 * - hysteresis vs last successful compact (always; never skipped on hard breach)
 */

import { DEFAULT_THRESHOLD_PERCENT } from "./overflow"
import { passesCompactHysteresis } from "./compaction-inter"

/** Default: require a few tool/sample steps before mid-loop compact. */
export const DEFAULT_INTRA_MIN_STEPS = 3

/** Under hard usable breach, allow scheduling from this step (still ≥ 1). */
export const DEFAULT_INTRA_HARD_BREACH_MIN_STEPS = 2

/** Default: don't bother if the head is tiny. */
export const DEFAULT_INTRA_MIN_COMPACTABLE_TOKENS = 5_000

/**
 * When unset, intra is enabled whenever auto-compact is enabled.
 * Set `compaction.intra: false` to disable mid-loop compact only.
 */
export function intraEnabled(cfg: { auto?: boolean; intra?: boolean } | undefined): boolean {
  if (cfg?.auto === false) return false
  if (cfg?.intra === false) return false
  return true
}

/**
 * Whether a mid-loop compact should be scheduled.
 *
 * `alreadyHot: true` — caller already ran `isOverflow` (percent or usable ceiling);
 * skip the percent-only gate (M2).
 *
 * `hardBreach: true` — may lower min steps to {@link DEFAULT_INTRA_HARD_BREACH_MIN_STEPS}
 * so OOM pressure can compact earlier; **hysteresis is never skipped** (M1).
 */
export function shouldIntraCompact(input: {
  /** 1-based agent loop step within the current run */
  step: number
  count: number
  context: number
  thresholdPercent?: number
  minSteps?: number
  /** Override hard-breach step floor (default 2). */
  hardBreachMinSteps?: number
  /**
   * Past usable budget (hard ceiling). Relaxes min steps only — not hysteresis.
   */
  hardBreach?: boolean
  minCompactableTokens?: number
  lastCompactTokens?: number
  minTokenDelta?: number
  /**
   * When true, skip the percent-of-context gate (caller already ran isOverflow).
   */
  alreadyHot?: boolean
  /** Explicit disable */
  enabled?: boolean
}): boolean {
  if (input.enabled === false) return false
  const context = input.context
  if (!(context > 0) || !(input.count > 0)) return false

  const configuredMin = input.minSteps ?? DEFAULT_INTRA_MIN_STEPS
  const hardFloor = input.hardBreachMinSteps ?? DEFAULT_INTRA_HARD_BREACH_MIN_STEPS
  const effectiveMin = input.hardBreach ? Math.min(configuredMin, hardFloor) : configuredMin
  if (input.step < effectiveMin) return false

  const minMass = input.minCompactableTokens ?? DEFAULT_INTRA_MIN_COMPACTABLE_TOKENS
  if (input.count < minMass) return false

  if (!input.alreadyHot) {
    const pct = input.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT
    if (input.count * 100 < context * pct) return false
  }

  // M1: always require growth since last success (same metric as store).
  return passesCompactHysteresis({
    count: input.count,
    context,
    lastCompactTokens: input.lastCompactTokens,
    minTokenDelta: input.minTokenDelta,
  })
}
