import { TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { createStore } from "solid-js/store"
import { onMount, Show } from "solid-js"
import { useBindings } from "../keymap"
import { Space } from "./chrome"
import { DialogBody, DialogColumn, DialogOptionRow, DialogTitleRow } from "./dialog-chrome"
import { COPY } from "../branding"

export type DialogExportOptionsProps = {
  defaultFilename: string
  defaultThinking: boolean
  defaultToolDetails: boolean
  defaultAssistantMetadata: boolean
  defaultOpenWithoutSaving: boolean
  onConfirm?: (options: {
    filename: string
    thinking: boolean
    toolDetails: boolean
    assistantMetadata: boolean
    openWithoutSaving: boolean
  }) => void
  onCancel?: () => void
}

export function DialogExportOptions(props: DialogExportOptionsProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  let textarea: TextareaRenderable
  const [store, setStore] = createStore({
    thinking: props.defaultThinking,
    toolDetails: props.defaultToolDetails,
    assistantMetadata: props.defaultAssistantMetadata,
    openWithoutSaving: props.defaultOpenWithoutSaving,
    active: "filename" as "filename" | "thinking" | "toolDetails" | "assistantMetadata" | "openWithoutSaving",
  })

  useBindings(() => ({
    bindings: [
      {
        key: "tab",
        desc: "Next export option",
        group: "Dialog",
        cmd: () => {
          const order: Array<"filename" | "thinking" | "toolDetails" | "assistantMetadata" | "openWithoutSaving"> = [
            "filename",
            "thinking",
            "toolDetails",
            "assistantMetadata",
            "openWithoutSaving",
          ]
          const currentIndex = order.indexOf(store.active)
          const nextIndex = (currentIndex + 1) % order.length
          setStore("active", order[nextIndex])
        },
      },
    ],
  }))

  useBindings(() => ({
    enabled: store.active !== "filename",
    bindings: [
      {
        key: "space",
        desc: "Toggle export option",
        group: "Dialog",
        cmd: () => {
          if (store.active === "thinking") setStore("thinking", !store.thinking)
          if (store.active === "toolDetails") setStore("toolDetails", !store.toolDetails)
          if (store.active === "assistantMetadata") setStore("assistantMetadata", !store.assistantMetadata)
          if (store.active === "openWithoutSaving") setStore("openWithoutSaving", !store.openWithoutSaving)
        },
      },
    ],
  }))

  onMount(() => {
    dialog.setSize("medium")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      textarea.focus()
    }, 1)
    textarea.gotoLineEnd()
  })

  return (
    <DialogColumn>
      <DialogTitleRow
        title={COPY.dialog.exportTitle}
        onClose={() => dialog.clear()}
        closeLabel={COPY.dialog.cancel}
      />
      <DialogBody>
        <box>
          <text fg={theme.text}>{COPY.dialog.filenameLabel}</text>
        </box>
        <textarea
          onSubmit={() => {
            props.onConfirm?.({
              filename: textarea.plainText,
              thinking: store.thinking,
              toolDetails: store.toolDetails,
              assistantMetadata: store.assistantMetadata,
              openWithoutSaving: store.openWithoutSaving,
            })
          }}
          height={3}
          ref={(val: TextareaRenderable) => {
            textarea = val
            val.traits = { status: "FILENAME" }
          }}
          initialValue={props.defaultFilename}
          placeholder={COPY.dialog.enterFilename}
          placeholderColor={theme.textMuted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.text}
        />
        <box flexDirection="column">
          <DialogOptionRow
            label="Include thinking"
            checked={store.thinking}
            active={store.active === "thinking"}
            onPress={() => setStore("active", "thinking")}
          />
          <DialogOptionRow
            label="Include tool details"
            checked={store.toolDetails}
            active={store.active === "toolDetails"}
            onPress={() => setStore("active", "toolDetails")}
          />
          <DialogOptionRow
            label="Include assistant metadata"
            checked={store.assistantMetadata}
            active={store.active === "assistantMetadata"}
            onPress={() => setStore("active", "assistantMetadata")}
          />
          <DialogOptionRow
            label="Open without saving"
            checked={store.openWithoutSaving}
            active={store.active === "openWithoutSaving"}
            onPress={() => setStore("active", "openWithoutSaving")}
          />
        </box>
      </DialogBody>
      <Show when={store.active !== "filename"}>
        <text fg={theme.textMuted} paddingBottom={Space.padY}>
          Press <span style={{ fg: theme.text }}>space</span> to toggle, <span style={{ fg: theme.text }}>return</span>{" "}
          to confirm
        </text>
      </Show>
      <Show when={store.active === "filename"}>
        <text fg={theme.textMuted} paddingBottom={Space.padY}>
          Press <span style={{ fg: theme.text }}>return</span> to confirm, <span style={{ fg: theme.text }}>tab</span>{" "}
          for options
        </text>
      </Show>
    </DialogColumn>
  )
}

DialogExportOptions.show = (
  dialog: DialogContext,
  defaultFilename: string,
  defaultThinking: boolean,
  defaultToolDetails: boolean,
  defaultAssistantMetadata: boolean,
  defaultOpenWithoutSaving: boolean,
) => {
  return new Promise<{
    filename: string
    thinking: boolean
    toolDetails: boolean
    assistantMetadata: boolean
    openWithoutSaving: boolean
  } | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogExportOptions
          defaultFilename={defaultFilename}
          defaultThinking={defaultThinking}
          defaultToolDetails={defaultToolDetails}
          defaultAssistantMetadata={defaultAssistantMetadata}
          defaultOpenWithoutSaving={defaultOpenWithoutSaving}
          onConfirm={(options) => resolve(options)}
          onCancel={() => resolve(null)}
        />
      ),
      () => resolve(null),
    )
  })
}
