import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useBindings } from "../keymap"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "../ui/dialog-chrome"

export function DialogWorkspaceUnavailable(props: { onRestore?: () => boolean | void | Promise<boolean | void> }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "restore" as "cancel" | "restore",
  })

  const options = ["cancel", "restore"] as const
  const labels: Record<(typeof options)[number], string> = {
    cancel: "Cancel",
    restore: "Restore",
  }

  async function confirm() {
    if (store.active === "cancel") {
      dialog.clear()
      return
    }
    const result = await props.onRestore?.()
    if (result === false) return
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Confirm workspace option", group: "Dialog", cmd: () => void confirm() },
      { key: "left", desc: "Cancel workspace restore", group: "Dialog", cmd: () => setStore("active", "cancel") },
      { key: "right", desc: "Restore workspace", group: "Dialog", cmd: () => setStore("active", "restore") },
    ],
  }))

  return (
    <DialogColumn>
      <DialogTitleRow title="Workspace Unavailable" onClose={() => dialog.clear()} />
      <text fg={theme.textMuted} wrapMode="word">
        This session is attached to a workspace that is no longer available.
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        Would you like to restore this session into a new workspace?
      </text>
      <text fg={theme.textMuted}>left/right to choose · Enter to confirm</text>
      <DialogFooter>
        <For each={options}>
          {(item) => (
            <DialogButton
              label={labels[item]}
              active={item === store.active}
              onPress={() => {
                setStore("active", item)
                void confirm()
              }}
            />
          )}
        </For>
      </DialogFooter>
    </DialogColumn>
  )
}
