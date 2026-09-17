import { Show, type JSX, type ParentProps } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { TextAttributes } from "@opentui/core"
import { Frame } from "../frame"
import { Space } from "../chrome"

/**
 * The kit's titled surface. Same frame vocabulary as dialogs and gates, a
 * bold title, an optional footer row. Used by seals, receipts, and the
 * expanded subagent card.
 */
export function Card(props: ParentProps<{
  title?: string
  /** Frame ink; defaults to the quiet hairline tone. */
  tone?: RGBA
  background?: RGBA
  footer?: JSX.Element
}>) {
  const { theme } = useTheme()
  return (
    <Frame tone={props.tone ?? theme.borderSubtle} background={props.background ?? theme.backgroundPanel} padX={Space.padX}>
      <Show when={props.title}>
        <text attributes={TextAttributes.BOLD} fg={theme.text} wrapMode="none">
          {props.title}
        </text>
      </Show>
      <box flexDirection="column" paddingTop={props.title ? Space.padY : 0} minWidth={0}>
        {props.children}
      </box>
      <Show when={props.footer}>
        <box flexDirection="row" justifyContent="flex-end" paddingTop={Space.padY} minWidth={0}>
          {props.footer}
        </box>
      </Show>
    </Frame>
  )
}
