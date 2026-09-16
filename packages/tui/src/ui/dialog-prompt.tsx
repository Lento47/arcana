import { TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { Show, createEffect, createSignal, onMount, type JSX } from "solid-js"
import { Spinner } from "../component/spinner"
import { useTuiConfig } from "../config"
import { useBindings, useCommandShortcut } from "../keymap"
import { Space } from "./chrome"
import { DialogBody, DialogColumn, DialogTitleRow } from "./dialog-chrome"
import { COPY } from "../branding"

export type DialogPromptProps = {
  title: string
  description?: (() => JSX.Element) | JSX.Element
  placeholder?: string
  value?: string
  busy?: boolean
  busyText?: string
  height?: number
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const submitShortcut = useCommandShortcut("dialog.prompt.submit")
  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  let textarea: TextareaRenderable

  function confirm() {
    if (props.busy) return
    props.onConfirm?.(textarea.plainText)
  }

  useBindings(() => ({
    target: textareaTarget,
    enabled: textareaTarget() !== undefined && !props.busy,
    // Dialog form semantics must win over the global managed textarea input layer.
    priority: 1,
    commands: [
      {
        name: "dialog.prompt.submit",
        title: "Submit dialog prompt",
        category: "Dialog",
        run: confirm,
      },
    ],
    bindings: tuiConfig.keybinds.gather("dialog.prompt", ["dialog.prompt.submit"]),
  }))

  onMount(() => {
    dialog.setSize("medium")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      if (props.busy) return
      textarea.focus()
    }, 1)
    textarea.gotoLineEnd()
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    const traits = props.busy
      ? {
          suspend: true,
          status: "BUSY",
        }
      : {}
    textarea.traits = traits
    if (props.busy) {
      textarea.blur()
      return
    }
    textarea.focus()
  })

  return (
    <DialogColumn>
      <DialogTitleRow
        title={props.title}
        onClose={() => dialog.clear()}
        closeLabel={COPY.dialog.cancel}
      />
      <DialogBody>
        {typeof props.description === "function" ? (
          props.description()
        ) : typeof props.description === "string" ? (
          <text width="100%" minWidth={0} fg={theme.textMuted} wrapMode="word">
            {props.description}
          </text>
        ) : (
          props.description
        )}
        <textarea
          width="100%"
          minWidth={0}
          flexShrink={1}
          height={props.height ?? 3}
          ref={(val: TextareaRenderable) => {
            textarea = val
            setTextareaTarget(val)
          }}
          initialValue={props.value}
          placeholder={props.placeholder ?? COPY.dialog.enterText}
          placeholderColor={theme.textMuted}
          textColor={props.busy ? theme.textMuted : theme.text}
          focusedTextColor={props.busy ? theme.textMuted : theme.text}
          cursorColor={props.busy ? theme.backgroundElement : theme.text}
        />
        <Show when={props.busy}>
          <Spinner color={theme.textMuted}>{props.busyText ?? COPY.dialog.working}</Spinner>
        </Show>
      </DialogBody>
      {/* Hint row, not an action row: it stays left-aligned under the input it
          describes, unlike the family's right-aligned footer. */}
      <box minWidth={0} paddingBottom={Space.padY} gap={Space.gap} flexDirection="row">
        <Show when={!props.busy} fallback={<text fg={theme.textMuted}>{COPY.dialog.processing}</text>}>
          <Show when={submitShortcut()}>
            <text fg={theme.text}>
              {submitShortcut()} <span style={{ fg: theme.textMuted }}>{COPY.dialog.submit}</span>
            </text>
          </Show>
        </Show>
      </box>
    </DialogColumn>
  )
}

DialogPrompt.show = (dialog: DialogContext, title: string, options?: Omit<DialogPromptProps, "title">) => {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt title={title} {...options} onConfirm={(value) => resolve(value)} onCancel={() => resolve(null)} />
      ),
      () => resolve(null),
    )
  })
}
