import { RGBA, TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTerminalSize } from "../util/terminal-size"
import { Show, createMemo, createSignal, useContext } from "solid-js"
import { getScrollAcceleration } from "../util/scroll"
import { useClipboard } from "../context/clipboard"
import { InstallationVersion } from "@arcana/core/installation/version"
import { useExit } from "../context/exit"
import { APP_NAME, BUG_URL } from "../branding"
import { selectedForeground, ThemeContext, type Theme } from "../context/theme"
import { fallbackTheme } from "../theme"
import { arcanaDitherPattern } from "../ui/arcana"
import { Locale } from "../util/locale"
import { Space } from "../ui/chrome"

/**
 * The fatal screen's sentences and actions, named once so the words, the
 * buttons that carry them, and the measurement that decides whether they share
 * a row are the same facts.
 */
const SENTENCE_COPY = `${APP_NAME} encountered a fatal error and needs to restart.`
const SENTENCE_RESTART = `Press Reset TUI to restart, or Exit to close ${APP_NAME}.`
const BUTTON_COPY = "Copy Issue URL (Exception Info Pre-filled)"
/** The same action at its short spelling, for a terminal too narrow to carry
 *  the long one whole. Two whole labels, never a split one. */
const BUTTON_COPY_SHORT = "Copy issue URL"
const BUTTON_RESET = "Reset TUI"
const BUTTON_EXIT = "Exit"
const NOTE_COPIED = "Copied issue URL"
/**
 * A button's own padding, which its label sits inside. Horizontal only, and
 * that is load-bearing: the buttons are the only filled boxes on a screen that
 * is otherwise prose, and a filled box taller than one row paints its padding
 * rows into the row beneath it. Vertical padding turned each button into a
 * three-row slab whose bottom row landed on the "Technical Details" heading —
 * visible as an amber bar running behind the heading's text wherever the two
 * happened to overlap (`:` on the fill at 50 columns, blank runs at 100). One
 * row tall, the fill can only ever cover the row it is on.
 */
const BUTTON_PAD = 1

function buttonWidth(label: string) {
  return BUTTON_PAD * 2 + Locale.displayWidth(label)
}

/** The copy action plus the confirmation it prints in place. The confirmation
 *  is charged whether or not it is showing: a screen that restacks when the
 *  operator clicks the button that is meant to help them is worse than one that
 *  holds still, and the reservation is what keeps the decision above the click. */
const COPY_ACTIONS = buttonWidth(BUTTON_COPY) + Space.gap + Locale.displayWidth(NOTE_COPIED)
const RESTART_ACTIONS = buttonWidth(BUTTON_RESET) + Space.gapWide + buttonWidth(BUTTON_EXIT)

/**
 * The narrowest terminal that keeps a sentence and its actions on one row.
 *
 * Below it both rows stack — the sentence on its own line(s), the actions on a
 * row of their own against the right edge — which is why the two are decided
 * together rather than per row: a screen where the copy row has stacked and the
 * restart row has not reads as two unrelated layouts.
 *
 * Before this, every child of both rows was elastic. Yoga shared the deficit
 * between them instead of taking it out of the prose, and a button is not a
 * paragraph — a 60-column terminal printed `Reset` and `TUI` on separate lines
 * with `Exi` over `t` beside them, and at 50 the copy label came apart across
 * three lines inside its own fill: `Copy Issue URL ( / Exception Info Pre- /
 * filled)`. On the one screen where the operator is already having a bad day,
 * the two controls it offers were the part that stopped being readable.
 */
const INLINE_MIN = Math.max(
  Locale.displayWidth(SENTENCE_COPY) + Space.gap + COPY_ACTIONS,
  Locale.displayWidth(SENTENCE_RESTART) + Space.gapWide + RESTART_ACTIONS,
)

/**
 * Colors for the fatal screen. Prefers the mounted theme; outside a provider
 * (the crash that took the provider down with it, or a render test) it uses
 * the real `arcana` palette rather than a bespoke emergency set — a crash
 * screen is the worst place to discover the fallback colors drifted.
 */
function emergencyPalette(theme: Theme | undefined, mode?: "dark" | "light") {
  const source = theme ?? fallbackTheme(mode ?? "dark")
  return {
    bg: source.background,
    text: source.text,
    muted: source.textMuted,
    primary: source.primary,
    primaryText: selectedForeground(source, source.primary),
  }
}

