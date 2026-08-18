import { createEffect, createSignal, onCleanup } from "solid-js"
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

export function isSessionWorking(status: unknown): boolean {
  return isRecord(status) && (status.type === "busy" || status.type === "retry")
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
    const [inFlightID, setInFlightID] = createSignal<string | undefined>()
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
          if (index !== -1) items.splice(index, 1)
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

    const sendStored = async (item: QueuedPrompt): Promise<void> => {
      setInFlightID(item.id)
      try {
        if (item.payload.messageID) {
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
            return
          }
        }
        await sdk.client.session.promptAsync(item.payload, { throwOnError: true })
        markActive(item.payload.sessionID)
        remove(item.id)
      } catch (error) {
        const attempts = item.attempts + 1
        const retryable = isRetryablePromptError(error)
        const failed = !retryable || attempts >= MAX_ATTEMPTS
        const nextRetryAt = retryable && !failed ? Date.now() + retryDelay(attempts) : Number.POSITIVE_INFINITY
        update(item.id, {
          attempts,
          lastError: errorMessage(error),
          failed,
          nextRetryAt,
        })
        toast.show({
          title: failed ? "Queued message needs attention" : "Message queued for retry",
          message: failed
            ? `${item.label}\n${errorMessage(error)}`
            : `${item.label}\nRetrying in ${Math.max(1, Math.round((nextRetryAt - Date.now()) / 1000))}s`,
          variant: "warning",
        })
      } finally {
        setInFlightID(undefined)
      }
    }

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
              && entry.id !== inFlightID()
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
          messageID: payload.messageID ?? `msg_${id.replaceAll("-", "")}`,
        },
      }

      setStore(
        "items",
        produce((items) => {
          items.push(item)
        }),
      )
      persist()

      // A live query owns the session. Queue the new message and let the
      // status observer drain it as soon as the turn returns to idle.
      if (releaseStale()) {
        // A stale session was just released (its turn is no longer ours to
        // wait on). Defer to drain instead of racing it with a direct send.
        queueMicrotask(() => void drain())
        return "queued"
      }
      if (sessionWorking(payload.sessionID)) {
        queueMicrotask(() => void drain())
        return "queued"
      }

      setInFlightID(item.id)
      try {
        await sdk.client.session.promptAsync(item.payload, { throwOnError: true })
        markActive(payload.sessionID)
        remove(item.id)
        return "sent"
      } catch (error) {
        const retryable = isRetryablePromptError(error)
        const failed = !retryable
        const nextRetryAt = retryable ? Date.now() + retryDelay(1) : Number.POSITIVE_INFINITY
        update(item.id, {
          attempts: 1,
          lastError: errorMessage(error),
          failed,
          nextRetryAt,
        })
        toast.show({
          title: failed ? "Message saved in queue" : "Failed to send prompt — queued",
          message: failed ? `${label}\n${errorMessage(error)}` : `${label}\nWill retry automatically`,
          variant: "warning",
        })
        void drain()
        return "queued"
      } finally {
        setInFlightID(undefined)
      }
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
      pendingCount: () => store.items.filter((item) => !item.failed).length,
      retrying: () => inFlightID() !== undefined,
      submit,
      retry,
      remove,
      clear,
      drain,
    }
  },
})
