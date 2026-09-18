import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { MapCell } from "./minimap"

/** Every cell is the same hairline tick; the visible slice is told apart by ink. */
const TICK = "▕"

/**
 * The map strip: one hairline column beside the transcript.
 *
 * Everything is deliberately thin and flat — a right-eighth `▕` tick per row,
 * distinguished only by tone — because a one-column ramp of block glyphs reads
 * as confetti next to real content. The visible slice is the *same* hairline in
 * the primary ink (never a wider glyph: a thicker thumb reads as a second bar
 * stacked beside the strip), and failures/warnings/compactions are the same
 * hairline in their own inks.
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
  // The slice draws the tick even where its row is empty, so the thumb is a
  // continuous hairline; only ink separates it from the content ticks.
  const glyph = (cell: MapCell, row: number) =>
    cell.tone === "empty" && !inBracket(row) ? " " : TICK
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
