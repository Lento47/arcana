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
    // Exact match only. Prefix-against-history dropped later sends like
    // "fix" after "fix the tests".
    return !covered.has(key)
  })
}

export type OptimisticMessageProxy = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: OptimisticUserMessage["model"]
  text: string
}

function toProxy(o: OptimisticUserMessage): OptimisticMessageProxy {
  return {
    id: o.id,
    sessionID: o.sessionID,
    role: "user",
    time: { created: o.timestamp },
    agent: o.agent,
    model: o.model,
    text: o.text,
  }
}

type TurnMessage = {
  id: string
  role?: string
  parentID?: string
  time?: { created?: number; completed?: number }
}

function messageCreated(message: TurnMessage): number {
  return message.time?.created ?? 0
}

function compareCreatedThenId(a: TurnMessage, b: TurnMessage): number {
  const created = messageCreated(a) - messageCreated(b)
  if (created !== 0) return created
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function assistantParentID(message: TurnMessage): string | undefined {
  if (message.role === "user") return undefined
  return typeof message.parentID === "string" && message.parentID ? message.parentID : undefined
}

/**
 * True when an assistant belongs to the send at `userCreated` / `userId`.
 * Prefer parentID. Do not treat every still-open prior reply as this turn.
 */
export function isThisTurnAssistant(
  message: TurnMessage,
  userCreated: number,
  userId?: string,
): boolean {
  if (message.role !== "assistant") return false
  const parentID = assistantParentID(message)
  if (userId && parentID) return parentID === userId
  const created = messageCreated(message)
  if (created && created >= userCreated) return true
  if (!created && !message.time?.completed) return true
  return false
}

/**
 * Linear chat order: each user, then that user's assistants.
 *
 * The sync store inserts by message id (binary search). UUID ids scramble
 * send order, so the spine must not walk the store as a transcript.
 */
export function orderTranscriptMessages<T extends TurnMessage>(messages: readonly T[]): T[] {
  if (messages.length <= 1) return messages.slice()

  const users: T[] = []
  for (const message of messages) {
    if (message.role === "user") users.push(message)
  }
  users.sort(compareCreatedThenId)
  const userIds = new Set(users.map((user) => user.id))

  const children = new Map<string, T[]>()
  const unattached: T[] = []
  for (const message of messages) {
    if (message.role === "user") continue
    const parentID = assistantParentID(message)
    if (parentID && userIds.has(parentID)) {
      const list = children.get(parentID)
      if (list) list.push(message)
      else children.set(parentID, [message])
    } else {
      unattached.push(message)
    }
  }

  unattached.sort(compareCreatedThenId)
  const leftover: T[] = []
  for (const assistant of unattached) {
    const created = messageCreated(assistant)
    let owner: T | undefined
    for (const user of users) {
      if (messageCreated(user) <= created) owner = user
      else break
    }
    if (!owner) owner = users[0]
    if (!owner) {
      leftover.push(assistant)
      continue
    }
    const list = children.get(owner.id)
    if (list) list.push(assistant)
    else children.set(owner.id, [assistant])
  }

  const out: T[] = []
  for (const user of users) {
    out.push(user)
    const kids = children.get(user.id)
    if (!kids?.length) continue
    kids.sort(compareCreatedThenId)
    out.push(...kids)
  }
  leftover.sort(compareCreatedThenId)
  out.push(...leftover)
  return out
}

/** @deprecated Use orderTranscriptMessages — kept so existing call sites stay valid. */
export function pinUserBeforeOpenAssistants<T extends TurnMessage>(messages: readonly T[]): T[] {
  return orderTranscriptMessages(messages)
}

/**
 * Place local user echo after prior turns and before this-turn assistants.
 * Never prepend to the whole transcript.
 */
export function mergeOptimisticMessages<T extends TurnMessage>(
  stored: readonly T[],
  optimistics: readonly OptimisticUserMessage[],
): Array<T | OptimisticMessageProxy> {
  if (optimistics.length === 0) return orderTranscriptMessages(stored)
  const out: Array<T | OptimisticMessageProxy> = stored.slice()
  for (const opt of optimistics) {
    if (out.some((item) => item.id === opt.id)) continue
    out.push(toProxy(opt))
  }
  return orderTranscriptMessages(out)
}
