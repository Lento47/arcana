import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { createStore } from "solid-js/store"
import { Space } from "./chrome"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { COPY } from "../branding"
import { useBindings } from "../keymap"

export type DialogConfirmProps = {
  title: string
  message: string
  onConfirm?: () => void
  onCancel?: () => void
  /** Overrides the cancel button's label (the action-specific verb). */
  label?: string
  /** Overrides the confirm button's label. */
  confirmLabel?: string
  /**
   * Marks the confirm as consequential: it fills with `theme.error` and stays
   * error-colored while unfocused. Pair it with a verb that names the
   * consequence ("Delete", "Discard") — a destructive confirm labelled
   * "Confirm" would read like any other.
   */
  destructive?: boolean
}

export type DialogConfirmResult = boolean | undefined

export function DialogConfirm(props: DialogConfirmProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "confirm" as "confirm" | "cancel",
  })

  const finish = (which: "confirm" | "cancel") => {
    if (which === "confirm") props.onConfirm?.()
    else props.onCancel?.()
    dialog.clear()
  }

  useBindings(() => ({
    bindings: [
      {
        key: "return",
        desc: "Confirm dialog selection",
        group: "Dialog",
        cmd: () => finish(store.active),
      },
      {
        key: "left",
        desc: "Previous dialog option",
        group: "Dialog",
        cmd: () => {
          setStore("active", store.active === "confirm" ? "cancel" : "confirm")
        },
      },
      {
        key: "right",
        desc: "Next dialog option",
        group: "Dialog",
        cmd: () => {
          setStore("active", store.active === "confirm" ? "cancel" : "confirm")
        },
      },
    ],
  }))

  return (
    <DialogColumn>
      <DialogTitleRow
        title={props.title}
        onClose={() => dialog.clear()}
        closeLabel={COPY.dialog.cancel}
      />
      <box width="100%" minWidth={0} paddingBottom={Space.padY}>
        <text fg={theme.textMuted} width="100%" minWidth={0} wrapMode="word">
          {props.message}
        </text>
      </box>
      <DialogFooter>
        <DialogButton
          label={props.label ?? COPY.dialog.cancel}
          active={store.active === "cancel"}
          onPress={() => finish("cancel")}
        />
        <DialogButton
          label={props.confirmLabel ?? COPY.dialog.confirm}
          active={store.active === "confirm"}
          destructive={props.destructive}
          onPress={() => finish("confirm")}
        />
      </DialogFooter>
    </DialogColumn>
  )
}

DialogConfirm.show = (
  dialog: DialogContext,
  title: string,
  message: string,
  label?: string,
  destructive?: boolean,
  confirmLabel?: string,
) => {
  return new Promise<DialogConfirmResult>((resolve) => {
    dialog.replace(
      () => (
        <DialogConfirm
          title={title}
          message={message}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
          label={label}
          destructive={destructive}
          confirmLabel={confirmLabel}
        />
      ),
      () => resolve(undefined),
    )
  })
}
