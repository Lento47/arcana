import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import { RAIL } from "../chrome"
import type { MapCell } from "./minimap"

/**
 * The map strip: one narrow column of cells beside the transcript. Mark cells
 * carry the warning ink, dense cells the context ink, and the viewport
 * bracket draws a continuous thumb — `┃` where the slice has no ink, the
 * density glyph tinted primary where it has — so "where am I" survives the
 * empty stretches a short transcript leaves between messages.
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
    if (cell.tone === "mark") return theme.warning
    if (inBracket(row)) return theme.primary
    if (cell.tone === "strong") return theme.spineContext
    if (cell.tone === "ink") return theme.borderSubtle
    return theme.background
  }
  // The thumb must be visible on its own: an empty bracket row draws the rail
  // glyph, an inked one keeps its density and takes the primary tint.
  const glyph = (cell: MapCell, row: number) =>
    inBracket(row) && cell.tone === "empty" ? RAIL : cell.glyph
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
