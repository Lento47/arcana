import { For, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { TimelineCell } from "./timeline"

/**
 * The waterfall renderer: one text row per lane, optional fixed-width labels,
 * per-cell ink. Spans and marks already decided their glyphs in the math
 * module; this only paints.
 */
export function Waterfall(props: {
  rows: ReadonlyArray<ReadonlyArray<TimelineCell | null>>
  labels?: readonly string[]
  labelWidth?: number
  colors: Readonly<Record<string, RGBA>>
}) {
  const { theme } = useTheme()
  const labelWidth = () => props.labelWidth ?? 10
  return (
    <box flexDirection="column" minWidth={0}>
      <For each={props.rows}>
        {(row, index) => (
          <text wrapMode="none">
            <Show when={props.labels}>
              <span style={{ fg: theme.spineContext }}>
                {`${(props.labels?.[index()] ?? "").slice(0, labelWidth()).padEnd(labelWidth())} `}
              </span>
            </Show>
            <For each={row}>
              {(cell) => (
                <span
                  style={{
                    fg: cell ? (props.colors[cell.kind] ?? theme.spineContext) : theme.background,
                  }}
                >
                  {cell ? cell.glyph : " "}
                </span>
              )}
            </For>
          </text>
        )}
      </For>
    </box>
  )
}
