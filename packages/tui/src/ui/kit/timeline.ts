/**
 * Timeline/waterfall math (lnav/Perfetto parity).
 *
 * One row per lane, one column per time slice. Spans paint a run of cells;
 * marks paint a single cell and always win over a span — a decision gets a
 * glyph even when it lands inside a tool's span.
 */

export type TimelineSpan = { lane: string; start: number; end: number; kind: string }
export type TimelineMark = { lane: string; at: number; kind: string; glyph: string }
export type TimelineCell = { kind: string; glyph: string }

/** Stable lane order: explicit order first, then first appearance. */
export function timelineLanes(input: {
  spans: readonly TimelineSpan[]
  marks: readonly TimelineMark[]
  order?: readonly string[]
}): string[] {
  const seen = new Set<string>()
  const lanes: string[] = []
  const push = (lane: string) => {
    if (seen.has(lane)) return
    seen.add(lane)
    lanes.push(lane)
  }
  for (const lane of input.order ?? []) push(lane)
  for (const span of input.spans) push(span.lane)
  for (const mark of input.marks) push(mark.lane)
  return lanes
}

/** Rows of cells (lane-major). `null` is an empty slice. */
export function timelineCells(input: {
  spans: readonly TimelineSpan[]
  marks: readonly TimelineMark[]
  lanes: readonly string[]
  start: number
  end: number
  width: number
}): Array<Array<TimelineCell | null>> {
  const rows = input.lanes.map(() =>
    Array.from({ length: Math.max(0, input.width) }, () => null as TimelineCell | null),
  )
  if (input.width <= 0 || input.lanes.length === 0 || !(input.end > input.start)) return rows
  const columnOf = (at: number) =>
    Math.max(0, Math.min(input.width - 1, Math.floor(((at - input.start) / (input.end - input.start)) * input.width)))
  for (const span of input.spans) {
    const lane = input.lanes.indexOf(span.lane)
    if (lane < 0) continue
    const start = Math.max(span.start, input.start)
    const end = Math.min(span.end, input.end)
    if (end < start) continue
    for (let column = columnOf(start); column <= columnOf(end); column++) {
      rows[lane]![column] = { kind: span.kind, glyph: "─" }
    }
  }
  for (const mark of input.marks) {
    const lane = input.lanes.indexOf(mark.lane)
    if (lane < 0 || !Number.isFinite(mark.at) || mark.at < input.start || mark.at > input.end) continue
    rows[lane]![columnOf(mark.at)] = { kind: mark.kind, glyph: mark.glyph }
  }
  return rows
}
