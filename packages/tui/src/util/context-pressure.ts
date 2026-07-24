/**
 * Context pressure labels for TUI surfaces.
 * Aligns with engine `compaction.threshold_percent` default (85) and emergency band (95).
 */

/** Match engine auto-compact default (`threshold_percent`). */
export const COMPACT_SOON_PERCENT = 85

/** Emergency pressure — well above proactive compact. */
export const COMPACT_NOW_PERCENT = 95

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
