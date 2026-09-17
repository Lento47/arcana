/**
 * Gauge math — proportional bars with eighth-block resolution for the last
 * cell, so a 62% context window reads as 62% and not as "somewhere between
 * half and two thirds". Labels are composed by the caller; this module only
 * answers "which cells".
 */
import { clamp01 } from "./scale"

/** Eighth-block fill ramp for the fractional cell. */
export const GAUGE_EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const

/**
 * The bar split into its filled and empty parts, so a renderer can ink the
 * fill and the track differently without re-deriving the geometry.
 */
export function gaugeParts(
  ratio: number,
  width: number,
  options: { full?: string; empty?: string } = {},
): { fill: string; track: string } {
  const full = options.full ?? "█"
  const empty = options.empty ?? "░"
  if (width <= 0) return { fill: "", track: "" }
  const value = clamp01(ratio)
  if (value <= 0) return { fill: "", track: empty.repeat(width) }
  if (value >= 1) return { fill: full.repeat(width), track: "" }
  const exact = value * width
  const whole = Math.floor(exact)
  const fraction = exact - whole
  const eighth = GAUGE_EIGHTHS[Math.min(GAUGE_EIGHTHS.length - 1, Math.floor(fraction * GAUGE_EIGHTHS.length))]!
  const fill = full.repeat(whole) + eighth
  return { fill, track: empty.repeat(Math.max(0, width - whole - (eighth ? 1 : 0))) }
}

/**
 * `width` cells representing `ratio` (0..1). Non-finite input reads as 0.
 * At exactly 1 the bar is all full — the eighth-ramp is never used there.
 */
export function gaugeCells(ratio: number, width: number, options: { full?: string; empty?: string } = {}): string {
  const { fill, track } = gaugeParts(ratio, width, options)
  return fill + track
}

/**
 * One-line readout: bar, label, percentage. The percentage is always shown,
 * so a clipped bar can never hide the value.
 */
export function labeledGauge(
  ratio: number,
  width: number,
  label?: string,
  options: { full?: string; empty?: string } = {},
): string {
  const percent = `${Math.round(clamp01(ratio) * 100)}%`
  const suffix = label ? ` ${label}` : ""
  return `${gaugeCells(ratio, width, options)}${suffix} ${percent}`
}
