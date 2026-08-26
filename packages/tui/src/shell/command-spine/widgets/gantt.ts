import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"
import type { ColorInput } from "@opentui/core"
import { parseGantt } from "./parse"
import type { GanttRow } from "./parse"
import type { WidgetPaletteInput } from "./palette"

const GRID = 60
const BAR_CHAR = "\u2501"
const GAP_CHAR = " "
const MIT_CHAR = "\u253f"
const OPEN_CHAR = "\u25b6"
const DONE_CHAR = "\u25cf"
const LABEL_MIN = 8
const LABEL_MAX = 24

interface Cell {
  char: string
  color?: ColorInput
}

interface Segment {
  text: string
  color?: ColorInput
}

/** Build GRID cells for one row: gap / severity bar / mit tick / end marker. */
function rowCells(
  row: GanttRow,
  palette: WidgetPaletteInput,
  winStart: number,
  cellMin: number,
): Cell[] {
  const cells: Cell[] = Array.from({ length: GRID }, () => ({ char: GAP_CHAR }))
  const startCell = clampCell(Math.floor((row.startMin - winStart) / cellMin))
  const isOpen = row.endMin === null
  const rawEnd = isOpen ? winStart + GRID * cellMin : row.endMin!
  const endCell = Math.max(startCell, clampCell(Math.floor((rawEnd - winStart) / cellMin)))

  const barColor =
    row.sev === 1 ? palette.sev1 : row.sev === 2 ? palette.sev2 : palette.sev3

  for (let i = startCell; i <= endCell; i++) {
    cells[i]!.char = BAR_CHAR
    cells[i]!.color = barColor
  }

  if (row.mitMin !== null) {
    const mitCell = Math.max(startCell, Math.min(endCell, clampCell(Math.floor((row.mitMin - winStart) / cellMin))))
    cells[mitCell]!.char = MIT_CHAR
    cells[mitCell]!.color = palette.mit
  }

  if (isOpen && endCell >= startCell) {
    cells[endCell]!.char = OPEN_CHAR
    cells[endCell]!.color = palette.open
  }

  return cells
}

function clampCell(cell: number): number {
  return Math.max(0, Math.min(GRID - 1, cell))
}

/** Merge adjacent cells with identical style into straight run segments. */
function mergeCells(cells: Cell[]): Segment[] {
  const segments: Segment[] = []
  let buf = ""
  let bufColor: ColorInput | undefined
  let started = false

  const flush = () => {
    if (!started || buf.length === 0) return
    const last = segments[segments.length - 1]
    if (last && sameColor(last.color, bufColor)) last.text += buf
    else segments.push({ text: buf, color: bufColor })
    buf = ""
  }

  for (const cell of cells) {
    if (!sameColor(cell.color, bufColor)) {
      flush()
      bufColor = cell.color
      started = true
    }
    buf += cell.char
  }
  flush()
  return segments
}

function sameColor(a: ColorInput | undefined, b: ColorInput | undefined): boolean {
  return a === b
}

function fmtClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function fmtSpan(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${Math.round(minutes)}m`
}

export function ganttWidget(
  renderer: CliRenderer,
  palette: WidgetPaletteInput,
  source: string,
): BoxRenderable {
  const parsed = parseGantt(source)

  let winStart = parsed.window?.startMin ?? -1
  let spanMin = parsed.window?.spanMin ?? -1
  if (winStart < 0 || spanMin <= 0) {
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const row of parsed.rows) {
      min = Math.min(min, row.startMin)
      max = Math.max(max, row.endMin ?? 24 * 60)
    }
    if (!Number.isFinite(min)) min = 0
    if (max <= min) max = min + 60
    winStart = Math.floor(min / 60) * 60
    spanMin = max - winStart
  }
  const cellMin = spanMin / GRID

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
  })

  root.add(
    new TextRenderable(renderer, {
      content: `GANTT ${fmtClock(winStart)} +${fmtSpan(spanMin)}`,
      fg: palette.muted,
    }),
  )

  const labelWidth = Math.min(
    LABEL_MAX,
    Math.max(LABEL_MIN, ...parsed.rows.map((r) => r.label.length)),
  )

  for (const row of parsed.rows) {
    const line = new BoxRenderable(renderer, {
      flexDirection: "row",
      width: "100%",
    })

    line.add(
      new TextRenderable(renderer, {
        content: row.label.slice(0, LABEL_MAX).padEnd(labelWidth, " ") + " ",
        fg: row.sla ? palette.warn : palette.muted,
        width: labelWidth + 1,
      }),
    )

    for (const seg of mergeCells(rowCells(row, palette, winStart, cellMin))) {
      line.add(new TextRenderable(renderer, { content: seg.text, fg: seg.color }))
    }

    root.add(line)
  }

  for (const bad of parsed.badLines.slice(0, 3)) {
    root.add(
      new TextRenderable(renderer, {
        content: `? ${bad.trim().slice(0, 48)}`,
        fg: palette.warn,
      }),
    )
  }
  if (parsed.rows.length > 0) {
    root.add(
      new TextRenderable(renderer, {
        content: "— S1 red · S2 amber · S3 blue · ┿ mitigated · ▶ open",
        fg: palette.muted,
      }),
    )
  }

  return root
}
