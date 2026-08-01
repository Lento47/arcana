import { createOpencodeClient } from "@arcana/sdk/v2"
import type { GlobalEvent } from "@arcana/sdk/v2"
import { Flag } from "@arcana/core/flag/flag"
import { createSimpleContext } from "./helper"
import { batch, onCleanup, onMount } from "solid-js"
import { createSseWatchdog } from "../util/sse-watchdog"
import { createIsolatedEmitter } from "../util/isolated-emitter"
import { streamState, transportOf, type TransportEnvelope } from "./stream-state"

/**
 * Engine heartbeat cadence: handlers/event.ts streams server.heartbeat every
 * 10 seconds while the SSE stream is open (Stream.tick("10 seconds")).
 * Total silence beyond 3x that interval means the daemon died without
 * closing the socket (half-open TCP delivers no FIN/RST), so the client
 * `for await` never ends on its own. The watchdog aborts the dead attempt;
 * the loop then reconnects and emits sse.reconnected for the REST resync.
 */
export const SSE_HEARTBEAT_INTERVAL_MS = 10_000
export const SSE_SILENT_DEATH_MS = SSE_HEARTBEAT_INTERVAL_MS * 3

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
    // Stale startSSE closures must stop: each call bumps the generation, and
    // every loop checks it at the top. Watchdog trips never bump it, so the
    // current loop keeps reconnecting (that is the point).
    let generation = 0

    // Liveness watchdog (AI SDK stream protocol: "keep-alive through ping").
    // Armed on every event; trips after SSE_SILENT_DEATH_MS of silence.
    const sseWatchdog = createSseWatchdog({
      timeoutMs: SSE_SILENT_DEATH_MS,
      onTrip: () => sse?.abort(),
    })

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
    // Isolated emitter (P12.2): one throwing subscriber must not prevent
    // later subscribers from seeing the same event or abort the batch. The
    // central sync subscriber is registered first, but any subscriber
    // (dialogs, renderers) can throw; without isolation the flush loop
    // aborts, remaining events are lost, and the SSE loop reconnects.
    const emitter = createIsolatedEmitter<GlobalEvent>()

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
          try {
            emitter.emit(event)
          } catch (error) {
            // Belt-and-suspenders: the emitter isolates subscribers, but an
            // emitter-level failure must not drop the remaining batched events.
            console.error("[arcana] event batch failure:", event?.payload?.type, error)
          }
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      noteSseEvent(event)
      // Transport sequence tracking (P12). A new streamID means the daemon
      // restarted or the connection re-established: previous sequence
      // expectations are void, counters reset, and the reconnect resync
      // (sse.reconnected) re-hydrates the projection.
      const tr = transportOf(event as { transport?: { streamID: string; sequence: number; headSequence?: number } })
      if (tr?.streamID && tr.streamID !== streamState.streamID) {
        streamState.streamID = tr.streamID
        streamState.lastReceived = 0
        streamState.lastApplied = 0
      }
      if (tr && tr.headSequence === undefined) {
        if (tr.sequence > streamState.lastReceived) streamState.lastReceived = tr.sequence
      }
      queue.push(event)
      // Any event proves the connection is alive — push the silence window
      // out. server.heartbeat arrives every 10s even when nothing else flows.
      sseWatchdog.arm()
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
      // Stop any stale loop: generation bump makes old closures break at
      // their next top-of-loop check (after one in-flight abort cycle).
      generation += 1
      const gen = generation
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      sseWatchdog.arm()
      ;(async () => {
        let attempt = 0
        while (true) {
          // Only the outer abort (unmount) or a stale loop stops. Watchdog
          // trips abort the attempt (ctrl) and MUST fall through to reconnect.
          if (abort.signal.aborted || gen !== generation) break

          let events: Awaited<ReturnType<typeof sdk.global.event>> | undefined
          try {
            events = await sdk.global.event({
              signal: ctrl.signal,
              sseMaxRetryAttempts: 0,
            })
          } catch (error) {
            if (abort.signal.aborted || gen !== generation) break
            // AbortError here means the watchdog tripped (silent death) or a
            // stale restart aborted this attempt — reconnect below. Other
            // errors are unexpected; surface them to the outer handler.
            if (!isAbortError(error)) throw error
          }

          if (Flag.ARCANA_EXPERIMENTAL_WORKSPACES) {
            // Start syncing workspaces, it's important to do this after
            // we've started listening to events
            await sdk.sync.start().catch(() => {})
          }

          if (events) {
            try {
              for await (const event of events.stream) {
                if (ctrl.signal.aborted) break
                handleEvent(event)
              }
            } catch (error) {
              if (abort.signal.aborted || gen !== generation) break
              // AbortError (watchdog trip) or transient stream error — fall
              // through to reconnect.
            }
          }

          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (abort.signal.aborted || gen !== generation) break

          // Exponential backoff
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))

          // Synthetic reconnect signal. The stream just dropped (daemon
          // re-registration, transient fetch error, silent death, or partial
          // event left in the parser buffer at EOF). SSE events carry no id,
          // so Last-Event-ID replay is impossible — listeners (session route)
          // re-sync the active session from REST to close the gap.
          if (!abort.signal.aborted && gen === generation) {
            emitter.emit({
              directory: props.directory ?? "",
              payload: {
                id: `sse.reconnected.${attempt}`,
                type: "sse.reconnected",
                properties: {},
              },
            } as unknown as GlobalEvent)
          }
        }
        sseWatchdog.stop()
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
      sseWatchdog.stop()
      if (timer) clearTimeout(timer)
      emitter.clear()
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
