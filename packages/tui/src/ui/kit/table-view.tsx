import { createMemo, For } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { Space } from "../chrome"
import { cellWidths, fitCell, type Column } from "./table"

/**
 * A minimal data table: bold header, fixed columns, one selected row in the
 * accent with a quiet fill. Keyboard handling (up/down/enter) lives with the
 * dialog that owns the selection; this paints.
 */
export function Table<T>(props: {
  columns: readonly Column<T>[]
  rows: readonly T[]
  selected?: number
  onSelect?: (index: number) => void
  empty?: string
}) {
  const { theme } = useTheme()
  const widths = createMemo(() => cellWidths(props.columns, props.rows))

  return (
    <box flexDirection="column" minWidth={0}>
      <box flexDirection="row" gap={Space.gapWide} minWidth={0}>
        <For each={props.columns}>
          {(column, index) => (
            <text
              attributes={TextAttributes.BOLD}
              fg={theme.spineContext}
              wrapMode="none"
              flexShrink={0}
              width={widths()[index()]}
            >
              {fitCell(column.label, widths()[index()]!)}
            </text>
          )}
        </For>
      </box>
      <box border={["bottom"]} borderColor={theme.borderSubtle} marginBottom={Space.padY} />
      <For
        each={props.rows}
        fallback={
          <text fg={theme.textMuted}>{props.empty ?? "Nothing to show."}</text>
        }
      >
        {(row, index) => {
          const active = () => props.selected === index()
          return (
            <box
              flexDirection="row"
              gap={Space.gapWide}
              minWidth={0}
              backgroundColor={active() ? theme.backgroundElement : undefined}
              onMouseUp={
                props.onSelect
                  ? (event) => {
                      event.stopPropagation?.()
                      props.onSelect!(index())
                    }
                  : undefined
              }
            >
              <For each={props.columns}>
                {(column, columnIndex) => (
                  <text
                    fg={active() ? theme.primary : theme.text}
                    wrapMode="none"
                    flexShrink={0}
                    width={widths()[columnIndex()]}
                  >
                    {fitCell(column.value(row), widths()[columnIndex()]!)}
                  </text>
                )}
              </For>
            </box>
          )
        }}
      </For>
    </box>
  )
}
