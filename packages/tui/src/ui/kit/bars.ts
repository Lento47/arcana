/**
 * Bucket/bar math for histograms and time-bucketed counts (lnav parity).
 *
 * The renderable decides colors; this module decides where a value lands and
 * how many of them there are. Time buckets are half-open `[start, end)` so an
 * event on a boundary belongs to exactly one bucket.
 */

export type TimeBucket = { start: number; end: number }

/** Even time buckets across `[start, end)`; empty when the range is degenerate. */
export function timeBuckets(start: number, end: number, count: number): TimeBucket[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || count <= 0) return []
  const span = (end - start) / count
  return Array.from({ length: count }, (_, i) => ({
    start: start + i * span,
    end: i === count - 1 ? end : start + (i + 1) * span,
  }))
}

/**
 * Count events by kind per time bucket. Returns one map per bucket in order;
 * events outside the range are dropped.
 */
export function bucketEvents<T extends string>(
  events: readonly { at: number; kind: T }[],
  start: number,
  end: number,
  count: number,
): Array<Map<T, number>> {
  const buckets = timeBuckets(start, end, count)
  const result = buckets.map(() => new Map<T, number>())
  if (buckets.length === 0) return result
  const span = (end - start) / count
  for (const event of events) {
    if (!Number.isFinite(event.at) || event.at < start || event.at >= end) continue
    const index = Math.min(count - 1, Math.floor((event.at - start) / span))
    const bucket = result[index]!
    bucket.set(event.kind, (bucket.get(event.kind) ?? 0) + 1)
  }
  return result
}

/** A proportional bar of `width` cells; `max <= 0` paints the empty track. */
export function barCells(value: number, max: number, width: number, full = "█", empty = "░"): string {
  if (width <= 0) return ""
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return empty.repeat(width)
  const ratio = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(ratio * width)
  return full.repeat(filled) + empty.repeat(width - filled)
}

/** Total of a bucket map — the histogram bar height, regardless of kinds. */
export function bucketTotal(bucket: ReadonlyMap<string, number>): number {
  let total = 0
  for (const count of bucket.values()) total += count
  return total
}
