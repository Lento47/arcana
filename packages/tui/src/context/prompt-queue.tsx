import { batch, createEffect, createSignal, onCleanup } from "solid-js"
import { createStore, produce, unwrap } from "solid-js/store"
import type { OpencodeClient } from "@arcana/sdk/v2"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useEvent } from "./event"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import { isRecord } from "../util/record"
import { addOptimisticMessage, markOptimisticQueued, removeOptimisticMessage } from "../component/prompt/optimistic"
import { logMessageDebug } from "../util/message-debug"
import { isPendingSessionID } from "../util/session"

export type QueuedPromptPayload = Parameters<OpencodeClient["session"]["promptAsync"]>[0]

export type QueuedPrompt = {
  id: string
  label: string
  createdAt: number
  attempts: number
  nextRetryAt: number
  lastError?: string
  failed: boolean
  payload: QueuedPromptPayload
}

type QueueStore = {
  items: QueuedPrompt[]
}

const KV_KEY = "queued_prompts_v1"
const BASE_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000
const MAX_ATTEMPTS = 5

export function createQueuedMessageID(): string {
  return `msg_${crypto.randomUUID().replaceAll("-", "")}`
}

export function isSessionWorking(status: unknown): boolean {
  return isRecord(status) && (status.type === "busy" || status.type === "retry" || status.type === "waiting")
}

export function createPromptDeliveryGate(onChange: (active: number) => void = () => {}) {
  const active = new Map<string, Promise<unknown>>()

  return {
    has: (id: string) => active.has(id),
    run: <T,>(id: string, task: () => Promise<T>): Promise<T> => {
      const current = active.get(id)
      if (current) return current as Promise<T>

      // Defer the task until after the promise is registered. This makes the
      // claim atomic even when a reactive drain wakes during submit().
      let promise!: Promise<T>
      promise = Promise.resolve()
        .then(task)
        .finally(() => {
          if (active.get(id) !== promise) return
          active.delete(id)
          onChange(active.size)
        })
      active.set(id, promise)
      onChange(active.size)
      return promise
    },
  }
}

export function releaseStaleSessions(
  activeSince: Map<string, number>,
  graceMs: number,
  now: number,
): string[] {
  const stale: string[] = []
  for (const [sessionID, since] of activeSince) {
    if (now - since > graceMs) stale.push(sessionID)
  }
  return stale
}

export function isRetryablePromptError(error: unknown): boolean {
  if (isRecord(error) && error.retryable === true) return true
  if (isRecord(error) && isRecord(error.data) && error.data.retryable === true) return true

  const message = errorMessage(error).toLowerCase()
  return [
    "unexpected server error",
    "network",
    "fetch failed",
    "failed to fetch",
    "unable to connect",
    "timed out",
    "timeout",
    "rate limit",
    "econn",
    "502",
    "503",
    "429",
  ].some((needle) => message.includes(needle))
}

function retryDelay(attempt: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1), MAX_RETRY_MS)
}

function sanitize(items: unknown): QueuedPrompt[] {
  if (!Array.isArray(items)) return []
  return items.filter((item): item is QueuedPrompt => {
    if (!isRecord(item)) return false
    return (
      typeof item.id === "string" &&
      typeof item.label === "string" &&
      typeof item.createdAt === "number" &&
      typeof item.attempts === "number" &&
      typeof item.nextRetryAt === "number" &&
      typeof item.failed === "boolean" &&
      isRecord(item.payload) &&
      typeof item.payload.sessionID === "string"
    )
  })
}

