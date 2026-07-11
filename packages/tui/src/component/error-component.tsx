import { RGBA, TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSignal, useContext } from "solid-js"
import { getScrollAcceleration } from "../util/scroll"
import { useClipboard } from "../context/clipboard"
import { InstallationVersion } from "@arcana/core/installation/version"
import { useExit } from "../context/exit"
import { APP_NAME, BUG_URL } from "../branding"
import { selectedForeground, ThemeContext, type Theme } from "../context/theme"
import { arcanaDitherPattern } from "../ui/arcana"

function emergencyPalette(theme: Theme | undefined, mode?: "dark" | "light") {
  if (theme) {
    return {
      bg: theme.background,
      text: theme.text,
      muted: theme.textMuted,
      primary: theme.primary,
      primaryText: selectedForeground(theme, theme.primary),
    }
  }

  const isLight = mode === "light"
  return {
    bg: RGBA.fromHex(isLight ? "#ffffff" : "#0a0a0a"),
    text: RGBA.fromHex(isLight ? "#1a1a1a" : "#eeeeee"),
    muted: RGBA.fromHex(isLight ? "#8a8a8a" : "#808080"),
    primary: RGBA.fromHex(isLight ? "#3b7dd8" : "#fab283"),
    primaryText: RGBA.fromHex(isLight ? "#ffffff" : "#0a0a0a"),
  }
}

export function ErrorComponent(props: { error: Error; reset: () => void; mode?: "dark" | "light" }) {
  const term = useTerminalDimensions()
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

  const issueURL = new URL(BUG_URL)

  if (props.error.message) {
    issueURL.searchParams.set("title", `${APP_NAME}: fatal: ${props.error.message}`)
  }

  if (props.error.stack) {
    issueURL.searchParams.set(
      "description",
      "```\n" + props.error.stack.substring(0, 6000 - issueURL.toString().length) + "...\n```",
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
          Arcana encountered a fatal error and needs to restart.
        </text>
        <box onMouseUp={copyIssueURL} backgroundColor={colors.primary} padding={1}>
          <text attributes={TextAttributes.BOLD} fg={colors.primaryText}>
            Copy issue URL (exception info pre-filled)
          </text>
        </box>
        {copied() && <text fg={colors.muted}>Successfully copied</text>}
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={colors.text}>A fatal error occurred!</text>
        <box onMouseUp={props.reset} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.primaryText}>Reset TUI</text>
        </box>
        <box onMouseUp={() => void exit()} backgroundColor={colors.primary} padding={1}>
          <text fg={colors.primaryText}>Exit</text>
        </box>
      </box>
      <text fg={colors.muted} attributes={TextAttributes.BOLD}>Technical details (for bug reports):</text>
      <scrollbox height={Math.floor(term().height * 0.4)} scrollAcceleration={getScrollAcceleration()}>
        <text fg={colors.muted}>{props.error.stack}</text>
      </scrollbox>
      <text fg={colors.text}>{props.error.message}</text>
    </box>
  )
}
