/**
 * Prompt chrome — compact Arcana run input.
 * The input is treated as an execution control surface.
 */
import { useTheme } from "../../context/theme"
import { ArcanaDitherBand, arcanaDitherPattern } from "../../ui/arcana"
import type { JSX } from "solid-js"

export type PromptMode = "intent" | "command" | "seal"

export function promptModeLabel(mode: PromptMode, model?: string, agent?: string): { left: string; right: string } {
  switch (mode) {
    case "intent":
      return { left: "intent", right: [model, agent].filter(Boolean).join(" / ") || "build" }
    case "command":
      return { left: "command", right: "local / direct" }
    case "seal":
      return { left: "seal", right: "protected / requires enter" }
  }
}

export function PromptChrome(props: {
  mode: PromptMode
  model?: string
  agent?: string
  children: JSX.Element
}) {
  const { theme } = useTheme()
  const { left, right } = promptModeLabel(props.mode, props.model, props.agent)

  return (
    <box
      backgroundColor={theme.background}
      gap={0}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>
          {arcanaDitherPattern(left, 8)} {left.toUpperCase()}
        </text>
        <text fg={theme.textMuted}>{right}</text>
      </box>

      <box paddingBottom={0}>
        {props.children}
      </box>

      <box flexDirection="row" justifyContent="space-between">
        <ArcanaDitherBand seed={`prompt-${props.mode}`} label="run input" length={24} />
        <text fg={theme.textMuted}>tab agents / esc clear</text>
      </box>
    </box>
  )
}
