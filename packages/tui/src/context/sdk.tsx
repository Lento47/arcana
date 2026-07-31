import { createOpencodeClient } from "@arcana/sdk/v2"
import type { GlobalEvent } from "@arcana/sdk/v2"
import { Flag } from "@arcana/core/flag/flag"
import { createSimpleContext } from "./helper"
import { batch, onCleanup, onMount } from "solid-js"

export type EventSource = {
  subscribe: (handler: (event: GlobalEvent) => void) => Promise<() => void>
}

/** Last SSE/global event type (for ARCANA_DEBUG_STALL_MS watchdog correlation). */
let lastSseEventType: string | undefined
let lastSseEventAt = 0

export function getLastSseEventMeta(): { type: string | undefined; at: number } {
  return { type: lastSseEventType, at: lastSseEventAt }
}

function noteSseEvent(event: GlobalEvent) {
  const t = event?.payload?.type
  lastSseEventType = typeof t === "string" ? t : "unknown"
  lastSseEventAt = Date.now()
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let sse: AbortController | undefined

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: props.fetch,
        headers: props.headers,
      })
    }

    let sdk = createSDK()

    const handlers = new Set<(event: GlobalEvent) => void>()
    const emitter = {
      emit(_type: "event", event: GlobalEvent) {
        for (const handler of handlers) handler(event)
      },
      on(_type: "event", handler: (event: GlobalEvent) => void) {
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      },
    }

    let queue: GlobalEvent[] = []
    let timer: Timer | undefined
    let last = 0
    const retryDelay = 1000
    // Cap reconnect backoff at 5s — engine runs on localhost; if it's
    // down longer than that, a faster retry won't hurt and the user sees
    // "Reconnecting…" in the status bar. Previously 30s, which matched
    // the exact "Enter does nothing for 30s" complaint on Windows.
    const maxRetryDelay = 5000

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit("event", event)
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      noteSseEvent(event)
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    function isAbortError(error: unknown): boolean {
      if (error == null) return false
      if (typeof error === "string") {
        const s = error.toLowerCase()
        return s === "abort" || s === "aborted" || s.includes("abort")
      }
      if (typeof error === "object") {
        const e = error as { name?: string; message?: string; code?: string }
        if (e.name === "AbortError" || e.code === "ABORT_ERR") return true
        const msg = typeof e.message === "string" ? e.message.toLowerCase() : ""
        if (msg === "abort" || msg === "aborted" || msg.includes("this operation was aborted")) return true
      }
      return false
    }

    function startSSE() {
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      ;(async () => {
        let attempt = 0
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          let events: Awaited<ReturnType<typeof sdk.global.event>>
          try {
            events = await sdk.global.event({
              signal: ctrl.signal,
              sseMaxRetryAttempts: 0,
            })
          } catch (error) {
            // Expected when startSSE restarts or provider unmounts.
            if (isAbortError(error) || abort.signal.aborted || ctrl.signal.aborted) break
            throw error
          }

          if (Flag.ARCANA_EXPERIMENTAL_WORKSPACES) {
            // Start syncing workspaces, it's important to do this after
            // we've started listening to events
            await sdk.sync.start().catch(() => {})
          }

          try {
            for await (const event of events.stream) {
              if (ctrl.signal.aborted) break
              handleEvent(event)
            }
          } catch (error) {
            if (isAbortError(error) || abort.signal.aborted || ctrl.signal.aborted) break
            // Stream ended with a transient error — fall through to reconnect.
          }

          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // Exponential backoff
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      })().catch((error) => {
        // Never surface AbortError as unhandled — process unhandledRejection kills the TUI.
        if (isAbortError(error) || abort.signal.aborted || ctrl.signal.aborted) return
        console.error("[arcana] SSE event loop failed:", error)
      })
    }

    onMount(async () => {
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)

        if (Flag.ARCANA_EXPERIMENTAL_WORKSPACES) {
          // Start syncing workspaces, it's important to do this after
          // we've started listening to events
          await sdk.sync.start().catch(() => {})
        }
      } else {
        startSSE()
      }
    })

    onCleanup(() => {
      // Abort in-flight SSE/fetch. Callers must treat AbortError as non-fatal
      // (see engine unhandledRejection filter + startSSE catch).
      try {
        abort.abort()
      } catch {
        /* ignore */
      }
      try {
        sse?.abort()
      } catch {
        /* ignore */
      }
      if (timer) clearTimeout(timer)
      handlers.clear()
    })

    return {
      get client() {
        return sdk
      },
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      url: props.url,
    }
  },
})
