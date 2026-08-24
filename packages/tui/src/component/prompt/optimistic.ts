/**
 * Optimistic user messages: show an admitted prompt without waiting for the
 * SSE message.updated round-trip. Prompts waiting in the delivery queue stay
 * in the fixed composer tray and never enter the transcript early.
 *
 * IMPORTANT: Do not drop optimistics when a bare user message row appears.
 * SSE often creates the user Message before any TextPart — dropping early
 * produces spine "you …" with no body. Keep optimistics until real parts
 * carry non-empty text (Grok keeps local echo until content is present).
 */
import { createSignal } from "solid-js"

export interface OptimisticUserMessage {
  id: string
  /** Stable client-selected id used by promptAsync and the SSE message. */
  messageID: string
  sessionID: string
  text: string
  timestamp: number
  agent: string
  model: {
    providerID: string
    modelID: string
    variant?: string
  }
  /** True while delivery is held in the local queue (linear timeline row). */
  queued?: boolean
}

const [state, setState] = createSignal<OptimisticUserMessage[]>([])

/** Reactive accessor — call as `allOptimisticMessages()` inside a memo/effect. */
export const allOptimisticMessages = state

/** Add or update the local echo for one admitted server message id. */
export function addOptimisticMessage(msg: OptimisticUserMessage) {
  setState((prev) => {
    const index = prev.findIndex((entry) => entry.messageID === msg.messageID)
    if (index === -1) return [...prev, msg]
    const next = prev.slice()
    next[index] = msg
    return next
  })
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

/** Normalize prompt text for display-oriented tests and callers. */
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
 * Keep optimistics until the exact server message id has arrived with text.
 * Text is deliberately not used for correlation: repeated identical prompts
 * are independent sends and must be acknowledged independently.
 */
export function filterCoveredOptimistics(
  optimistics: OptimisticUserMessage[],
  acknowledgedMessageIDs: ReadonlySet<string>,
): OptimisticUserMessage[] {
  if (optimistics.length === 0) return optimistics
  if (acknowledgedMessageIDs.size === 0) return optimistics
  return optimistics.filter((message) => !acknowledgedMessageIDs.has(message.messageID))
}

/** Remove one local echo when its delivery remains queued or fails. */
export function removeOptimisticMessage(messageID: string) {
  setState((prev) => prev.filter((message) => message.messageID !== messageID))
}

/** Flip one local echo's queued marker without touching the rest. */
export function markOptimisticQueued(messageID: string, queued: boolean) {
  setState((prev) => {
    const index = prev.findIndex((message) => message.messageID === messageID)
    if (index === -1) return prev
    const next = prev.slice()
    next[index] = { ...next[index]!, queued }
    return next
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
  queued?: boolean
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
    queued: o.queued,
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
const EMPTY_TRANSCRIPT: TurnMessage[] = []

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
 * Re-order a store transcript only when membership changes.
 *
 * Solid store arrays keep identity across in-place splices and item
 * replacements. Returning a new array on every pulse defeats downstream
 * memos; returning the store array itself hides membership changes.
 * Reuse `previous` when the same objects are already in transcript order,
 * remap object slots when identities changed, and only walk the full
 * orderer when ids/length changed.
 */
export function refreshTranscriptOrder<T extends TurnMessage>(
  stored: readonly T[],
  previous: readonly T[] | undefined,
): T[] {
  if (stored.length === 0) {
    return (previous && previous.length === 0 ? previous : EMPTY_TRANSCRIPT) as T[]
  }
  if (stored.length === 1) {
    if (previous?.length === 1 && previous[0] === stored[0]) return previous as T[]
    return [stored[0]!]
  }

  if (previous && previous.length === stored.length) {
    const byId = new Map<string, T>()
    for (const message of stored) {
      if (byId.has(message.id)) return orderTranscriptMessages(stored)
      byId.set(message.id, message)
    }
    const remapped = new Array<T>(previous.length)
    for (let i = 0; i < previous.length; i++) {
      const cur = byId.get(previous[i]!.id)
      if (!cur) return orderTranscriptMessages(stored)
      remapped[i] = cur
    }
    for (let i = 0; i < previous.length; i++) {
      if (remapped[i] !== previous[i]) return remapped
    }
    return previous as T[]
  }

  return orderTranscriptMessages(stored)
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
