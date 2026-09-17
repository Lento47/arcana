import { For } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { bigDigits } from "./digits"

/** Block-digit headline text: three rows, one ink. */
export function Digits(props: { text: string; fg?: RGBA }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" minWidth={0}>
      <For each={bigDigits(props.text)}>
        {(row) => (
          <text fg={props.fg ?? theme.text} wrapMode="none">
            {row}
          </text>
        )}
      </For>
    </box>
  )
}
