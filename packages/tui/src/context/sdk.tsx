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
    // The controller of the CURRENT reconnect attempt (F-A8b). The watchdog
    // trips this — never the outer abort — so a trip falls through to a
    // reconnect with a FRESH controller (command-spine-ui liveness contract:
    // "trip aborts only the current attempt"). A single controller shared
    // across attempts would stay permanently aborted and every reconnect
    // would silently no-op (A10).
    let watchdogTarget: AbortController | undefined
    // Stale startSSE closures must stop: each call bumps the generation, and
    // every loop checks it at the top. Watchdog trips never bump it, so the
    // current loop keeps reconnecting (that is the point).
    let generation = 0

    // Liveness watchdog (AI SDK stream protocol: "keep-alive through ping").
    // Armed on every event; trips after SSE_SILENT_DEATH_MS of silence.
    const sseWatchdog = createSseWatchdog({
      timeoutMs: SSE_SILENT_DEATH_MS,
      onTrip: () => watchdogTarget?.abort(),
    })

    // Process and daemon lifecycle belong to the engine host. The TUI only
    // consumes the transport it was given, so remote URLs are never silently
    // rebound to a local daemon after a connection failure.
    const effectiveFetch = props.fetch ?? fetch

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: effectiveFetch,
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

    const LOCAL_EVENT_QUEUE_CAPACITY = 4096
    let queue: GlobalEvent[] = []
    let droppedLocalEvents = 0
    let timer: Timer | undefined
    let last = 0
    let lastEventID: string | undefined
    const retryDelay = 1000
    // Cap reconnect backoff at 5s — engine runs on localhost; if it's
    // down longer than that, a faster retry won't hurt and the user sees
    // "Reconnecting…" in the status bar. Previously 30s, which matched
    // the exact "Enter does nothing for 30s" complaint on Windows.
    const maxRetryDelay = 5000

    const flush = () => {
      if (queue.length === 0) return
      // Keep the protocol fan-out one-for-one for every retained event. Each
      // canonical delta advances semantic revisions, missing-delta diagnostics,
      // and audit projections; only renderers may coalesce work
      // (SpineProse's frame scheduler).
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
      // The transport queues are bounded, but a slow Solid/OpenTUI frame can
      // still let the local event queue grow between flushes. Keep this
      // buffer bounded as a last line of defence; the transport sequence and
      // heartbeat gap detector will force a REST reconcile if an item is
      // evicted here.
      if (queue.length >= LOCAL_EVENT_QUEUE_CAPACITY) {
        queue.shift()
        droppedLocalEvents += 1
        if (droppedLocalEvents === 1 || droppedLocalEvents % 256 === 0) {
          console.warn(`[arcana] local SSE event queue dropped ${droppedLocalEvents} event(s)`)
        }
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
      watchdogTarget?.abort()
      sseWatchdog.arm()
      ;(async () => {
        let attempt = 0
        while (true) {
          // Only the outer abort (unmount) or a stale loop stops. Watchdog
          // trips abort the attempt (watchdogTarget) and MUST fall through to
          // reconnect — each attempt gets a FRESH controller so a trip never
          // poisons future attempts.
          if (abort.signal.aborted || gen !== generation) break

          const ctrl = new AbortController()
          watchdogTarget = ctrl
          let events: Awaited<ReturnType<typeof sdk.global.event>> | undefined
          let attempted = false
          try {
            events = await sdk.global.event(undefined, {
              signal: ctrl.signal,
              sseMaxRetryAttempts: 0,
              onSseEvent: (frame) => {
                // The generated SSE parser preserves the last event id. Keep
                // it outside this parser instance so the outer reconnect loop
                // can send it on the next request as Last-Event-ID.
                if (frame.id) lastEventID = frame.id
              },
              ...(lastEventID ? { headers: { "Last-Event-ID": lastEventID } } : {}),
            })
            attempted = true
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
          // Attempt over: the next loop iteration owns a fresh controller.
          watchdogTarget = undefined

          // Exponential backoff with additive jitter (playbook line 1221 +
          // P2-2): 1.0-1.5x keeps the ≤1/sec reconnect gate
          // (FREEZE-EXECUTION-PLAN.md:140) while de-synchronizing concurrent
          // subscribers.
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          const jittered = backoff + backoff * Math.random() * 0.5
          await new Promise((resolve) => setTimeout(resolve, jittered))

          // Synthetic reconnect signal — only when a fetch was actually
          // attempted this cycle (a watchdog trip that aborted the fetch
          // must not emit a phantom reconnect; the next real attempt emits
          // it). The stream just dropped (daemon re-registration, transient
          // fetch error, silent death, or a partial event left in the parser
          // buffer at EOF). The server IDs identify the last frame, but this
          // endpoint has no replay buffer, so listeners still re-sync the
          // active session from REST to close any gap.
          if (attempted && !abort.signal.aborted && gen === generation) {
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
        if (isAbortError(error) || abort.signal.aborted || watchdogTarget?.signal.aborted === true) return
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
        watchdogTarget?.abort()
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
      fetch: effectiveFetch,
      url: props.url,
    }
  },
})