export function ErrorComponent(props: { error: Error; reset: () => void; mode?: "dark" | "light" }) {
  const term = useTerminalSize(useRenderer())
  const exit = useExit()
  const clipboard = useClipboard()
  const themeContext = useContext(ThemeContext)
  const colors = emergencyPalette(themeContext?.theme, props.mode)

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      void exit()
    }
  })
  const [copied, setCopied] = createSignal(false)
  // Buttons are the only interactive elements on the fatal screen; invert the
  // primary fill on hover so the target is unmistakable.
  const [hover, setHover] = createSignal<string>()
  const buttonBg = (id: string) => (hover() === id ? colors.primaryText : colors.primary)
  const buttonFg = (id: string) => (hover() === id ? colors.primary : colors.primaryText)

  const issueURL = new URL(BUG_URL)

  if (props.error.message) {
    issueURL.searchParams.set("title", `${APP_NAME}: fatal: ${props.error.message}`)
  }

  if (props.error.stack) {
    issueURL.searchParams.set(
      "description",
      "```\n" + props.error.stack.substring(0, 6000 - issueURL.toString().length) + "…\n```",
    )
  }

  issueURL.searchParams.set("arcana-version", InstallationVersion)

  const copyIssueURL = () => {
    void clipboard.write?.(issueURL.toString()).then(() => {
      setCopied(true)
    })
  }

  // The screen paints the whole renderer, so its budget is the terminal's width.
  // A renderer that has not been laid out yet reports zero, and unmeasured is
  // not narrow: the row stays inline rather than stacking on a guess.
  const stacks = createMemo(() => {
    const width = term().width
    if (width === 0) return false
    return width < INLINE_MIN
  })

  const copyLabel = createMemo(() => {
    const width = term().width
    if (width === 0 || width >= COPY_ACTIONS) return BUTTON_COPY
    return BUTTON_COPY_SHORT
  })

  return (
    <box flexDirection="column" gap={1} backgroundColor={colors.bg}>
      <text fg={colors.muted}>{arcanaDitherPattern("fatal-error", 48)} FATAL</text>
      <box
        flexDirection={stacks() ? "column" : "row"}
        gap={Space.gap}
        alignItems={stacks() ? "stretch" : "center"}
      >
        <text attributes={TextAttributes.BOLD} fg={colors.text}>
          {SENTENCE_COPY}
        </text>
        {/* The prose is the row's only elastic segment: every control is
            reserved at its own width, so a narrow row wraps the sentence and
            nothing else moves. The group is right-aligned when the rows stack,
            because the actions keep their position at the frame's edge rather
            than starting a new paragraph under the prose. */}
        <box
          flexDirection="row"
          gap={Space.gap}
          alignItems="center"
          flexShrink={0}
          alignSelf={stacks() ? "flex-end" : undefined}
        >
          <box
            onMouseUp={copyIssueURL}
            onMouseOver={() => setHover("copy")}
            onMouseOut={() => setHover(undefined)}
            backgroundColor={buttonBg("copy")}
            paddingLeft={BUTTON_PAD}
            paddingRight={BUTTON_PAD}
            flexShrink={0}
          >
            <text attributes={TextAttributes.BOLD} fg={buttonFg("copy")} wrapMode="none" flexShrink={0}>
              {copyLabel()}
            </text>
          </box>
          <Show when={copied()}>
            <text fg={colors.muted} wrapMode="none" flexShrink={0}>
              {NOTE_COPIED}
            </text>
          </Show>
        </box>
      </box>
      <box
        flexDirection={stacks() ? "column" : "row"}
        gap={stacks() ? Space.gap : Space.gapWide}
        alignItems={stacks() ? "stretch" : "center"}
      >
        <text fg={colors.text}>{SENTENCE_RESTART}</text>
        <box
          flexDirection="row"
          gap={Space.gapWide}
          alignItems="center"
          flexShrink={0}
          alignSelf={stacks() ? "flex-end" : undefined}
        >
          <box
            onMouseUp={props.reset}
            onMouseOver={() => setHover("reset")}
            onMouseOut={() => setHover(undefined)}
            backgroundColor={buttonBg("reset")}
            paddingLeft={BUTTON_PAD}
            paddingRight={BUTTON_PAD}
            flexShrink={0}
          >
            <text fg={buttonFg("reset")} wrapMode="none" flexShrink={0}>
              {BUTTON_RESET}
            </text>
          </box>
          <box
            onMouseUp={() => void exit()}
            onMouseOver={() => setHover("exit")}
            onMouseOut={() => setHover(undefined)}
            backgroundColor={buttonBg("exit")}
            paddingLeft={BUTTON_PAD}
            paddingRight={BUTTON_PAD}
            flexShrink={0}
          >
            <text fg={buttonFg("exit")} wrapMode="none" flexShrink={0}>
              {BUTTON_EXIT}
            </text>
          </box>
        </box>
      </box>
      <text fg={colors.muted} attributes={TextAttributes.BOLD}>Technical Details (for Bug Reports):</text>
      <scrollbox height={Math.floor(term().height * 0.4)} scrollAcceleration={getScrollAcceleration()}>
        <text fg={colors.muted}>{props.error.stack}</text>
      </scrollbox>
      <text fg={colors.text}>{props.error.message}</text>
    </box>
  )
}
