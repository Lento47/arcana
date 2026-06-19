/**
 * Prompt chrome — three-mode RoundBorder frame for input area.
 * "intent" (chat), "command" (slash), "seal" (approval).
 * Same component, different label = product consistency.
 */
import { Glyph } from "../../branding"
import { RoundBorder } from "../../ui/chrome"
import { useTheme } from "../../context/theme"
import { TextAttributes } from "@opentui/core"
import type { JSX } from "solid-js"

export type PromptMode = "intent" | "command" | "seal"

export function promptModeLabel(mode: PromptMode, model?: string, agent?: string): { left: string; right: string } {
  switch (mode) {
    case "intent":
      return { left: "intent", right: [model, agent].filter(Boolean).join(" ◆ ") || "build" }
    case "command":
      return { left: "command", right: "local ◆ direct" }
    case "seal":
      return { left: "seal", right: "protected ◆ requires enter" }
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
      border={["top", "bottom", "left", "right"]}
      customBorderChars={RoundBorder}
      borderColor={theme.borderSubtle}
      backgroundColor={theme.background}
      gap={0}
    >
      {/* Top border line with label + context */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>{` ${left} `}</text>
        <text fg={theme.textMuted}>{` ${right} `}</text>
      </box>

      {/* Input content */}
      <box paddingLeft={1} paddingRight={1} paddingBottom={0}>
        {props.children}
      </box>

      {/* Bottom border line with hint */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>{Glyph.bullet} agents:tab</text>
        <text fg={theme.textMuted}>esc clear</text>
      </box>
    </box>
  )
}
