import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { projectInsightCard } from "./spine-insight"
import { SpineInsightCard } from "./spine-insight-card"
import { FACT_LABEL_WIDTH } from "./spine-chrome"
import { truncate } from "../../util/locale"

/** Renders CLI table output as stacked key/value rows instead of raw terminal
 *  tables — avoids clipping and overflow at narrow TUI widths. */
export function SpineListArtifact(props: {
  headers: string[]
  rows: string[][]
  focused?: boolean
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const hasMultiRow = props.rows.length > 1
  const insight = createMemo(() => projectInsightCard({ table: { headers: props.headers, rows: props.rows } }))

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      <Show when={insight()}>
        {(card) => <SpineInsightCard card={card()} focused={props.focused} contentWidth={props.contentWidth} />}
      </Show>
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
                  <box width={FACT_LABEL_WIDTH} flexShrink={0}>
                    <text fg={theme.spineContext} wrapMode="none">
                      {truncate(props.headers[ci()] ?? "", FACT_LABEL_WIDTH)}
                    </text>
                  </box>
                  <text fg={theme.text} wrapMode="word" flexGrow={1} minWidth={0}>
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
