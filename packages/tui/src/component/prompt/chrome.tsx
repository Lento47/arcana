/**
 * Prompt chrome reference — Grok-like composer with Arcana retouches.
 *
 * Live command-spine rendering is inlined in `prompt/index.tsx` (OpenTUI
 * needs the textarea + focus bindings in one tree). This module documents the
 * visual contract and keeps the old dither chrome for any experimental use.
 *
 * Target (command-spine):
 * ```
 *   │
 *   ✶  ╭──────────────────────────────────╮
 *      │ ❯ Speak your intent…             │  ← Glyph.prompt; shell uses "! "
 *      │ deepseek-v4-flash-free · plan    │  ← model · flags (no brand / intent)
 *      ╰──────────────────────────────────╯
 * ```
 *
 * Arcana retouches: spine rail node (✶), RoundBorder, spine* colors,
 * rotating PLACEHOLDER voice, sigil only in non-spine shells.
 */
import { useTheme } from "../../context/theme"
import { Glyph } from "../../branding"
import { RoundBorder } from "../../ui/chrome"
import type { JSX } from "solid-js"

export type PromptMode = "intent" | "command" | "seal"

/** @deprecated Prefer decision-state meta (model · flags) over mode banners. */
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

/**
 * Lightweight bordered frame matching the Grok-inspired composer.
 * Prefer the integrated command-spine path in `Prompt` for real input.
 */
export function PromptChrome(props: {
  mode?: PromptMode
  model?: string
  agent?: string
  shell?: boolean
  children: JSX.Element
  footer?: JSX.Element
}) {
  const { theme } = useTheme()
  const border = () => (props.shell ? theme.primary : theme.spinePrompt)
  const prefix = () => (props.shell ? "! " : `${Glyph.prompt} `)

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      customBorderChars={RoundBorder}
      borderColor={border()}
      backgroundColor={theme.background}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <box flexDirection="row" width="100%">
        <text fg={border()}>{prefix()}</text>
        <box flexGrow={1} minWidth={0}>
          {props.children}
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" gap={1}>
        <text fg={theme.spineBrand}>
          {[props.agent, props.model].filter(Boolean).join(" · ") || "—"}
        </text>
        <ShowFooter footer={props.footer} />
      </box>
    </box>
  )
}

function ShowFooter(props: { footer?: JSX.Element }) {
  return props.footer ? <>{props.footer}</> : null
}
