import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"
import { layoutFlowchart, type MermaidCell } from "./mermaid-layout"
import { parseMermaid } from "./mermaid-parse"
import type { WidgetPaletteInput } from "./palette"

/** Merge same-tone runs so a canvas row mounts as a few spans, not N cells. */
function mergeToneRuns(cells: MermaidCell[]): Array<{ text: string; tone: MermaidCell["tone"] }> {
  const segments: Array<{ text: string; tone: MermaidCell["tone"] }> = []
  let buf = ""
  let bufTone: MermaidCell["tone"] = "edge"
  let started = false
  const flush = () => {
    if (!started || buf.length === 0) return
    const last = segments[segments.length - 1]
    if (last && last.tone === bufTone) last.text += buf
    else segments.push({ text: buf, tone: bufTone })
    buf = ""
  }
  for (const cell of cells) {
    if (!started || cell.tone !== bufTone) {
      flush()
      bufTone = cell.tone
      started = true
    }
    buf += cell.ch
  }
  flush()
  return segments
}

const toneColor = (tone: MermaidCell["tone"], palette: WidgetPaletteInput) =>
  tone === "muted" ? palette.muted : undefined

/**
 * ` ```mermaid ` fence → box-drawing flowchart. Anything the parser declines
 * (non-graph diagrams, empty input, oversized graphs, layout overflow)
 * returns `undefined` so the fence falls back to a plain code block — a
 * widget must never be the reason a diagram disappears.
 */
export function mermaidWidget(
  renderer: CliRenderer,
  palette: WidgetPaletteInput,
  source: string,
): BoxRenderable | undefined {
  const parsed = parseMermaid(source)
  if (parsed.type !== "flowchart") return undefined
  const laidOut = layoutFlowchart(parsed)
  if (!laidOut) return undefined

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
  })
  root.add(
    new TextRenderable(renderer, {
      content: `MERMAID graph ${parsed.direction} · ${parsed.nodes.length} node${parsed.nodes.length === 1 ? "" : "s"}`,
      fg: palette.muted,
    }),
  )

  for (const row of laidOut.canvas.rows) {
    const line = new BoxRenderable(renderer, {
      flexDirection: "row",
      width: "100%",
    })
    const segments = mergeToneRuns(row)
    if (segments.length === 0) {
      line.add(new TextRenderable(renderer, { content: " " }))
    } else {
      for (const seg of segments) {
        line.add(new TextRenderable(renderer, { content: seg.text || " ", fg: toneColor(seg.tone, palette) }))
      }
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
  for (const dropped of laidOut.dropped.slice(0, 3)) {
    root.add(
      new TextRenderable(renderer, {
        content: `? ${dropped.slice(0, 48)} (routing overflow)`,
        fg: palette.warn,
      }),
    )
  }
  return root
}
