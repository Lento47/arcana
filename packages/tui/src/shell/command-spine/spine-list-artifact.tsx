import { For } from "solid-js"
import { useTheme } from "../../context/theme"

/** Renders CLI table output as stacked key/value rows instead of raw terminal
 *  tables — avoids clipping and overflow at narrow TUI widths. */
export function SpineListArtifact(props: {
  headers: string[]
  rows: string[][]
  focused?: boolean
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const hasMultiRow = props.rows.length > 1

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      <For each={props.rows}>
        {(row, ri) => (
          <box
            flexDirection="column"
            flexShrink={0}
            minWidth={0}
            paddingTop={ri() > 0 && hasMultiRow ? 1 : 0}
            paddingBottom={1}
            paddingLeft={1}
          >
            <For each={row}>
              {(cell, ci) => (
                <box flexDirection="row" flexShrink={0} minWidth={0} gap={1}>
                  <text fg={(t.spineContext ?? t.textMuted) as any}>{props.headers[ci()] ?? ""}</text>
                  <text fg={t.text as any} wrapMode="word">
                    {cell || "—"}
                  </text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}
