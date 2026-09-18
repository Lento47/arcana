import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  useContext,
  type JSX,
  type ParentProps,
} from "solid-js"
import { tint, useTheme } from "../context/theme"
import { dialogContentMaxHeight, dialogMaxHeight, dialogMaxWidth, dialogWidth } from "../util/geometry"
import { COPY } from "../branding"
import { SCRIM_ALPHA, backdropScrim, withAlpha } from "../theme/emphasis"
import { createEase } from "../util/motion"
import { MouseButton, Renderable } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useToast } from "./toast"
import { RoundBorder } from "./chrome"
import { Flag } from "@arcana/core/flag/flag"
import { useBindings, useOpencodeModeStack } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { useKV } from "../context/kv"

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large" | "xlarge"
    onClose: () => void
    /**
     * Dissolve wash 0..1. 1 = fully painted, 0 = dissolved. Color-only: the
     * card's border/panel and the scrim fade, geometry never moves. Absent
     * means fully painted (standalone use, tests).
     */
    wash?: () => number
    /** Route a close through the dismiss wash. Absent = close immediately. */
    requestClose?: (run: () => void) => void
  }>,
) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  const wash = () => props.wash?.() ?? 1
  // Shared scrim definition (`theme/emphasis`) so the dialog, the permission
  // gates and the diff viewer recede the app behind them by the same amount.
  // The dissolve lifts from a 35% floor so a close never blinks to black.
  const dimmer = createMemo(() =>
    withAlpha(backdropScrim(theme), SCRIM_ALPHA * (0.35 + 0.65 * wash())),
  )

  let dismiss = false
  const width = () => dialogWidth(dimensions().width, props.size ?? "medium")
  const contentCap = createMemo(() => dialogContentMaxHeight(dimensions().height))

  // The scrollbox's internal content node forces `minHeight: "100%"`, so a bare
  // maxHeight scrollbox claims the whole viewport even for short content.
  // `contentOptions` is spread *after* that default (`@opentui/core`
  // ScrollBoxRenderable), so overriding it to 0 lets the scrollbox hug its
  // children while `maxHeight` still caps — short dialogs are their real
  // height, long dialogs stop at `contentCap` and scroll (the O3
  // bounded-scroll invariant, preserved).
  //
  // This replaced a `setInterval(measureContent, 250)`: a layout read on a
  // timer, which reflowed every tick and left a timer running for as long as
  // the dialog lived. Sizing off content now needs no JS at all, so the class
  // of defect (a poll that never stops, a card that snaps from full-height to
  // hugging after paint) is structurally gone rather than merely fixed.

  return (
    <box
      id="arcana-dialog-overlay"
      onMouseDown={() => {
        dismiss = !!renderer.getSelection()
      }}
      onMouseUp={() => {
        if (dismiss) {
          dismiss = false
          return
        }
        const run = () => props.onClose?.()
        if (props.requestClose) props.requestClose(run)
        else run()
      }}
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      position="absolute"
      zIndex={3000}
      left={0}
      top={0}
      backgroundColor={dimmer()}
      overflow="hidden"
    >
      <box
        id="arcana-dialog-card"
        onMouseUp={(e: { stopPropagation(): void }) => {
          dismiss = false
          e.stopPropagation()
        }}
        width={width()}
        maxWidth={dialogMaxWidth(dimensions().width)}
        maxHeight={dialogMaxHeight(dimensions().height)}
        minWidth={0}
        minHeight={0}
        alignSelf="center"
        flexDirection="column"
        flexShrink={1}
        backgroundColor={tint(theme.background, theme.backgroundPanel, wash())}
        border={["top", "bottom", "left", "right"]}
        customBorderChars={RoundBorder}
        borderColor={tint(theme.background, theme.borderActive, wash())}
        paddingTop={1}
        overflow="hidden"
      >
        <scrollbox
          id="arcana-dialog-body"
          width="100%"
          minWidth={0}
          minHeight={0}
          maxHeight={contentCap()}
          flexShrink={1}
          contentOptions={{ minHeight: 0 }}
          viewportCulling={true}
          // The body bar is themed like every other bar in the app; without
          // this it painted OpenTUI's default grey `▀` blob over the card.
          // The body is width-bounded (children wrap to the card), so the
          // horizontal bar is off: its row would only steal a line.
          verticalScrollbarOptions={{
            trackOptions: { backgroundColor: theme.backgroundElement, foregroundColor: theme.border },
          }}
          horizontalScrollbarOptions={{ visible: false }}
        >
          <box width="100%" minWidth={0}>
            {props.children}
          </box>
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
  const kv = useKV()

  // Dismiss wash: 1 = painted, 0 = dissolved. One ease per provider so every
  // operator close path (escape, ctrl+c, overlay click) fades the same way and
  // the stack only pops once the wash has landed. Programmatic clear()/replace()
  // stay synchronous — those are not operator-initiated closes.
  const [dissolving, setDissolving] = createSignal(false)
  const wash = createEase(() => (dissolving() ? 0 : 1), {
    stepMs: 24,
    riseRate: 0.55,
    fallRate: 0.5,
    epsilon: 0.05,
    // Fresh dialogs fade up from a floor instead of blinking in at full paint.
    initial: 0.25,
  })
  let pendingClose: (() => void) | undefined

  const dismiss = (run: () => void) => {
    if (dissolving()) return
    if (kv.get("animations_enabled", true) !== true) {
      run()
      return
    }
    pendingClose = run
    setDissolving(true)
  }

  createEffect(() => {
    if (!dissolving()) return
    if (wash() > 0.05) return
    const run = pendingClose
    pendingClose = undefined
    setDissolving(false)
    run?.()
  })

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

  // Operator-initiated close: dissolve first, then run the exact pop captured
  // at request time (another dialog pushed during the wash must survive).
  const requestDismiss = () => {
    const current = store.stack.at(-1)
    if (!current) return
    dismiss(() => {
      // Match the hardened pattern in clear()/replace(): a throwing onClose
      // must not prevent stack update + refocus (torn state).
      if (current.onClose) {
        try {
          current.onClose()
        } catch (err) {
          console.error("dialog.onClose threw during dismiss:", err)
        }
      }
      setStore("stack", store.stack.filter((item) => item !== current))
      refocus()
    })
  }

  useBindings(() => ({
    enabled: store.stack.length > 0 && !dissolving() && !renderer.getSelection()?.getSelectedText(),
    bindings: [
      {
        key: "escape",
        desc: "Close dialog",
        group: "Dialog",
        cmd: () => {
          if (renderer.getSelection()) {
            renderer.clearSelection()
          }
          requestDismiss()
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
          requestDismiss()
        },
      },
    ],
  }))

  return {
    wash,
    dissolving,
    dismiss,
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
      {/*
        Keep this host intrinsic. Making it viewport-sized adds a hit-grid
        surface above the app and steals wheel/click/selection events even
        when no dialog is open. Dialog owns the full viewport.
        Intentionally disabled here — do not restore:
        left={0}, top={0}, width="100%", height="100%",
        minWidth={0}, minHeight={0}, flexDirection="column".
      */}
      <box
        id="arcana-dialog-host"
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
          <Dialog
            onClose={() => value.clear()}
            size={value.size}
            wash={value.wash}
            requestClose={value.dismiss}
          >
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
