import { batch, onCleanup } from "solid-js"

/**
 * Presentation budget for streamed content.  The transport may deliver many
 * deltas per frame, but the terminal should commit one complete visual frame
 * at most this often.
 */
export const STREAM_FRAME_INTERVAL_MS = 50

type FrameHandle =
  | { kind: "raf"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> }

export type StreamFrameGate = {
  /** Replace the pending callback for a key and schedule one frame commit. */
  schedule: (key: string, callback: () => void) => void
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
  clearTimeout(handle.id)
}

/**
 * Coalesces independent stream-driven invalidations into one renderer frame.
 * Keys make the gate useful to a content publisher and a scroll follower at
 * the same time without allowing a newer callback to erase an unrelated one.
 */
export function createStreamFrameGate(intervalMs = STREAM_FRAME_INTERVAL_MS): StreamFrameGate {
  const pending = new Map<string, () => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame: FrameHandle | undefined
  let lastFlush = Number.NEGATIVE_INFINITY
  let disposed = false

  const runPending = () => {
    frame = undefined
    timer = undefined
    if (disposed || pending.size === 0) return
    lastFlush = performance.now()
    const callbacks = [...pending.values()]
    pending.clear()
    // Solid effects otherwise flush once per callback. Batching keeps every
    // stream-owned signal in the same renderer commit, so content and scroll
    // never expose an intermediate terminal frame to the diff renderer.
    batch(() => {
      for (const callback of callbacks) callback()
    })
  }

  const requestCommit = (delay: number) => {
    if (disposed || frame) return
    if (delay > 0) {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        if (disposed || pending.size === 0) return
        frame = requestFrame(runPending)
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
    frame = requestFrame(runPending)
  }

  const schedule = (key: string, callback: () => void) => {
    if (disposed) return
    pending.set(key, callback)
    const elapsed = performance.now() - lastFlush
    requestCommit(Math.max(0, intervalMs - elapsed))
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
    if (!frame) frame = requestFrame(runPending)
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
