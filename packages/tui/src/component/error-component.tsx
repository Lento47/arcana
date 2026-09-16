import { RGBA, TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTerminalSize } from "../util/terminal-size"
import { createSignal, useContext } from "solid-js"
import { getScrollAcceleration } from "../util/scroll"
import { useClipboard } from "../context/clipboard"
import { InstallationVersion } from "@arcana/core/installation/version"
import { useExit } from "../context/exit"
import { APP_NAME, BUG_URL } from "../branding"
import { selectedForeground, ThemeContext, type Theme } from "../context/theme"
import { fallbackTheme } from "../theme"
import { arcanaDitherPattern } from "../ui/arcana"

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

  return (
    <box flexDirection="column" gap={1} backgroundColor={colors.bg}>
      <text fg={colors.muted}>{arcanaDitherPattern("fatal-error", 48)} FATAL</text>
      <box flexDirection="row" gap={1} alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={colors.text}>
          {APP_NAME} encountered a fatal error and needs to restart.
        </text>
        <box
          onMouseUp={copyIssueURL}
          onMouseOver={() => setHover("copy")}
          onMouseOut={() => setHover(undefined)}
          backgroundColor={buttonBg("copy")}
          padding={1}
        >
          <text attributes={TextAttributes.BOLD} fg={buttonFg("copy")}>
            Copy Issue URL (Exception Info Pre-filled)
          </text>
        </box>
        {copied() && <text fg={colors.muted}>Copied issue URL</text>}
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={colors.text}>Press Reset TUI to restart, or Exit to close {APP_NAME}.</text>
        <box
          onMouseUp={props.reset}
          onMouseOver={() => setHover("reset")}
          onMouseOut={() => setHover(undefined)}
          backgroundColor={buttonBg("reset")}
          padding={1}
        >
          <text fg={buttonFg("reset")}>Reset TUI</text>
        </box>
        <box
          onMouseUp={() => void exit()}
          onMouseOver={() => setHover("exit")}
          onMouseOut={() => setHover(undefined)}
          backgroundColor={buttonBg("exit")}
          padding={1}
        >
          <text fg={buttonFg("exit")}>Exit</text>
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
