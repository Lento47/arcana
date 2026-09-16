import { CliRenderEvents } from "@opentui/core"
import { createSignal, onCleanup, type Accessor } from "solid-js"

/**
 * One resize subscription per renderer, shared by every surface that watches
 * the terminal.
 *
 * `useTerminalDimensions()` from `@opentui/solid` subscribes on every call, and
 * this app calls it from eleven independently mounted surfaces (the app frame,
 * the home route and its backdrop, the prompt, the autocomplete, the metrics
 * bar, the diff viewer, the plugin dialogs, which-key, move-session, the error
 * boundary) — plus the statusbar, the home footer and the subagent footer
 * subscribe to `CliRenderEvents.RESIZE` directly for the same number. Past ten
 * listeners Node's EventEmitter prints "Possible EventEmitter memory leak
 * detected. 11 resize listeners added to [CliRenderer]", which is a false
 * positive here — the count is bounded and every subscriber unmounts its own —
 * but the warning is a symptom of the real cost: eleven closures woken on every
 * resize tick, each updating its own signal, to answer the same question.
 *
 * The measurement is identical for all of them, so it is taken once per
 * renderer. `consumers` is a refcount rather than a strong reference to the
 * components: the signal is created outside any owner (it has no reason to die
 * with the first consumer), and the subscription ends when the last one does.
 * The map is keyed weakly, so a destroyed renderer takes its entry with it.
 *
 * A renderer that has not been laid out yet reports zero rather than nothing —
 * the same "0 means unmeasured" convention `useTerminalDimensions` uses, so a
 * migrated call site keeps its arithmetic. `rendererWidth` is the guard for
 * consumers that must tell the two apart.
 */
export type TerminalSize = { width: number; height: number }

/**
 * The slice of the renderer this needs. Narrow on purpose: a test can hand it
 * an emitter without standing up a terminal.
 */
export type SizeSource = {
  readonly width?: number
  readonly height?: number
  on(event: string, listener: (width: number, height: number) => void): unknown
  off(event: string, listener: (width: number, height: number) => void): unknown
}

type SharedSize = {
  readonly size: Accessor<TerminalSize>
  consumers: number
  readonly update: () => void
}

const shared = new WeakMap<object, SharedSize>()

/** Whole, non-negative cells; anything unmeasurable reads as zero. */
function cells(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

function measure(renderer: SizeSource): TerminalSize {
  return { width: cells(renderer.width), height: cells(renderer.height) }
}

const UNMEASURED: TerminalSize = { width: 0, height: 0 }
const unmeasured: Accessor<TerminalSize> = () => UNMEASURED

/**
 * The same shared accessor, for a caller that already has the renderer. A
 * plugin is handed its renderer as a prop rather than through a context, so the
 * argument is optional: without one there is nothing to watch and nothing to
 * unwatch, and the size stays unmeasured.
 */
export function useTerminalSize(renderer: SizeSource | undefined): Accessor<TerminalSize> {
  if (!renderer) return unmeasured
  let entry = shared.get(renderer)
  if (!entry) {
    const [size, setSize] = createSignal<TerminalSize>(measure(renderer))
    const update = () => setSize(measure(renderer))
    renderer.on(CliRenderEvents.RESIZE, update)
    entry = { size, consumers: 0, update }
    shared.set(renderer, entry)
  }
  entry.consumers++
  // Only the consumer that takes the count to zero detaches. Whoever created
  // the entry is not special: the first surface to mount can be the first to
  // unmount — a route swap does exactly that — and the ones still mounted would
  // otherwise be left watching a subscription nobody owns.
  const live = entry
  onCleanup(() => {
    live.consumers--
    if (live.consumers > 0) return
    renderer.off(CliRenderEvents.RESIZE, live.update)
    shared.delete(renderer)
  })
  return entry.size
}

/**
 * How many surfaces currently share this renderer's subscription. Exported for
 * the test that pins the deduplication, not for production decisions.
 */
export function terminalSizeConsumers(renderer: SizeSource): number {
  return shared.get(renderer)?.consumers ?? 0
}
