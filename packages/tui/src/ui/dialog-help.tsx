import { TextAttributes } from "@opentui/core"
import { Space } from "./chrome"
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
      {/* A shortcut and what it does: the key is fixed vocabulary and the
          description is prose, so the description is the segment that wraps and
          the key is reserved. Unreserved, the first row's key — the longest, at
          `ctrl+p` next to 37 cells of description — decoded to `ctr`/`l+p` in the
          medium card's 34-cell column, which is a shortcut nobody can press. */}
      <box flexDirection="row" gap={Space.gap}>
        <text fg={theme.primary} flexShrink={0} wrapMode="none">{commandsCmd()}</text>
        <text fg={theme.textMuted}>Command palette — search all actions</text>
      </box>
      <box flexDirection="row" gap={Space.gap}>
        <text fg={theme.primary} flexShrink={0} wrapMode="none">{sessionNew()}</text>
        <text fg={theme.textMuted}>New session</text>
      </box>
      <box flexDirection="row" gap={Space.gap}>
        <text fg={theme.primary} flexShrink={0} wrapMode="none">{sessionList()}</text>
        <text fg={theme.textMuted}>Session list</text>
      </box>
      <box flexDirection="row" gap={Space.gap}>
        <text fg={theme.primary} flexShrink={0} wrapMode="none">{sessionInterrupt()}</text>
        <text fg={theme.textMuted}>Interrupt the current turn</text>
      </box>

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
