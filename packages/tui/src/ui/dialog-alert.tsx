import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { Space } from "./chrome"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { COPY } from "../branding"
import { useBindings } from "../keymap"

export type DialogAlertProps = {
  title: string
  message: string
  onConfirm?: () => void
  /** Keep preformatted output (for example a box-drawn CLI report) intact. */
  preformatted?: boolean
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
    <DialogColumn>
      <DialogTitleRow
        title={props.title}
        onClose={() => dialog.clear()}
        closeLabel={COPY.dialog.dismiss}
      />
      <box width="100%" minWidth={0} paddingBottom={Space.padY}>
        <text
          fg={theme.textMuted}
          width="100%"
          minWidth={0}
          wrapMode={props.preformatted ? "none" : "word"}
        >
          {props.message}
        </text>
      </box>
      <DialogFooter>
        {/* The only action, so it is always the active one — a single-button
            alert has nothing to be unfocused from. */}
        <DialogButton
          label={COPY.dialog.ok}
          active
          onPress={() => {
            props.onConfirm?.()
            dialog.clear()
          }}
        />
      </DialogFooter>
    </DialogColumn>
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
