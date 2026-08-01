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

/**
 * Authoritative merge decision (P12.4). Used by reconcile() when the live
 * projection is repaired from REST after a detected divergence.
 *
 * Precedence is deterministic and does NOT trust the tracker-merge liveness
 * heuristic: a frozen local prefix ("## Qo" while REST has 7,962 chars) must
 * be replaced regardless of whether the part was recently tracked.
 *
 * 1. Tool parts: terminal remote state always beats local running.
 * 2. Text/reasoning: prefix-aware comparison. Remote append (remote text
 *    startsWith local and longer) wins. Local append (local startsWith
 *    remote and longer) wins temporarily ONLY if the local part is live
 *    (touched within the silence window) — REST snapshots lag a live stream.
 * 3. Divergent texts: a completed remote message wins; otherwise keep the
 *    apparently-newer local state and report non-convergence so the next
 *    heartbeat re-checks.
 */
export const TERMINAL_TOOL_STATES = new Set(["completed", "error", "denied", "cancelled"])

export type AuthoritativeMergeDecision = {
  keepLocal: boolean
  /** False when the local projection may still differ from durable truth. */
  converged: boolean
}

export function shouldKeepLocalAuthoritative(params: {
  rest: PartMergeCandidate
  current: PartMergeCandidate | undefined
  lastEventAt: number
  now: number
  silenceMs: number
}): AuthoritativeMergeDecision {
  const { rest, current, lastEventAt, now, silenceMs } = params
  if (!current) return { keepLocal: false, converged: true }

  const restType = rest.type ?? ""
  const localType = current.type ?? ""
  const restText = rest.text ?? ""
  const localText = current.text ?? ""

  // Tool parts: terminal authoritative state beats local running. No liveness
  // window preserves a local running state over a terminal remote state.
  if (restType === "tool" || localType === "tool") {
    const restState = (rest as { state?: { status?: string } }).state?.status
    const localState = (current as { state?: { status?: string } }).state?.status
    const restTerminal = restState !== undefined && TERMINAL_TOOL_STATES.has(restState)
    const localTerminal = localState !== undefined && TERMINAL_TOOL_STATES.has(localState)
    if (restTerminal && !localTerminal) return { keepLocal: false, converged: true }
    if (!restTerminal && localTerminal) return { keepLocal: true, converged: false }
    // Both terminal (or both running): remote is the authoritative projection.
    return { keepLocal: false, converged: true }
  }

  // Text / reasoning parts (append-only streams).
  const localRecentlyTouched = now - lastEventAt < silenceMs

  if (restText.startsWith(localText) && restText.length > localText.length) {
    // Remote is a strict superset (frozen local prefix repaired).
    return { keepLocal: false, converged: true }
  }
  if (localText.startsWith(restText) && localText.length > restText.length) {
    if (localRecentlyTouched) {
      // Live stream ahead of the REST snapshot; keep streaming locally.
      return { keepLocal: true, converged: false }
    }
    // Local longer but silent: ambiguous; remote is authoritative.
    return { keepLocal: false, converged: false }
  }
  if (localText === restText) {
    return { keepLocal: true, converged: true }
  }
  // Divergent texts.
  const restCompleted = (rest as { completed?: boolean }).completed === true
  if (restCompleted) {
    return { keepLocal: false, converged: true }
  }
  if (localRecentlyTouched) {
    // Both streaming and diverged: keep the local (apparently newer) state,
    // report non-convergence so the next heartbeat re-checks.
    return { keepLocal: true, converged: false }
  }
  return { keepLocal: false, converged: false }
}
