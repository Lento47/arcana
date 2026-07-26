/**
 * Turn lifecycle for spine assistant chrome (spinner / "writing" / markdown streaming).
 *
 * Content (what text to show) is separate from lifecycle (whether the turn is still
 * producing). Grok drives chrome from explicit turn/session running state; Arcana
 * must not rely only on `message.time.completed` for no-tool replies.
 *
 * Engine model (SessionStatus): missing map entry === idle. The TUI status poll
 * only returns non-idle sessions, so `session_status[id]` is often `undefined`
 * after a turn ends — treat that like idle, not like "still writing".
 */

export type AssistantSegmentKind = "plan" | "ok" | "think"

export type TurnLifecycle = {
  /** message.time.completed is set */
  messageCompleted: boolean
  /** message.finish is set (any terminal reason, including error) */
  messageFinished: boolean
  /**
   * Session is not actively running a turn.
   * True for type "idle", missing/undefined status, or any non-busy/non-retry type.
   */
  sessionIdle: boolean
  /** Session is busy or retrying (explicit active turn). */
  sessionTurnActive: boolean
  /** This message is the latest assistant message in the session */
  isLatestAssistant: boolean
  /** Later tool/text/step exists after this segment (plan mid-turn, think then tool) */
  segmentSuperseded: boolean
  /** text/reasoning part.time.end if present */
  partEnded: boolean
}

/** Engine only keeps busy/retry in the status map; everything else is idle. */
export function isSessionTurnActive(sessionStatusType?: string): boolean {
  return sessionStatusType === "busy" || sessionStatusType === "retry"
}

/**
 * Whether a spine assistant segment should show streaming chrome.
 * Terminal signals always win. Writing requires an explicitly active session turn
 * (busy/retry) so missing status after idle cannot resurrect the shimmer.
 */
export function isAssistantSegmentStreaming(
  _kind: AssistantSegmentKind,
  L: TurnLifecycle,
): boolean {
  // Only the latest assistant message may show writing chrome.
  if (!L.isLatestAssistant) return false
  if (L.messageCompleted || L.messageFinished) return false
  if (L.partEnded) return false
  if (L.segmentSuperseded) return false
  // No active turn → stop (covers idle, undefined after poll, and crashed sessions).
  if (!L.sessionTurnActive) return false
  return true
}

export function buildTurnLifecycle(input: {
  message: {
    role?: string
    time?: { created?: number; completed?: number }
    finish?: string
  }
  /** Primary part for this segment (text or reasoning), if any */
  part?: { time?: { end?: number } }
  /**
   * Explicit segment-level "all text parts closed" signal.
   * When provided, takes precedence over `part?.time.end` so multi-part plan/ok
   * entries can require every joined text part to have ended (not only parts[0]).
   */
  partEnded?: boolean
  segmentSuperseded: boolean
  isLatestAssistant: boolean
  sessionStatusType?: string
}): TurnLifecycle {
  const { message, part, segmentSuperseded, isLatestAssistant, sessionStatusType } = input
  const messageCompleted = !!(message.time && "completed" in message.time && message.time.completed)
  const messageFinished = typeof message.finish === "string" && message.finish.length > 0
  const partEnded = input.partEnded ?? !!(part?.time && part.time.end)
  const sessionTurnActive = isSessionTurnActive(sessionStatusType)
  const sessionIdle = !sessionTurnActive

  return {
    messageCompleted,
    messageFinished,
    sessionIdle,
    sessionTurnActive,
    isLatestAssistant,
    segmentSuperseded,
    partEnded,
  }
}
