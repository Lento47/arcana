import { RGBA, TextAttributes } from "@opentui/core"
import type { ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { selectedForeground } from "../theme"
import { contrastingInk } from "../theme/contrast"
import { COPY, Glyph } from "../branding"
import { Space } from "./chrome"

/**
 * Shared anatomy for the dialog family.
 *
 * Sixteen dialogs hand-roll the same three pieces — a title row with a
 * right-aligned `[esc] <verb>`, an inset body, and a right-aligned action row —
 * and they had drifted apart: the body inset was 2 columns while the buttons
 * under it were padded 1 in one dialog and 3 in another, and the escape verb was
 * spelled three ways (cancel / dismiss / close). This module is the one
 * definition of that anatomy.
 *
 * Deliberately **not** a frame that owns the body. `ui/dialog.tsx` already owns
 * width, maxHeight, border, overflow and the scrolling body, and the feature
 * dialogs have genuinely different bodies (a textarea, a selection list, a diff,
 * a preformatted report). Only the scaffold is shared.
 *
 * Spacing reads from `Space` (`ui/chrome.ts`) so the scale moves from one place.
 */

/**
 * The family's inset container: horizontal padding plus the vertical rhythm
 * between title, body and footer.
 *
 * `padBottom` is for a dialog that ends in *content* rather than an action row
 * (a report, a status list): the card itself carries only a top inset, so
 * without it the last line sits flush against the bottom border. Dialogs that
 * end in a `DialogFooter` or a hint row already pad themselves and leave this
 * off.
 */
export function DialogColumn(props: ParentProps<{ gap?: number; padBottom?: boolean }>) {
  return (
    <box
      width="100%"
      minWidth={0}
      minHeight={0}
      paddingLeft={Space.padX}
      paddingRight={Space.padX}
      paddingBottom={props.padBottom ? Space.padY : undefined}
      gap={props.gap ?? Space.gap}
    >
      {props.children}
    </box>
  )
}

/**
 * The `[esc] <verb>` dismissal. Always the same shape so the affordance is
 * learnable across every dialog; only the verb varies with what closing means.
 *
 * `background` is for a dialog that paints a surface behind its own chrome (the
 * retry card's panel overlay): the hint has to sit on that surface like the
 * rest of the row rather than punch a hole in it.
 */
export function DialogCloseHint(props: { onClose: () => void; label?: string; background?: RGBA }) {
  const { theme } = useTheme()
  return (
    <text fg={theme.textMuted} bg={props.background} flexShrink={0} onMouseUp={props.onClose}>
      [esc] {props.label ?? COPY.dialog.close}
    </text>
  )
}

/**
 * Title row: the dialog's name on the left, dismissal on the right. The title
 * shrinks and clips before the hint does — the escape affordance must never be
 * the thing that gets pushed off a narrow card.
 */
export function DialogTitleRow(props: { title: string; onClose: () => void; closeLabel?: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" justifyContent="space-between" minWidth={0}>
      <text
        attributes={TextAttributes.BOLD}
        fg={theme.text}
        flexShrink={1}
        overflow="hidden"
        wrapMode="none"
      >
        {props.title}
      </text>
      <DialogCloseHint onClose={props.onClose} label={props.closeLabel} />
    </box>
  )
}

/** Body stack — same inset and rhythm as the column, one level in. */
export function DialogBody(props: ParentProps<{ gap?: number }>) {
  return (
    <box width="100%" minWidth={0} gap={props.gap ?? Space.gap}>
      {props.children}
    </box>
  )
}

/** Right-aligned action row, bottom-padded so the card's edge never crowds it. */
export function DialogFooter(props: ParentProps) {
  return (
    <box
      flexDirection="row"
      justifyContent="flex-end"
      gap={Space.gapWide}
      paddingBottom={Space.padY}
    >
      {props.children}
    </box>
  )
}

/**
 * A toggle row: box glyph, then its label.
 *
 * The glyph cell is fixed-width (`Glyph.checked`/`Glyph.unchecked` are the same
 * length), so toggling never shifts the label sideways — a one-column jitter
 * that reads as a rendering fault.
 */
export function DialogOptionRow(props: {
  label: string
  checked: boolean
  active: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <box
      flexDirection="row"
      gap={Space.gapWide}
      paddingLeft={Space.gap}
      backgroundColor={props.active ? theme.backgroundElement : undefined}
      onMouseUp={props.onPress}
    >
      <text fg={props.active ? theme.primary : theme.textMuted}>
        {props.checked ? Glyph.checked : Glyph.unchecked}
      </text>
      <text fg={props.active ? theme.primary : theme.text}>{props.label}</text>
    </box>
  )
}

/**
 * A pressable dialog button.
 *
 * `active` paints the fill; `destructive` swaps the fill from the accent to
 * `theme.error`, so a confirm that deletes something reads as consequential at a
 * glance rather than looking like every other confirm (interface guideline:
 * destructive actions must be distinguishable before they are pressed).
 *
 * Ink is derived, never hardcoded: `selectedForeground` for the accent fill and
 * `contrastingInk` (max-contrast, not polarity) for the error fill, so a custom
 * palette cannot produce unreadable button text.
 */
export function DialogButton(props: {
  label: string
  /** Focused/selected button in its row. */
  active?: boolean
  /** Consequential action — fills with `theme.error` when active. */
  destructive?: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  // Read the theme through closures rather than capturing at call time: a theme
  // switch must repaint without remounting the dialog.
  const background = () => {
    if (!props.active) return undefined
    return props.destructive ? theme.error : theme.primary
  }
  const foreground = () => {
    const fill = background()
    if (fill) return props.destructive ? contrastingInk(fill) : selectedForeground(theme)
    // A destructive action stays visibly consequential even unfocused, so the
    // consequence is legible before the button is reached, not only after.
    return props.destructive ? theme.error : theme.textMuted
  }
  return (
    <box
      paddingLeft={Space.padX}
      paddingRight={Space.padX}
      backgroundColor={background()}
      flexShrink={0}
      onMouseUp={props.onPress}
    >
      <text fg={foreground()}>{props.label}</text>
    </box>
  )
}
