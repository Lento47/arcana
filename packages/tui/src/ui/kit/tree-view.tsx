import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import { Glyph } from "../../branding"
import type { TreeRow } from "./tree"

/**
 * The kit's tree: connector rails, disclosure markers for rows with children,
 * warning ink for marks. Rows are text; clicking a parent row toggles it.
 */
export function Tree(props: {
  rows: readonly TreeRow[]
  onToggle?: (id: string) => void
  labelWidth?: number
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" minWidth={0}>
      <For each={props.rows}>
        {(row) => (
          <box
            flexDirection="row"
            minWidth={0}
            onMouseUp={
              props.onToggle && row.hasChildren
                ? (event) => {
                    event.stopPropagation?.()
                    props.onToggle!(row.id)
                  }
                : undefined
            }
          >
            <text fg={theme.borderSubtle} wrapMode="none" flexShrink={0}>
              {row.rail}
            </text>
            <text fg={theme.spineContext} wrapMode="none" flexShrink={0}>
              {row.hasChildren ? (row.expanded ? `${Glyph.chevronOpen} ` : `${Glyph.chevronClosed} `) : ""}
            </text>
            {row.mark ? (
              <text fg={theme.warning} wrapMode="none" flexShrink={0}>
                {`${row.mark} `}
              </text>
            ) : null}
            <text fg={theme.text} wrapMode="none" flexShrink={1} overflow="hidden">
              {row.label}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
