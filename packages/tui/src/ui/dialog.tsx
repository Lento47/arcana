import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createContext, createEffect, createMemo, onCleanup, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { dialogContentMaxHeight, dialogMaxHeight, dialogMaxWidth, dialogVerticalPad } from "../util/geometry"
import { COPY } from "../branding"
import { MouseButton, Renderable, RGBA } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useToast } from "./toast"
import { RoundBorder, Size } from "./chrome"
import { Flag } from "@arcana/core/flag/flag"
import { useBindings, useOpencodeModeStack } from "../keymap"
import { useClipboard } from "../context/clipboard"

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large" | "xlarge"
    onClose: () => void
  }>,
) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  const dimmer = createMemo(() => {
    const bg = theme.background
    const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b
    const base = lum > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
    return RGBA.fromValues(base.r, base.g, base.b, 150 / 255)
  })

  let dismiss = false
  const width = () => {
    if (props.size === "xlarge") return Size.dialogXLarge
    if (props.size === "large") return Size.dialogLarge
    return Size.dialogMedium
  }

  return (
    <box
      onMouseDown={() => {
        dismiss = !!renderer.getSelection()
      }}
      onMouseUp={() => {
        if (dismiss) {
          dismiss = false
          return
        }
        props.onClose?.()
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      zIndex={3000}
      paddingTop={dialogVerticalPad(dimensions().height)}
      left={0}
      top={0}
      backgroundColor={dimmer()}
    >
      <box
        onMouseUp={(e: { stopPropagation(): void }) => {
          dismiss = false
          e.stopPropagation()
        }}
        width={width()}
        maxWidth={dialogMaxWidth(dimensions().width)}
        maxHeight={dialogMaxHeight(dimensions().height)}
        flexShrink={1}
        backgroundColor={theme.backgroundPanel}
        border={["top", "bottom", "left", "right"]}
        customBorderChars={RoundBorder}
        borderColor={theme.borderActive}
        paddingTop={1}
      >
        <scrollbox
          width="100%"
          height={dialogContentMaxHeight(dimensions().height)}
          flexShrink={1}
          viewportCulling={true}
          scrollbarOptions={{ visible: true }}
        >
          {props.children}
        </scrollbox>
      </box>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as {
      element: JSX.Element
      onClose?: () => void
    }[],
    size: "medium" as "medium" | "large" | "xlarge",
  })

  const renderer = useRenderer()
  const modeStack = useOpencodeModeStack()

  createEffect(() => {
    if (store.stack.length === 0) return
    const popMode = modeStack.push("modal")
    onCleanup(popMode)
  })

  let focus: Renderable | null
  function refocus() {
    setTimeout(() => {
      if (!focus) return
      if (focus.isDestroyed) return
      function find(item: Renderable) {
        for (const child of item.getChildren()) {
          if (child === focus) return true
          if (find(child)) return true
        }
        return false
      }
      const found = find(renderer.root)
      if (!found) return
      focus.focus()
    }, 1)
  }

  useBindings(() => ({
    enabled: store.stack.length > 0 && !renderer.getSelection()?.getSelectedText(),
    bindings: [
      {
        key: "escape",
        desc: "Close dialog",
        group: "Dialog",
        cmd: () => {
          if (renderer.getSelection()) {
            renderer.clearSelection()
          }
          const current = store.stack.at(-1)
          // Match the hardened pattern in clear()/replace(): a throwing
          // onClose must not prevent stack update + refocus (torn state).
          if (current?.onClose) {
            try { current.onClose() } catch (err) {
              console.error("dialog.onClose threw during escape:", err)
            }
          }
          setStore("stack", store.stack.slice(0, -1))
          refocus()
        },
      },
      {
        key: "ctrl+c",
        desc: "Close dialog",
        group: "Dialog",
        cmd: () => {
          if (renderer.getSelection()) {
            renderer.clearSelection()
          }
          const current = store.stack.at(-1)
          if (current?.onClose) {
            try { current.onClose() } catch (err) {
              console.error("dialog.onClose threw during ctrl+c:", err)
            }
          }
          setStore("stack", store.stack.slice(0, -1))
          refocus()
        },
      },
    ],
  }))

  return {
    clear() {
      // Snapshot the existing stack so a throwing onClose cannot leave the
      // dialog stuck in a torn state. Each close runs independently — one
      // failure does not skip the rest, and the stack is always emptied.
      const previous = store.stack.slice()
      for (const item of previous) {
        if (item.onClose) {
          try {
            item.onClose()
          } catch (err) {
            console.error("dialog.onClose threw during clear:", err)
          }
        }
      }
      batch(() => {
        setStore("size", "medium")
        setStore("stack", [])
      })
      refocus()
    },
    replace(input: any, onClose?: () => void) {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        focus?.blur()
      }
      // Snapshot the existing stack so a throwing onClose cannot leave the
      // dialog stuck in a torn state. Each close runs independently — one
      // failure does not skip the rest.
      const previous = store.stack.slice()
      for (const item of previous) {
        if (item.onClose) {
          try {
            item.onClose()
          } catch (err) {
            // Surface but never propagate — replace() must always push the
            // new dialog so callers awaiting onSelect() can resolve.
            console.error("dialog.onClose threw:", err)
          }
        }
      }
      setStore("size", "medium")
      setStore("stack", [
        {
          element: input,
          onClose,
        },
      ])
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large" | "xlarge") {
      setStore("size", size)
    },
  }
}

export type DialogContext = ReturnType<typeof init>

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  const renderer = useRenderer()
  const toast = useToast()
  const clipboard = useClipboard()

  function copySelection() {
    const text = renderer.getSelection()?.getSelectedText()
    if (!text || !clipboard.write) return false
    void clipboard.write(text).then(
      () => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }),
      (error) => toast.error(error),
    )
    renderer.clearSelection()
    return true
  }

  return (
    <ctx.Provider value={value}>
      {props.children}
      <box
        position="absolute"
        zIndex={3000}
        onMouseDown={(evt: { button: number; preventDefault(): void; stopPropagation(): void }) => {
          if (Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
          if (evt.button !== MouseButton.RIGHT) return

          if (!copySelection()) return
          evt.preventDefault()
          evt.stopPropagation()
        }}
        onMouseUp={Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? undefined : copySelection}
      >
        <Show when={value.stack.length}>
          <Dialog onClose={() => value.clear()} size={value.size}>
            {value.stack.at(-1)!.element}
          </Dialog>
        </Show>
      </box>
    </ctx.Provider>
  )
}

export function useDialog() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
