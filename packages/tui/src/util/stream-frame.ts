import { batch, onCleanup } from "solid-js"

/**
 * Presentation budget for streamed content.  The transport may deliver many
 * deltas per frame, but the terminal should commit one complete visual frame
 * at most this often.
 *
 * Two lanes share the gate: `tail` work (the live text edge, scroll follower)
 * commits at the base cadence, while `layout` work (tables, code blocks,
 * anything that re-measures) is deferred to a slower budget so a heavy block
 * cannot stall the tail. All due work still commits in a single renderer
 * frame — lanes decide *when* a key becomes due, never a separate frame.
 */
export const STREAM_FRAME_INTERVAL_MS = 50
/** Default cadence for the live tail lane when the gate uses the base budget. */
export const STREAM_FRAME_TAIL_MS = 33
/** Default cadence for layout-heavy keys. */
export const STREAM_FRAME_LAYOUT_MS = 100

export type StreamLane = "tail" | "layout"

type FrameHandle =
  | { kind: "raf"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> }
  | { kind: "pending" }

export type StreamFrameGate = {
  /** Replace the pending callback for a key and schedule one frame commit. */
  schedule: (key: string, callback: () => void, options?: { lane?: StreamLane }) => void
  /** Remove a pending callback without affecting other keys. */
  cancel: (key: string) => void
  /** Run all pending callbacks on the next renderer frame immediately. */
  flush: () => void
  /** Cancel all pending work. Safe to call more than once. */
  dispose: () => void
}

function requestFrame(callback: (time: number) => void): FrameHandle {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return { kind: "raf", id: globalThis.requestAnimationFrame(callback) }
  }
  return {
    kind: "timeout",
    id: setTimeout(() => callback(performance.now()), 0),
  }
}

function cancelFrame(handle: FrameHandle | undefined): void {
  if (!handle) return
  if (handle.kind === "raf" && typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle.id)
    return
  }
  if (handle.kind === "timeout") clearTimeout(handle.id)
}

/**
 * Coalesces independent stream-driven invalidations into one renderer frame.
 * Keys make the gate useful to a content publisher and a scroll follower at
 * the same time without allowing a newer callback to erase an unrelated one.
 * Lanes add a second dimension: a key's lane decides when it becomes due.
 */
export function createStreamFrameGate(
  intervalMs = STREAM_FRAME_INTERVAL_MS,
  options: { tailMs?: number; layoutMs?: number } = {},
): StreamFrameGate {
  const intervals: Record<StreamLane, number> = {
    tail: options.tailMs ?? intervalMs,
    layout: options.layoutMs ?? Math.max(intervalMs, STREAM_FRAME_LAYOUT_MS),
  }
  const pending = new Map<string, { callback: () => void; lane: StreamLane }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame: FrameHandle | undefined
  // Lane clocks start when the gate is created: a layout key scheduled right
  // now waits its full budget, it is not immediately due from -Infinity.
  const startedAt = performance.now()
  const lastFlush: Record<StreamLane, number> = {
    tail: startedAt,
    layout: startedAt,
  }
  let disposed = false

  const delayFor = (lane: StreamLane) => {
    const elapsed = performance.now() - lastFlush[lane]
    return Math.max(0, intervals[lane] - elapsed)
  }

  const runPending = (force: boolean) => {
    frame = undefined
    timer = undefined
    if (disposed || pending.size === 0) return
    const now = performance.now()
    const due: Array<() => void> = []
    for (const [key, entry] of [...pending]) {
      if (!force && now - lastFlush[entry.lane] < intervals[entry.lane]) continue
      pending.delete(key)
      lastFlush[entry.lane] = now
      due.push(entry.callback)
    }
    if (due.length === 0) {
      requestCommit()
      return
    }
    // Solid effects otherwise flush once per callback. Batching keeps every
    // stream-owned signal in the same renderer commit, so content and scroll
    // never expose an intermediate terminal frame to the diff renderer.
    batch(() => {
      for (const callback of due) callback()
    })
  }

  /**
   * Reserve the frame slot BEFORE scheduling. A synchronous RAF (bun test,
   * jsdom) runs the callback before `requestFrame` returns, so assigning the
   * handle after the call would overwrite the `undefined` the callback just
   * wrote — leaving a stale handle that blocks every later commit. The
   * `pending` sentinel is claimed by the real handle only when the callback
   * has not already run.
   */
  const commitFrame = () => {
    if (disposed || frame) return
    frame = { kind: "pending" }
    const handle = requestFrame(() => {
      frame = undefined
      runPending(false)
    })
    if (frame !== undefined) frame = handle
  }

  const requestCommit = () => {
    if (disposed || frame) return
    let delay = Number.POSITIVE_INFINITY
    for (const entry of pending.values()) delay = Math.min(delay, delayFor(entry.lane))
    if (!Number.isFinite(delay)) return
    if (delay > 0) {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        if (disposed || pending.size === 0) return
        commitFrame()
      }, delay)
      return
    }
    // A delayed timer may still be queued when the monotonic clock says the
    // budget elapsed. Cancel it before issuing the immediate frame; otherwise
    // it could enqueue a second RAF for the same pending callbacks.
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    commitFrame()
  }

  const schedule = (key: string, callback: () => void, scheduleOptions: { lane?: StreamLane } = {}) => {
    if (disposed) return
    pending.set(key, { callback, lane: scheduleOptions.lane ?? "tail" })
    requestCommit()
  }

  const cancel = (key: string) => {
    pending.delete(key)
    if (pending.size === 0 && timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const flush = () => {
    if (disposed || pending.size === 0) return
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (!frame) commitFrame()
    runPending(true)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    pending.clear()
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    cancelFrame(frame)
    frame = undefined
  }

  return { schedule, cancel, flush, dispose }
}

/**
 * Solid helper for gates owned by a component.  It keeps timer/frame cleanup
 * adjacent to the component lifecycle so a session switch cannot publish a
 * stale frame into the next route.
 */
export function useStreamFrameGate(
  existing?: StreamFrameGate,
  intervalMs = STREAM_FRAME_INTERVAL_MS,
): StreamFrameGate {
  if (existing) return existing
  const gate = createStreamFrameGate(intervalMs)
  onCleanup(gate.dispose)
  return gate
}
