import { TextAttributes } from "@opentui/core"
import { Space } from "../ui/chrome"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createStore } from "solid-js/store"
import { For, Show, createSignal } from "solid-js"
import { useBindings } from "../keymap"
import { DialogColumn, DialogTitleRow } from "../ui/dialog-chrome"
import { COPY } from "../branding"

type RecoveryOptionID = "delete" | "force-delete" | "restore" | "dismiss"

function isDestructiveOption(id: RecoveryOptionID): boolean {
  return id === "delete" || id === "force-delete"
}

export function DialogSessionDeleteFailed(props: {
  session: string
  workspace: string
  onDelete?: () => boolean | void | Promise<boolean | void>
  onRestore?: () => boolean | void | Promise<boolean | void>
  onForceDelete?: () => boolean | void | Promise<boolean | void>
  onDismiss?: () => void
  onDone?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "delete" as RecoveryOptionID,
  })
  // Destructive recovery options are two-step: the first enter/click arms the
  // option, the second confirms. Esc cancels the confirmation first.
  const [confirming, setConfirming] = createSignal(false)
  const [failure, setFailure] = createSignal<string | null>(null)

  const options = [
    {
      id: "delete" as const,
      title: "Delete workspace",
      description: "Delete the workspace and all sessions attached to it.",
      run: props.onDelete,
    },
    {
      id: "force-delete" as const,
      title: "Force delete session",
      description: "Delete only the session record, leaving the workspace unchanged.",
      run: props.onForceDelete,
    },
    {
      id: "restore" as const,
      title: "Restore to new workspace",
      description: "Try to restore this session into a new workspace.",
      run: props.onRestore,
    },
    {
      id: "dismiss" as const,
      title: "Dismiss",
      description: "Close this dialog and return to home without deleting anything.",
      run: props.onDismiss ? () => { props.onDismiss!(); return true } : undefined,
    },
  ]

  function confirmText(id: RecoveryOptionID): string {
    return id === "delete"
      ? `Press enter again to delete "${props.workspace}" and every session attached to it. This cannot be undone.`
      : `Press enter again to delete the session "${props.session}" record. This cannot be undone.`
  }

  async function runOption(id: RecoveryOptionID) {
    const option = options.find((item) => item.id === id)
    if (!option?.run) return
    if (isDestructiveOption(id) && !(confirming() && store.active === id)) {
      setStore("active", id)
      setConfirming(true)
      setFailure(null)
      return
    }
    try {
      const result = await option.run()
      // `false` is not always a failure: restore hands off to the workspace
      // picker. Callers surface their own error toasts; just disarm here.
      setConfirming(false)
      if (result === false) return
      setFailure(null)
      props.onDone?.()
      if (!props.onDone) dialog.clear()
    } catch (error) {
      setFailure(
        `The recovery action failed — ${error instanceof Error ? error.message : String(error)}. Press esc to dismiss and try again.`,
      )
      setConfirming(false)
    }
  }

  function move(offset: number) {
    setConfirming(false)
    setFailure(null)
    setStore("active", (prev) => {
      const ids = options.map((o) => o.id)
      return ids[(ids.indexOf(prev) + offset + ids.length) % ids.length]!
    })
  }

  function dismiss() {
    if (confirming()) {
      setConfirming(false)
      return
    }
    props.onDismiss?.()
    dialog.clear()
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Confirm recovery option", group: "Dialog", cmd: () => void runOption(store.active) },
      { key: "escape", desc: "Dismiss", group: "Dialog", cmd: dismiss },
      { key: "left", desc: "Previous option", group: "Dialog", cmd: () => move(-1) },
      { key: "up", desc: "Previous option", group: "Dialog", cmd: () => move(-1) },
      { key: "right", desc: "Next option", group: "Dialog", cmd: () => move(1) },
      { key: "down", desc: "Next option", group: "Dialog", cmd: () => move(1) },
    ],
  }))

  return (
    <DialogColumn>
      <DialogTitleRow title="Failed to Delete Session" onClose={dismiss} closeLabel={COPY.dialog.dismiss} />
      <text fg={theme.textMuted} wrapMode="word">
        {`The session "${props.session}" could not be deleted because the workspace "${props.workspace}" is not available.`}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        Choose how you want to recover this broken workspace session.
      </text>
      <box flexDirection="column" paddingBottom={Space.padY} gap={Space.gap}>
        <For each={options}>
          {(item) => (
            <box
              flexDirection="column"
              paddingLeft={Space.unit}
              paddingRight={Space.unit}
              paddingTop={Space.padY}
              paddingBottom={Space.padY}
              backgroundColor={
                confirming() && item.id === store.active
                  ? theme.error
                  : item.id === store.active
                    ? theme.primary
                    : undefined
              }
              onMouseUp={() => void runOption(item.id)}
            >
              <text
                attributes={TextAttributes.BOLD}
                fg={item.id === store.active ? theme.selectedListItemText : theme.text}
              >
                {item.title}
              </text>
              <text
                fg={item.id === store.active ? theme.selectedListItemText : theme.textMuted}
                wrapMode="word"
              >
                {item.description}
              </text>
              <Show when={confirming() && item.id === store.active}>
                <text fg={theme.selectedListItemText} wrapMode="word">
                  {confirmText(item.id)}
                </text>
              </Show>
              <Show when={failure() && item.id === store.active}>
                <text fg={theme.selectedListItemText} wrapMode="word">
                  {failure()}
                </text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </DialogColumn>
  )
}
