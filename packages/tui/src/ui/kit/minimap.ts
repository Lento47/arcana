/**
 * Semantic minimap math (mini.map parity, entry-granular).
 *
 * The transcript's real line height lives in yoga, so the map is built from
 * top-level entries instead: one cell per slice of entries. Marks always win
 * over density — a failure or a decision must survive the compression — and
 * the density ramp keeps the shape of long stretches readable.
 */

export type MapEntry = { kind: string; mark?: string }
export type MapTone = "empty" | "ink" | "strong" | "mark"
export type MapCell = { glyph: string; tone: MapTone }

/** Mark priority inside a slice: the gravest mark survives compression. */
const MARK_PRIORITY = ["✗", "△", "┈", "✓", "◆"] as const

function pickMark(marks: readonly string[]): string | undefined {
  if (marks.length === 0) return undefined
  for (const candidate of MARK_PRIORITY) if (marks.includes(candidate)) return candidate
  return marks[0]
}

/** One cell per slice of entries; slices are contiguous and equal-sized. */
export function minimapRows(entries: readonly MapEntry[], rows: number): MapCell[] {
  if (rows <= 0) return []
  if (entries.length === 0) return Array.from({ length: rows }, () => ({ glyph: " ", tone: "empty" as const }))
  const cells: MapCell[] = []
  for (let row = 0; row < rows; row++) {
    const from = Math.floor((row * entries.length) / rows)
    const to = row === rows - 1 ? entries.length : Math.floor(((row + 1) * entries.length) / rows)
    const slice = entries.slice(from, to)
    if (slice.length === 0) {
      cells.push({ glyph: " ", tone: "empty" })
      continue
    }
    const mark = pickMark(slice.map((entry) => entry.mark).filter((value): value is string => Boolean(value)))
    if (mark) {
      cells.push({ glyph: mark, tone: "mark" })
      continue
    }
    const density = slice.length / Math.max(1, Math.ceil(entries.length / rows))
    cells.push({
      glyph: density > 0.66 ? "█" : density > 0.33 ? "▓" : "░",
      tone: density > 0.66 ? "strong" : "ink",
    })
  }
  return cells
}

/** The viewport's slice of the map, in map rows. */
export function viewportBracket(input: {
  rows: number
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
}): { from: number; to: number } {
  const rows = Math.max(0, Math.floor(input.rows))
  if (rows === 0 || !(input.scrollHeight > 0)) return { from: 0, to: -1 }
  const clamp = (value: number) => Math.max(0, Math.min(rows - 1, value))
  const from = clamp(Math.round((input.scrollTop / input.scrollHeight) * rows))
  const to = clamp(Math.round(((input.scrollTop + Math.max(0, input.viewportHeight)) / input.scrollHeight) * rows))
  return { from, to: Math.max(from, to) }
}

/**
 * Whether the transcript actually overflows its viewport.
 *
 * The map column only earns its cells when there is hidden content to map: a
 * short transcript used to draw a couple of lone density blocks in the gutter,
 * which reads as rendering noise, not a scrollbar. The margin keeps a one-row
 * slop (padding, a rounding row) from summoning the strip.
 */
export function minimapOverflows(input: {
  scrollHeight: number
  viewportHeight: number
  margin?: number
}): boolean {
  const margin = Math.max(0, input.margin ?? 2)
  if (!(input.viewportHeight > 0) || !(input.scrollHeight > 0)) return false
  return input.scrollHeight > input.viewportHeight + margin
}

/** Where clicking map row `row` should land the scrollbox. */
export function jumpScrollTop(input: {
  row: number
  rows: number
  scrollHeight: number
  viewportHeight: number
}): number {
  const rows = Math.max(1, Math.floor(input.rows))
  const max = Math.max(0, input.scrollHeight - Math.max(0, input.viewportHeight))
  if (max === 0) return 0
  const fraction = rows <= 1 ? 0 : Math.max(0, Math.min(1, input.row / (rows - 1)))
  return Math.round(fraction * max)
}
