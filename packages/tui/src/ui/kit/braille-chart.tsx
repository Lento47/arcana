import { For } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { brailleSeries } from "./braille"

/**
 * A braille line/area chart. Values scale against their maximum with a zero
 * baseline; the newest sample is the rightmost column. Rendering is plain
 * text rows, so the chart composes into dialogs and cards without a canvas.
 */
export function BrailleChart(props: {
  values: readonly number[]
  width: number
  height: number
  /** Fill below the line (an area read for pressure/gauges). */
  fill?: boolean
  fg?: RGBA
}) {
  const { theme } = useTheme()
  const rows = () => brailleSeries(props.values, props.width, props.height, { fill: props.fill })
  return (
    <box flexDirection="column" minWidth={0}>
      <For each={rows()}>
        {(row) => (
          <text fg={props.fg ?? theme.spineOk} wrapMode="none">
            {row}
          </text>
        )}
      </For>
    </box>
  )
}
