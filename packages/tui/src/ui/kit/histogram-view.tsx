import { For } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { stackCells } from "./bars"

/**
 * Stacked bars over time buckets, one column per bucket. Kinds read bottom →
 * top; unknown kinds fall back to the context ink. Empty cells are blank, so a
 * quiet stretch is quiet.
 */
export function Histogram(props: {
  buckets: readonly (ReadonlyMap<string, number>)[]
  /** Rows of bar height. */
  height?: number
  /** Kind order, bottom → top. */
  order: readonly string[]
  /** Kind → ink. */
  colors: Readonly<Record<string, RGBA>>
}) {
  const { theme } = useTheme()
  const rows = () => stackCells(props.buckets, props.height ?? 5, props.order)
  return (
    <box flexDirection="column" minWidth={0}>
      <For each={rows()}>
        {(row) => (
          <text wrapMode="none">
            <For each={row}>
              {(kind) => (
                <span style={{ fg: kind ? (props.colors[kind] ?? theme.spineContext) : theme.background }}>
                  {kind ? "█" : " "}
                </span>
              )}
            </For>
          </text>
        )}
      </For>
    </box>
  )
}
