import { createContext, useContext, createSignal, type ParentProps, Show, Switch, Match, For } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { Glyph } from "../branding"
import { useRenderer } from "@opentui/solid"
import { useTerminalSize } from "../util/terminal-size"
import { SplitBorder } from "./border"
import { Layer, Size, Space } from "./chrome"
import { paneWidth } from "../util/geometry"
import { TextAttributes, type MouseEvent } from "@opentui/core"
import { Scramble } from "../component/scramble"

export type ToastOptions = {
  id: number
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
}
type ToastInput = Omit<ToastOptions, "id" | "duration"> & { duration?: number }

/**
 * A notice is a toast that outlives its card: the tray keeps the last
 * `MAX_NOTICES` — including repeats, which collapse into one entry with a
 * count (the same failure retried every second is one notice, not sixty).
 */
export type Notice = ToastOptions & {
  /** When the notice last arrived (the last repeat, for a deduped notice). */
  at: number
  count: number
}

type LiveToast = ToastOptions & { at: number; count: number }

const MAX_VISIBLE = 3
const MAX_NOTICES = 200
/** Repeats inside this window collapse into the previous notice. */
const DEDUPE_WINDOW_MS = 8_000

/**
 * The toast's duration ladder, in milliseconds.
 *
 * Duration is reading time, not severity: the app shows an 8-second `info`
 * notice (a report the operator scans) and a 5-second `warning` (one line to
 * act on). Pick the tier by how much there is to read, or pass an explicit
 * number for an off-ladder case (a download in progress, a 2-second cue).
 */
export const ToastDuration = {
  /** A flash: state that is also visible elsewhere (a mode toggle). */
  flash: 1800,
  /** A quick cue: an action acknowledged as it happens. */
  brief: 3000,
  /** The module default: a sentence to read and act on. */
  normal: 5000,
  /** A notice with detail worth re-reading. */
  long: 8000,
  /** An outcome worth attention when the operator looks up. */
  extended: 10_000,
  /** Work in progress, refreshed by the next event. */
  progress: 30_000,
  /** A failure: read it, act, dismiss. The `toast.error` default. */
  error: 14_000,
} as const

