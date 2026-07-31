/**
 * Hydration merge decision for session parts.
 *
 * When a REST hydration lands while the SSE stream is live, parts touched
 * by live deltas must keep their locally-accumulated version: deltas are
 * not persisted server-side until text-end (see engine processor.ts), so
 * the REST snapshot can lag behind the live store.
 *
 * But once the stream is silent past the heartbeat window, the stream is
 * dead: the REST version is authoritative and must replace the truncated
 * local prefix. Without this liveness gate, a part that received deltas
 * before a silent death stays a truncated prefix across every resync.
 */

export type PartMergeCandidate = {
  id: string
  type?: string
  text?: string
}

export function shouldKeepLocalPart(params: {
  /** The part as delivered by REST. */
  rest: PartMergeCandidate
  /** The part currently in the store, if any. */
  current: PartMergeCandidate | undefined
  /** True if the part was touched by live events during this hydration. */
  tracked: boolean
  /** Epoch ms of the last live part event (delta or full update) for this part. */
  lastEventAt: number
  now: number
  /** Silence window; beyond it a tracked part is considered dead. */
  silenceMs: number
}): boolean {
  const { rest, current, tracked, lastEventAt, now, silenceMs } = params
  if (!current) return false

  // REST delivered an empty text/reasoning part but the store has
  // accumulated text. The server never persisted those deltas (pre-P3
  // daemons, or an abrupt death before a throttle flush); blanking the UI
  // would destroy the only copy of that text. Preserve the local version.
  if (
    (rest.type === "text" || rest.type === "reasoning") &&
    (current.type === "text" || current.type === "reasoning") &&
    (rest.text?.length ?? 0) === 0 &&
    (current.text?.length ?? 0) > 0
  ) {
    return true
  }

  // Tracked (live-event) part: keep local only while the stream is live.
  if (tracked) {
    return now - lastEventAt < silenceMs
  }

  return false
}
