/**
 * Sparkline math (Textual/ratatui parity, no renderable here).
 *
 * One row of block glyphs for a series. The newest sample is always the
 * rightmost cell, so a fixed-width sparkline in a header reads as history
 * flowing leftwards; a short series pads with spaces on the left instead of
 * stretching.
 */
import { chunks } from "./scale"

/** The eight-level block ramp; index 0 is the lowest bar. */
export const SPARK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const

export type SparkSummary = (chunk: readonly number[]) => number

/** Tallest sample of the bucket — the default, as in Textual. */
export const SparkMax: SparkSummary = (chunk) => {
  let max = Number.NEGATIVE_INFINITY
  for (const value of chunk) if (Number.isFinite(value) && value > max) max = value
  return Number.isFinite(max) ? max : 0
}

export const SparkMean: SparkSummary = (chunk) => {
  let sum = 0
  let count = 0
  for (const value of chunk) {
    if (!Number.isFinite(value)) continue
    sum += value
    count++
  }
  return count > 0 ? sum / count : 0
}

export const SparkMin: SparkSummary = (chunk) => {
  let min = Number.POSITIVE_INFINITY
  for (const value of chunk) if (Number.isFinite(value) && value < min) min = value
  return Number.isFinite(min) ? min : 0
}

export const SparkLast: SparkSummary = (chunk) => {
  for (let i = chunk.length - 1; i >= 0; i--) {
    const value = chunk[i]!
    if (Number.isFinite(value)) return value
  }
  return 0
}

/**
 * Render `values` as `width` cells of block glyphs.
 *
 * - empty series or non-positive width → ""
 * - few samples → left-padding spaces, newest at the right edge
 * - scaling is against the series maximum with a zero baseline
 */
export function sparkline(
  values: readonly number[],
  width: number,
  summary: SparkSummary = SparkMax,
): string {
  if (width <= 0 || values.length === 0) return ""
  const bars = Math.min(width, values.length)
  const buckets = chunks(values, bars).map((chunk) => summary(chunk))
  let max = 0
  for (const value of buckets) if (Number.isFinite(value) && value > max) max = value
  const glyphs = buckets.map((value) => {
    if (max <= 0) return SPARK_GLYPHS[0]!
    const index = Math.min(SPARK_GLYPHS.length - 1, Math.floor((value / max) * SPARK_GLYPHS.length))
    return SPARK_GLYPHS[Math.max(0, index)]!
  })
  return " ".repeat(width - bars) + glyphs.join("")
}