/** Default auto-dismiss. Errors stay longer so decrypt + reading can finish. */
const DEFAULT_DURATION_MS = ToastDuration.normal
const DEFAULT_ERROR_DURATION_MS = ToastDuration.error
let _nextId = 0

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalSize(useRenderer())

  return (
    <box
      position="absolute"
      justifyContent="flex-start"
      alignItems="flex-end"
      top={2}
      right={2}
      flexDirection="column"
      gap={Space.gap}
      zIndex={Layer.toast}
    >
      <For each={toast.toasts.slice(-MAX_VISIBLE)}>
        {(item) => {
          const [dismissHovered, setDismissHovered] = createSignal(false)
          /**
           * The dismiss glyph is a leaf affordance and mouse events bubble to every
           * ancestor (`Renderable.processMouseEvent`), up to the app root's
           * copy-on-select `onMouseUp`. Dismissing empties the store during
           * dispatch, which detaches this node before the walk reads
           * `this.parent`, so the walk happens to dead-end here and the app
           * handler happens not to run — a shield by accident of the removal
           * being synchronous, not a decision. This claims the click outright,
           * so a dismissal that lingers (a fade, a queued store update) cannot
           * quietly start copying the operator's selection instead.
           */
          const handleDismissMouseUp = (event: MouseEvent) => {
            event.stopPropagation?.()
            toast.dismiss(item.id)
          }
          return (
            <box
              // The card is a fixed-width column pinned to the top-right corner,
              // so its budget has to be the terminal less the corner it hangs
              // from and the margin that keeps it off the left edge — clamped,
              // because `useTerminalSize` reports an unmeasured renderer as 0
              // and `min(60, -6)` is a negative `maxWidth` handed to yoga.
              maxWidth={Math.min(Size.toastMaxWidth, paneWidth(dimensions().width, Size.toastInset))}
              paddingLeft={Space.padX}
              paddingRight={Space.unit}
              paddingTop={Space.padY}
              paddingBottom={Space.padY}
              backgroundColor={theme.backgroundPanel}
              borderColor={theme[item.variant]}
              border={["left", "right"]}
              customBorderChars={SplitBorder.customBorderChars}
              flexDirection="row"
              gap={Space.gap}
              alignItems="flex-start"
            >
              <box flexGrow={1}>
                <Show when={item.title}>
                  <text attributes={TextAttributes.BOLD} fg={theme.text}>
                    {item.title}
                  </text>
                </Show>
                <Switch>
                  <Match when={item.variant === "error"}>
                    <Scramble error text={item.message} fg={theme.error} />
                  </Match>
                  <Match when={true}>
                    <text fg={theme.text} wrapMode="word">
                      {item.message}
                    </text>
                  </Match>
                </Switch>
              </box>
              <Show when={item.count > 1}>
                <text fg={theme.textMuted} flexShrink={0}>
                  {Glyph.repeat}{item.count}
                </text>
              </Show>
              <box flexShrink={0}>
                <text
                  fg={dismissHovered() ? theme.text : theme.textMuted}
                  onMouseUp={handleDismissMouseUp}
                  onMouseOver={() => setDismissHovered(true)}
                  onMouseOut={() => setDismissHovered(false)}
                >
                  {Glyph.dismiss}
                </text>
              </box>
            </box>
          )
        }}
      </For>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    toasts: [] as LiveToast[],
    notices: [] as Notice[],
  })

  const timers = new Map<number, NodeJS.Timeout>()

  function sameNotice(a: { title?: string; message: string; variant: string }, b: { title?: string; message: string; variant: string }) {
    return a.variant === b.variant && a.message === b.message && (a.title ?? "") === (b.title ?? "")
  }

  const toast = {
    show(options: ToastInput) {
      const now = Date.now()
      const signature = { title: options.title, message: options.message, variant: options.variant }
      const duration =
        options.duration ?? (options.variant === "error" ? DEFAULT_ERROR_DURATION_MS : DEFAULT_DURATION_MS)

      // A repeat of the most recent notice inside the window is the same
      // notice: bump its count, refresh the card's timer if it is still up,
      // and never stack a second identical card.
      const last = store.notices.at(-1)
      if (last && sameNotice(last, signature) && now - last.at <= DEDUPE_WINDOW_MS) {
        const count = last.count + 1
        setStore("notices", store.notices.length - 1, { at: now, count })
        const visible = store.toasts.findIndex((t) => t.id === last.id)
        if (visible >= 0) {
          const timer = timers.get(last.id)
          if (timer) clearTimeout(timer)
          const next = setTimeout(() => toast.dismiss(last.id), duration)
          next.unref()
          timers.set(last.id, next)
          setStore("toasts", visible, { at: now, count })
        }
        return last.id
      }

      const id = ++_nextId
      const item: LiveToast = { id, ...signature, duration, at: now, count: 1 }
      setStore("toasts", (prev) => [...prev.slice(-MAX_VISIBLE), item])
      setStore("notices", (prev) => [...prev.slice(-(MAX_NOTICES - 1)), item])

      // Auto-dismiss after duration
      const timer = setTimeout(() => toast.dismiss(id), item.duration)
      timer.unref()
      timers.set(id, timer)
      return id
    },
    dismiss(id: number) {
      const existing = timers.get(id)
      if (existing) clearTimeout(existing)
      timers.delete(id)
      setStore("toasts", (prev) => prev.filter((t) => t.id !== id))
    },
    clearNotices() {
      setStore("notices", [])
    },
    error: (err: any) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string" && err.trim()
            ? err.trim()
            : "An unknown error occurred — retry the action; if it persists, check the logs"
      toast.show({ variant: "error", message, duration: DEFAULT_ERROR_DURATION_MS })
    },
    get toasts(): readonly LiveToast[] {
      return store.toasts
    },
    /** The tray: newest last, repeats collapsed with a count. */
    get notices(): readonly Notice[] {
      return store.notices
    },
  }
  return toast
}

export type ToastContext = ReturnType<typeof init>

const ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}
