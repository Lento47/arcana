/**
 * Optimistic user messages: show the user's prompt in the chat instantly
 * after Enter, without waiting for the SSE message.updated round-trip.
 *
 * The session view merges these into the messages() memo and synthesizes
 * a minimal TextPart via getParts(). When the real SSE event arrives with
 * the same text, the optimistic entry is dropped (deduped by title text).
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
