import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { MapCell } from "./minimap"

/** Every content cell is one flat tick; the tone (colour) carries meaning. */
const TICK = "▐"
/** The viewport's slice, drawn solid so it reads as a scrollbar thumb. */
const THUMB = "█"

/**
 * The map strip: one narrow column of ticks beside the transcript.
 *
 * The vocabulary is deliberately flat — density is one `▐` tick per row,
 * distinguished only by tone — because a one-column ramp of block glyphs reads
 * as confetti next to real content. Failures (`danger`), warnings, compactions
 * (`info`) and density are all the same shape in different inks, and the
 * visible slice is a single solid thumb, so the strip reads as a scrollbar and
 * not as a second transcript.
 */
export function Minimap(props: {
  cells: readonly MapCell[]
  /** Inclusive map-row bracket of the visible slice, when known. */
  bracket?: { from: number; to: number }
  onJump?: (row: number) => void
}) {
  const { theme } = useTheme()
  const inBracket = (row: number) =>
    props.bracket ? row >= props.bracket.from && row <= props.bracket.to : false
  const ink = (cell: MapCell, row: number) => {
    if (inBracket(row)) return theme.primary
    switch (cell.tone) {
      case "danger":
        return theme.spineFail
      case "warn":
        return theme.warning
      case "info":
        return theme.spineBrand
      case "strong":
        return theme.spineContext
      case "ink":
        return theme.borderSubtle
      default:
        return theme.background
    }
  }
  // The thumb is solid: the slice it marks is already visible in the
  // transcript, so the map has nothing more to say about those rows.
  const glyph = (cell: MapCell, row: number) =>
    inBracket(row) ? THUMB : cell.tone === "empty" ? " " : TICK
  return (
    <box flexDirection="column" flexShrink={0} minWidth={1} width={1}>
      <For each={props.cells}>
        {(cell, row) => (
          <text
            fg={ink(cell, row())}
            bg={theme.background}
            wrapMode="none"
            onMouseUp={props.onJump ? () => props.onJump!(row()) : undefined}
          >
            {glyph(cell, row())}
          </text>
        )}
      </For>
    </box>
  )
}
