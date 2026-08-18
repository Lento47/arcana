import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import "opentui-spinner/solid"

import { isSpinnerStyle, spinnerFrames } from "../util/spinner-style"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  // Explicit spinner_style wins; otherwise braille (the classic default).
  const style = () => {
    const stored = kv.get("spinner_style")
    return isSpinnerStyle(stored) ? stored : "braille"
  }
  const frames = () => spinnerFrames(style())
  return (
    <Show when={kv.get("animations_enabled", true) && style() !== "none"} fallback={<text fg={color()}>⋯ {props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={frames()} interval={80} color={color()} />
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}
