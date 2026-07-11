import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"

export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandsCmd = useCommandShortcut("command.palette.show")
  const sessionNew = useCommandShortcut("session.new")
  const sessionList = useCommandShortcut("session.list")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Help & Quick Start
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          [esc] close
        </text>
      </box>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Getting Started</text>
      <text fg={theme.textMuted}>Type a message and press Enter to begin. Arcana will analyze your codebase and respond.</text>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Keyboard Shortcuts</text>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{commandsCmd()}</text><text fg={theme.textMuted}>Command palette — search all actions</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{sessionNew()}</text><text fg={theme.textMuted}>New session</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{sessionList()}</text><text fg={theme.textMuted}>Session list</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>Ctrl+P</text><text fg={theme.textMuted}>Command palette (macOS: Cmd+P)</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>Ctrl+N</text><text fg={theme.textMuted}>New session (macOS: Cmd+N)</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>Esc ×2</text><text fg={theme.textMuted}>Interrupt / stop the AI</text></box>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Tips</text>
      <text fg={theme.textMuted}>• Start a message with ! to run shell commands directly (e.g., !ls -la)</text>
      <text fg={theme.textMuted}>• Type @filename to attach files to your prompt</text>
      <text fg={theme.textMuted}>• Use /connect to add API keys for 75+ LLM providers</text>
      <text fg={theme.textMuted}>• Use /theme to switch between built-in color themes</text>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Documentation</text>
      <text fg={theme.primary}>https://arcana.otnelhq.com/docs</text>

      <box flexDirection="row" justifyContent="flex-end" paddingTop={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
