/**
 * Optimistic user messages: show the user's prompt in the chat instantly
 * after Enter, without waiting for the SSE message.updated round-trip.
 *
 * IMPORTANT: Do not drop optimistics when a bare user message row appears.
 * SSE often creates the user Message before any TextPart — dropping early
 * produces spine "you …" with no body. Keep optimistics until real parts
 * carry non-empty text (Grok keeps local echo until content is present).
 */
import { createSignal } from "solid-js"

export interface OptimisticUserMessage {
  id: string
  sessionID: string
  text: string
  timestamp: number
  agent: string
  model: {
    providerID: string
    modelID: string
    variant?: string
  }
}

const [state, setState] = createSignal<OptimisticUserMessage[]>([])

/** Reactive accessor — call as `allOptimisticMessages()` inside a memo/effect. */
export const allOptimisticMessages = state

/** Add an optimistic user message. Called from submitInner after prompt send. */
export function addOptimisticMessage(msg: OptimisticUserMessage) {
  setState((prev) => [...prev, msg])
}

/** Move local echo onto the real session id after create finishes. */
export function remapOptimisticSession(fromSessionID: string, toSessionID: string) {
  if (!fromSessionID || fromSessionID === toSessionID) return
  setState((prev) =>
    prev.map((msg) => (msg.sessionID === fromSessionID ? { ...msg, sessionID: toSessionID } : msg)),
  )
}

/**
 * Remove optimistic messages. Pass a sessionID to clear only that session;
 * pass nothing to clear all (e.g. on app teardown).
 */
export function clearOptimisticMessages(sessionID?: string) {
  if (sessionID !== undefined) {
    setState((prev) => prev.filter((m) => m.sessionID !== sessionID))
  } else {
    setState([])
  }
}

/** Normalize for optimistic ↔ real text matching. */
export function normalizeOptimisticText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
}

/**
 * True when a real user message has enough text content to replace the local echo.
 * Bare message rows without parts must return false (otherwise UI shows "…").
 */
export function realUserMessageHasText(
  message: { id: string; role?: string },
  parts: ReadonlyArray<{ type?: string; text?: string; synthetic?: boolean; ignored?: boolean }>,
): boolean {
  if (message.role !== "user") return false
  if (message.id.startsWith("optimistic-")) return false
  return parts.some(
    (p) =>
      p.type === "text"
      && !p.synthetic
      && !p.ignored
      && typeof p.text === "string"
      && p.text.trim().length > 0,
  )
}

/**
 * Keep optimistics that are not yet covered by a real user message with text.
 * Drops an optimistic when any real user message in-session has non-empty text
 * that matches (or when any real user text exists and we only have one optimistic).
 */
export function filterCoveredOptimistics(
  optimistics: OptimisticUserMessage[],
  realUserTexts: string[],
): OptimisticUserMessage[] {
  if (optimistics.length === 0) return optimistics
  if (realUserTexts.length === 0) return optimistics

  const covered = new Set(realUserTexts.map(normalizeOptimisticText).filter(Boolean))
  return optimistics.filter((o) => {
    const key = normalizeOptimisticText(o.text)
    if (!key) return false
    // Exact match: real part arrived for this send
    if (covered.has(key)) return false
    // Prefix match for partial stream edge cases
    for (const t of covered) {
      if (t === key || t.startsWith(key) || key.startsWith(t)) return false
    }
    return true
  })
}
