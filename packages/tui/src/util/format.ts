import { duration } from "./locale"

/**
 * Seconds-input convenience wrapper over the single canonical duration
 * formatter in `util/locale` (audit M7: two formatters with divergent output
 * are consolidated on one implementation — including the old "~1 day" /
 * "~1 week" approximations, which are now exact "1d" / "7d").
 */
export function formatDuration(secs: number) {
  return duration(secs * 1000)
}
