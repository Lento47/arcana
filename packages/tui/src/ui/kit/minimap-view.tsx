import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { MapCell } from "./minimap"

/**
 * The map strip: one narrow column of cells beside the transcript. Mark cells
 * carry the warning ink, dense cells the context ink, and the viewport
 * bracket inverts to the accent so "where am I" is always visible.
 */
export function Minimap(props: {
  cells: readonly MapCell[]
  /** Inclusive map-row bracket of the visible slice, when known. */
  bracket?: { from: number; to: number }
  onJump?: (row: number) => void
}) {
  const { theme } = useTheme()
  const ink = (cell: MapCell, row: number) => {
    if (cell.tone === "mark") return theme.warning
    const inBracket = props.bracket ? row >= props.bracket.from && row <= props.bracket.to : false
    if (inBracket) return theme.primary
    if (cell.tone === "strong") return theme.spineContext
    if (cell.tone === "ink") return theme.borderSubtle
    return theme.background
  }
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
            {cell.glyph}
          </text>
        )}
      </For>
    </box>
  )
}
