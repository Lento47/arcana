import { Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { spineTone, type SpineKind, type SpineLayout } from "./spine-types"

export function SpineNode(props: { kind: SpineKind; summary: string; layout: SpineLayout }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const tone = spineTone(props.kind, t)

  if (!props.summary) return null

  return (
    <box flexDirection="row">
      <Show when={props.layout !== "minimal"}>
        <text fg={tone as any}>{props.kind} </text>
      </Show>
      <text fg={t.text as any} wrapMode="word">
        {props.summary}
      </text>
    </box>
  )
}
