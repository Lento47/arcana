/**
 * Pure scale helpers for the chart kit.
 *
 * Every chart normalizes through here so a NaN sample, a flat series, or a
 * zero-width viewport can never produce a broken frame: the guards live in one
 * place, and the renderables stay dumb.
 */

/** Clamp to the 0..1 band; non-finite input reads as 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** Min/max of a series, ignoring non-finite samples. Empty reads as 0..0. */
export function extent(values: readonly number[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 }
  return { min, max }
}

/**
 * Normalize against a zero baseline: `value / max`. A flat series reads low
 * rather than full — a context window that sits at 20% must not paint a solid
 * bar just because 20% is its own maximum.
 */
export function normalize(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return clamp01(value / max)
}

/** Split a series into `count` contiguous chunks (last chunk absorbs the remainder). */
export function chunks<T>(values: readonly T[], count: number): T[][] {
  if (count <= 0) return []
  if (values.length <= count) return values.map((value) => [value])
  const result: T[][] = []
  const size = values.length / count
  let start = 0
  for (let i = 0; i < count; i++) {
    const end = i === count - 1 ? values.length : Math.round((i + 1) * size)
    result.push(values.slice(start, end))
    start = end
  }
  return result
}