export const { use: usePromptQueue, provider: PromptQueueProvider } = createSimpleContext({
  name: "PromptQueue",
  init: () => {
    const kv = useKV()
    const sdk = useSDK()
    const sync = useSync()
    const event = useEvent()
    const toast = useToast()
    const [store, setStore] = createStore<QueueStore>({ items: [] })
    const [inFlightCount, setInFlightCount] = createSignal(0)
    const deliveries = createPromptDeliveryGate(setInFlightCount)
    // Server-reported status can lag a few frames behind the 204 response
    // from promptAsync. This set fills that gap so a queued retry can never
    // start a second turn while the first turn is still ramping up. It is
    // also self-healing: a session that stops reporting (its idle event was
    // missed, or the engine dropped it from its status map when it went
    // idle) is released after a short grace period so the queue can never
    // wedge forever.
    const activeSessions = new Set<string>()
    const activeSince = new Map<string, number>()
    const SESSION_STATUS_GRACE_MS = 5_000

    const markActive = (sessionID: string) => {
      activeSessions.add(sessionID)
      activeSince.set(sessionID, Date.now())
    }

    const releaseStale = () => {
      const now = Date.now()
      let released = false
      for (const sessionID of releaseStaleSessions(activeSince, SESSION_STATUS_GRACE_MS, now)) {
        activeSessions.delete(sessionID)
        activeSince.delete(sessionID)
        released = true
      }
      return released
    }

    let loaded = false
    let draining = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const persist = () => {
      kv.set(KV_KEY, unwrap(store.items))
    }

    createEffect(() => {
      for (const [sessionID, status] of Object.entries(sync.data.session_status)) {
        if (isSessionWorking(status)) markActive(sessionID)
        else {
          activeSessions.delete(sessionID)
          activeSince.delete(sessionID)
        }
      }
      if (releaseStale()) void drain()
    })

    const sessionWorking = (sessionID: string) =>
      activeSessions.has(sessionID) || isSessionWorking(sync.data.session_status[sessionID])

    createEffect(() => {
      const stored = kv.get(KV_KEY, undefined)
      if (stored === undefined || loaded) return
      const sanitized = sanitize(stored)
      if (sanitized.length > 0) setStore("items", sanitized)
      loaded = true
      queueMicrotask(() => void drain())
    })

    const scheduleNext = () => {
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = undefined
      const next = store.items
        .filter(
          (item) =>
            !item.failed
            && item.nextRetryAt <= Number.MAX_SAFE_INTEGER
            && !sessionWorking(item.payload.sessionID),
        )
        .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0]
      if (!next) return
      const delay = Math.max(250, next.nextRetryAt - Date.now())
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        void drain()
      }, delay)
    }

    const remove = (id: string) => {
      setStore(
        "items",
        produce((items) => {
          const index = items.findIndex((item) => item.id === id)
          if (index !== -1) {
            // Dropping a queued prompt also removes its linear timeline echo.
            const item = items[index]
            if (item) removeOptimisticMessage(item.payload.messageID!)
            items.splice(index, 1)
          }
        }),
      )
      persist()
      scheduleNext()
    }

    const update = (id: string, patch: Partial<Omit<QueuedPrompt, "id" | "payload">>) => {
      setStore(
        "items",
        produce((items) => {
          const item = items.find((entry) => entry.id === id)
          if (!item) return
          Object.assign(item, patch)
        }),
      )
      persist()
    }

    const sendStored = (item: QueuedPrompt): Promise<"sent" | "queued"> =>
      deliveries.run(item.id, async () => {
        const deliveryStarted = Date.now()
        const profileDelivery = process.env.ARCANA_PROFILE_SESSION_SWITCH === "1"
        try {
          // Duplicate guard is only meaningful for RETRIES: fresh sends mint
          // a brand-new message id and cannot already exist — skipping the
          // round-trip keeps the critical path to promptAsync at one call.
          if (item.attempts > 0 && item.payload.messageID) {
            const existing = await sdk.client.session
              .message({
                sessionID: item.payload.sessionID,
                messageID: item.payload.messageID,
              })
              .catch(() => undefined)
            if (existing?.data) {
              remove(item.id)
              toast.show({
                title: "Message already delivered",
                message: item.label,
                variant: "info",
              })
              return "sent"
            }
          }
          // A queued item must never be delivered against a client-side stub
          // id ("pending-…"): only session.create's remap turns it into a real
          // resource, so posting here can only 404. Surface it as failed
          // instead of retrying forever against an endpoint that will never
          // exist.
          if (isPendingSessionID(item.payload.sessionID)) {
            const attempts = item.attempts + 1
            update(item.id, {
              attempts,
              lastError: "session was still being created when this was queued",
              failed: true,
              nextRetryAt: Number.POSITIVE_INFINITY,
            })
            toast.show({
              title: "Queued message needs attention",
              message: `${item.label}\nIts session no longer exists. Re-send in an open session.`,
              variant: "warning",
            })
            return "queued"
          }
          await sdk.client.session.promptAsync(item.payload, { throwOnError: true })
          markActive(item.payload.sessionID)
          const messageID = item.payload.messageID
          const agent = item.payload.agent
          const model = item.payload.model
          batch(() => {
            // Drop the queue entry FIRST, then restore the echo: remove()
            // deletes the optimistic row for the dropped entry, so adding
            // before removing let the success path delete the very echo it
            // just restored — reopening the pre-SSE visibility gap.
            remove(item.id)
            if (messageID && agent && model) {
              addOptimisticMessage({
                id: `optimistic-${messageID}`,
                messageID,
                sessionID: item.payload.sessionID,
                text: item.label,
                timestamp: item.createdAt,
                agent,
                model: {
                  providerID: model.providerID,
                  modelID: model.modelID,
                  variant: item.payload.variant,
                },
                queued: false,
              })
            }
          })
          logMessageDebug("delivery.sent", {
            sessionID: item.payload.sessionID,
            messageID,
            attempts: item.attempts,
            ms: Date.now() - deliveryStarted,
          })
          if (profileDelivery) {
            console.error("[prompt-delivery]", {
              sessionID: item.payload.sessionID,
              label: item.label.slice(0, 40),
              attempts: item.attempts,
              ms: Date.now() - deliveryStarted,
              outcome: "sent",
            })
          }
          return "sent"
        } catch (error) {
          // Keep the linear timeline row visible — it stays queued (or
          // needs-attention after retries exhaust) until delivery succeeds.
          markOptimisticQueued(item.payload.messageID!, true)
          const attempts = item.attempts + 1
          const retryable = isRetryablePromptError(error)
          const failed = !retryable || attempts >= MAX_ATTEMPTS
          const nextRetryAt = retryable && !failed ? Date.now() + retryDelay(attempts) : Number.POSITIVE_INFINITY
          logMessageDebug("delivery.failed", {
            sessionID: item.payload.sessionID,
            messageID: item.payload.messageID,
            attempts,
            retryable,
            failed,
            error: errorMessage(error),
          })
          update(item.id, {
            attempts,
            lastError: errorMessage(error),
            failed,
            nextRetryAt,
          })
          scheduleNext()
          if (profileDelivery) {
            console.error("[prompt-delivery]", {
              sessionID: item.payload.sessionID,
              label: item.label.slice(0, 40),
              attempts,
              ms: Date.now() - deliveryStarted,
              outcome: failed ? "failed" : "retry-scheduled",
            })
          }
          toast.show({
            title: failed ? "Queued message needs attention" : "Message queued for retry",
            message: failed
              ? `${item.label}\n${errorMessage(error)}`
              : `${item.label}\nRetrying in ${Math.max(1, Math.round((nextRetryAt - Date.now()) / 1000))}s`,
            variant: "warning",
          })
          return "queued"
        }
      })

    const drain = async (): Promise<void> => {
      if (draining) return
      draining = true
      releaseStale()
      try {
        while (true) {
          const now = Date.now()
          const item = store.items.find(
            (entry) =>
              !entry.failed
              && entry.nextRetryAt <= now
              && !deliveries.has(entry.id)
              && !sessionWorking(entry.payload.sessionID),
          )
          if (!item) break
          await sendStored(item)
        }
      } finally {
        draining = false
        scheduleNext()
      }
    }

    const submit = async (payload: QueuedPromptPayload, label: string): Promise<"sent" | "queued"> => {
      const id = crypto.randomUUID()
      const item: QueuedPrompt = {
        id,
        label,
        createdAt: Date.now(),
        attempts: 0,
        nextRetryAt: Date.now(),
        failed: false,
        payload: {
          ...payload,
          messageID: payload.messageID ?? createQueuedMessageID(),
        },
      }

      setStore(
        "items",
        produce((items) => {
          items.push(item)
        }),
      )
      persist()

      // Optimistic echo BEFORE any gating or HTTP (message-delay fix): the
      // transcript must render the sent message on the next Solid flush, not
      // after the promptAsync round-trip. Idempotent — the Home-send path may
      // have already inserted this messageID; the post-204 upsert below only
      // flips queued→false.
      if (item.payload.messageID && item.payload.agent && item.payload.model) {
        addOptimisticMessage({
          id: `optimistic-${item.payload.messageID}`,
          messageID: item.payload.messageID,
          sessionID: item.payload.sessionID,
          text: label,
          timestamp: item.createdAt,
          agent: item.payload.agent,
          model: {
            providerID: item.payload.model.providerID,
            modelID: item.payload.model.modelID,
            variant: item.payload.variant,
          },
          queued: false,
        })
      }
      logMessageDebug("submit.entry", {
        sessionID: item.payload.sessionID,
        messageID: item.payload.messageID,
        chars: label.length,
      })

      // Operator sends are IMMEDIATE unless the turn is provably busy right
      // now — i.e. a working status was observed within the last 1.5 s.
      // Lingering stale "busy" state must never delay a normal interaction:
      // the engine steers or queues mid-turn prompts server-side anyway.
      const SUBMIT_QUEUE_WINDOW_MS = 1_500
      const sinceLastWorking = activeSince.get(payload.sessionID)
      const recentlyWorking =
        sinceLastWorking !== undefined && Date.now() - sinceLastWorking <= SUBMIT_QUEUE_WINDOW_MS
      if (recentlyWorking && sessionWorking(payload.sessionID)) {
        markOptimisticQueued(item.payload.messageID!, true)
        logMessageDebug("submit.gated-busy", {
          sessionID: payload.sessionID,
          messageID: item.payload.messageID,
          sinceWorkingMs: sinceLastWorking !== undefined ? Date.now() - sinceLastWorking : undefined,
        })
        queueMicrotask(() => void drain())
        return "queued"
      }
      releaseStale()
      return sendStored(item)
    }

    const retry = (id: string) => {
      setStore(
        "items",
        produce((items) => {
          const item = items.find((entry) => entry.id === id)
          if (!item) return
          item.attempts = 0
          item.failed = false
          item.nextRetryAt = Date.now()
          item.lastError = undefined
        }),
      )
      persist()
      void drain()
    }

    /**
     * Steer: deliver this queued message NOW, interrupting the running turn.
     * The engine accepts mid-turn prompts (delivery: "steer") and feeds them
     * into the live session, so this bypasses the idle gate only — delivery
     * itself still flows through the same gated path as any other send.
     */
    const steerNow = (id: string): Promise<"sent" | "queued"> => {
      const item = store.items.find((entry) => entry.id === id)
      if (!item || deliveries.has(id)) return Promise.resolve("queued")
      markActive(item.payload.sessionID)
      return sendStored(item)
    }

    /** Look up a queued item by its optimistic/message ID (for row actions). */
    const byMessageID = (messageID: string) =>
      store.items.find((entry) => entry.payload.messageID === messageID)

    const clear = (sessionID?: string) => {
      setStore(
        "items",
        produce((items) => {
          for (let index = items.length - 1; index >= 0; index--) {
            if (sessionID === undefined || items[index].payload.sessionID === sessionID) {
              items.splice(index, 1)
            }
          }
        }),
      )
      persist()
      scheduleNext()
    }

    const unsubscribeDeleted = event.on("session.deleted", (evt) => {
      clear(evt.properties.info.id)
    })

    // Kick pending retries as soon as no session is actively working.
    createEffect(() => {
      const hasPending = store.items.some((item) => !item.failed)
      if (!hasPending) return
      const next = store.items.some(
        (item) => !item.failed && !sessionWorking(item.payload.sessionID),
      )
      if (next) void drain()
    })

    onCleanup(() => {
      if (retryTimer) clearTimeout(retryTimer)
      unsubscribeDeleted()
    })

    return {
      list: () => store.items,
      forSession: (sessionID: string) => store.items.filter((item) => item.payload.sessionID === sessionID),
      state: (id: string): "queued" | "sending" | "needs-attention" => {
        void inFlightCount()
        const item = store.items.find((entry) => entry.id === id)
        if (item?.failed) return "needs-attention"
        if (deliveries.has(id)) return "sending"
        return "queued"
      },
      pendingCount: () => store.items.filter((item) => !item.failed).length,
      retrying: () => inFlightCount() > 0,
      submit,
      retry,
      steerNow,
      byMessageID,
      remove,
      clear,
      drain,
    }
  },
})
