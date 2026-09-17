import { RGBA, TextAttributes } from "@opentui/core"
import { Show, type ParentProps } from "solid-js"
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
 * The dismissal's text exactly as `DialogCloseHint` draws it.
 *
 * Exported because a row that spends its columns on a budget has to reserve the
 * *real* width of the affordance it draws — reserving a floor instead is how a
 * row ends up one column over and loses the space rather than the last letter.
 * The artifact overlay's header measures this to decide whether its readout
 * still fits.
 *
 * It is also why `[esc]` is typed here and nowhere else: the key is this
 * module's to spell, and a second copy is a second thing to keep in sync.
 */
export function dialogCloseLabel(label?: string): string {
  return `[esc] ${label ?? COPY.dialog.close}`
}

/**
 * The `[esc] <verb>` dismissal. Always the same shape so the affordance is
 * learnable across every dialog; only the verb varies with what closing means.
 *
 * `background` is for a dialog that paints a surface behind its own chrome (the
 * retry card's panel overlay): the hint has to sit on that surface like the
 * rest of the row rather than punch a hole in it.
 *
 * `flexShrink={0}` keeps it from being shrunk and `wrapMode="none"` keeps it
 * from being wrapped — the same invariant as the title row, for the same
 * reason: a two-row hint is a taller card, and `[esc]` on a row of its own is
 * no longer the dismissal it was spelling.
 */
export function DialogCloseHint(props: { onClose: () => void; label?: string; background?: RGBA }) {
  const { theme } = useTheme()
  return (
    <text
      fg={theme.textMuted}
      bg={props.background}
      flexShrink={0}
      wrapMode="none"
      onMouseUp={props.onClose}
    >
      {dialogCloseLabel(props.label)}
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

/**
 * Header for the full-bleed panels that own the whole card — the approval and
 * permission inspectors, the acts timeline: a title row with a hairline under
 * it, spanning the card edge to edge rather than sitting inside `DialogColumn`.
 *
 * Three panels hand-rolled this row and all three drew the hairline *through*
 * the title. `border={["bottom"]}` on a box with `height={1}` has no row of its
 * own to sit on, so it is painted along the row the text occupies: every gap,
 * every cell of padding and every column the layout left empty came out as `─`,
 * which reads as a strikethrough with the title punched out of it. The height is
 * therefore not set — the row sizes to its content and the border lands under it,
 * which is the two-row header these panels always meant to have.
 *
 * The row is also a single-row readout, and the three copies each let it wrap:
 * at a narrow card the title and the detail stacked into a second row (taller
 * than the box, so it was clipped) and the `[esc]` hint was pushed off the card
 * entirely. Everything here is `wrapMode="none"` and the title carries a
 * truncation mark.
 *
 * Title and detail are one text node, not two in a row. Two nodes each carrying
 * their own truncation fuse when the card is squeezed: a 44-column card printed
 * `△ PERMIS...INSPECTORco...pt`, because the column the row's `gap` reserved got
 * spent absorbing the shrink and both labels closed over it — two words with no
 * mark between them. Inside one node the separator is a literal space, so a
 * truncated header can lose the middle of either label but never the boundary,
 * and there is a single elision to read instead of two.
 *
 * One node also means one thing to shrink, so the row can never be
 * over-subscribed: at any width the title yields first and the dismissal stays.
 * `DialogTitleRow` states the same rule for the card dialogs.
 */
export function DialogPanelHeader(props: {
  /** The panel's name. Upper-case is the panels' own convention, not enforced. */
  title: string
  /** Title ink — `theme.warning` on a decision surface, `theme.primary` elsewhere. */
  titleColor?: RGBA
  /** Mark drawn against the title, sharing its ink: `Glyph.attention` on a gate. */
  mark?: string
  /** Secondary segment beside the title — the state or scope on show. */
  detail?: string
  onClose: () => void
  closeLabel?: string
}) {
  const { theme } = useTheme()
  return (
    <box
      width="100%"
      minWidth={0}
      paddingLeft={Space.padX}
      paddingRight={Space.padX}
      backgroundColor={theme.backgroundPanel}
      border={["bottom"]}
      borderColor={theme.borderSubtle}
      flexDirection="row"
      gap={Space.gap}
    >
      <text
        fg={props.titleColor ?? theme.text}
        attributes={TextAttributes.BOLD}
        wrapMode="none"
        overflow="hidden"
        truncate
        flexShrink={1}
      >
        {props.mark ? `${props.mark} ${props.title}` : props.title}
        <Show when={props.detail}>{(detail) => <span style={{ fg: theme.textMuted }}>{` ${detail()}`}</span>}</Show>
      </text>
      <box flexGrow={1} minWidth={0} />
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
      {/* The glyph and the label: the glyph is the toggle's state and the label
          is its name, so the row is reserved against both and the label clips
          rather than the tick vanishing out of its cell. */}
      <text fg={props.active ? theme.primary : theme.textMuted} wrapMode="none" flexShrink={0}>
        {props.checked ? Glyph.checked : Glyph.unchecked}
      </text>
      <text fg={props.active ? theme.primary : theme.text} wrapMode="none" flexShrink={1} overflow="hidden">
        {props.label}
      </text>
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
