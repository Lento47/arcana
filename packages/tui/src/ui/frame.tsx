import type { RGBA } from "@opentui/core"
import type { ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { FrameBorder, RoundBorder } from "./chrome"

/**
 * The one full box.
 *
 * Every surface that draws a border on all four sides — the dialog card, the
 * authority gate, the boot pill — states its shape, ink and fill here, so "a
 * frame" means one thing across the app instead of three hand-rolled
 * interfaces. The dialog family's panels (the approval and permission
 * inspectors) draw **no** private frame: the card in `ui/dialog.tsx` is the
 * frame, and `DialogPanelHeader` is its hairline.
 *
 * `shape` picks the border characters: `round` is the family default (the card,
 * the gate), `heavy` is the boot pill's cyberpunk chrome. `tone` defaults to
 * `borderActive` — the ink that means "this is a surface" — and a decision
 * surface passes its own state colour; `background` defaults to the panel tint.
 * Layout stays with the caller: a frame sets only the four-sided chrome, the
 * horizontal inset it is given, and that it sizes to its content.
 */
export function Frame(props: ParentProps<{
  shape?: "round" | "heavy"
  tone?: RGBA
  background?: RGBA
  /** Inner columns on both sides, for content that does not pad itself. */
  padX?: number
  /** Claim the container's height (full-bleed panels). */
  grow?: boolean
}>) {
  const { theme } = useTheme()
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      flexGrow={props.grow ? 1 : undefined}
      minWidth={0}
      border={true}
      customBorderChars={props.shape === "heavy" ? FrameBorder : RoundBorder}
      borderColor={props.tone ?? theme.borderActive}
      backgroundColor={props.background ?? theme.backgroundPanel}
      paddingLeft={props.padX}
      paddingRight={props.padX}
    >
      {props.children}
    </box>
  )
}
