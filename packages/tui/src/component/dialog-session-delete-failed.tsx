import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useBindings } from "../keymap"

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
    active: "delete" as "delete" | "force-delete" | "restore" | "dismiss",
  })

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

  async function confirm() {
    const result = await options.find((item) => item.id === store.active)?.run?.()
    if (result === false) return
    props.onDone?.()
    if (!props.onDone) dialog.clear()
  }

  function dismiss() {
    props.onDismiss?.()
    dialog.clear()
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Confirm recovery option", group: "Dialog", cmd: () => void confirm() },
      { key: "escape", desc: "Dismiss", group: "Dialog", cmd: dismiss },
      { key: "left", desc: "Previous option", group: "Dialog",
        cmd: () => setStore("active", (prev) => {
          const ids = options.map((o) => o.id)
          return ids[(ids.indexOf(prev) - 1 + ids.length) % ids.length]!
        }),
      },
      { key: "up", desc: "Previous option", group: "Dialog",
        cmd: () => setStore("active", (prev) => {
          const ids = options.map((o) => o.id)
          return ids[(ids.indexOf(prev) - 1 + ids.length) % ids.length]!
        }),
      },
      { key: "right", desc: "Next option", group: "Dialog",
        cmd: () => setStore("active", (prev) => {
          const ids = options.map((o) => o.id)
          return ids[(ids.indexOf(prev) + 1) % ids.length]!
        }),
      },
      { key: "down", desc: "Next option", group: "Dialog",
        cmd: () => setStore("active", (prev) => {
          const ids = options.map((o) => o.id)
          return ids[(ids.indexOf(prev) + 1) % ids.length]!
        }),
      },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Failed to Delete Session
        </text>
        <text fg={theme.textMuted} onMouseUp={dismiss}>
          [esc] dismiss
        </text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        {`The session "${props.session}" could not be deleted because the workspace "${props.workspace}" is not available.`}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        Choose how you want to recover this broken workspace session.
      </text>
      <box flexDirection="column" paddingBottom={1} gap={1}>
        <For each={options}>
          {(item) => (
            <box
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={item.id === store.active ? theme.primary : undefined}
              onMouseUp={() => {
                setStore("active", item.id)
                void confirm()
              }}
            >
              <text
                attributes={TextAttributes.BOLD}
                fg={item.id === store.active ? theme.selectedListItemText : theme.text}
              >
                {item.title}
              </text>
              <text fg={item.id === store.active ? theme.selectedListItemText : theme.textMuted} wrapMode="word">
                {item.description}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
