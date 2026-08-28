import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useBindings } from "../keymap"

export type DialogAlertProps = {
  title: string
  message: string
  onConfirm?: () => void
}

export function DialogAlert(props: DialogAlertProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  useBindings(() => ({
    bindings: [
      {
        key: "return",
        desc: "Confirm alert",
        group: "Dialog",
        cmd: () => {
          props.onConfirm?.()
          dialog.clear()
        },
      },
    ],
  }))
  return (
    <box width="100%" minWidth={0} paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between" minWidth={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.text} flexShrink={1} overflow="hidden" wrapMode="none">
          {props.title}
        </text>
        <text fg={theme.textMuted} flexShrink={0} onMouseUp={() => dialog.clear()}>
          [esc] dismiss
        </text>
      </box>
      <box width="100%" minWidth={0} paddingBottom={1}>
        <text fg={theme.textMuted} width="100%" minWidth={0} wrapMode="word">
          {props.message}
        </text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.primary}
          onMouseUp={() => {
            props.onConfirm?.()
            dialog.clear()
          }}
        >
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}

DialogAlert.show = (dialog: DialogContext, title: string, message: string) => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      () => <DialogAlert title={title} message={message} onConfirm={() => resolve()} />,
      () => resolve(),
    )
  })
}
