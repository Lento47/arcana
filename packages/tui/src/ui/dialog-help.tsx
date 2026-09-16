import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { COPY, DOCS_URL } from "../branding"

/**
 * Help & Quick Start.
 *
 * Every shortcut row is *derived* from the live keymap rather than typed in.
 * The typed rows had already drifted: the palette and new-session shortcuts
 * were each listed twice — once resolved, once as a hardcoded `Ctrl+P`/`Ctrl+N`
 * — so the dialog disagreed with itself the moment a binding changed.
 */
export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const commandsCmd = useCommandShortcut("command.palette.show")
  const sessionNew = useCommandShortcut("session.new")
  const sessionList = useCommandShortcut("session.list")
  const sessionInterrupt = useCommandShortcut("session.interrupt")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
      { key: "escape", desc: "Close help", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Help & Quick Start" onClose={() => dialog.clear()} />

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Getting Started</text>
      <text fg={theme.textMuted}>Type a message and press Enter to begin. Arcana will analyze your codebase and respond.</text>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Keyboard Shortcuts</text>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{commandsCmd()}</text><text fg={theme.textMuted}>Command palette — search all actions</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{sessionNew()}</text><text fg={theme.textMuted}>New session</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{sessionList()}</text><text fg={theme.textMuted}>Session list</text></box>
      <box flexDirection="row" gap={1}><text fg={theme.primary}>{sessionInterrupt()}</text><text fg={theme.textMuted}>Interrupt the current turn</text></box>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Tips</text>
      <text fg={theme.textMuted}>• Start a message with ! to run shell commands directly (e.g., !ls -la)</text>
      <text fg={theme.textMuted}>• Type @filename to attach files to your prompt</text>
      <text fg={theme.textMuted}>• Use /connect to add API keys for 75+ LLM providers</text>
      <text fg={theme.textMuted}>• Use /theme to switch between built-in color themes</text>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>Documentation</text>
      <text fg={theme.primary}>{DOCS_URL}</text>

      <DialogFooter>
        <DialogButton label={COPY.dialog.close} active onPress={() => dialog.clear()} />
      </DialogFooter>
    </DialogColumn>
  )
}
