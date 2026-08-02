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

// ─── Daemon respawn on connection failure ─────────────────────────────
// The engine daemon self-destructs after idle (5 min, activity.ts) or can
// crash. The TUI must bring it back on the next request instead of failing
// with "Unable to connect". The engine host publishes the exact spawn
// command via ARCANA_DAEMON_CMD (cli/cmd/tui.ts); this wrapper respawns once
// (debounced) and retries the request.

const DAEMON_RESPAWN_DEBOUNCE_MS = 3_000
const DAEMON_RESPAWN_ATTEMPTS = 35 // 200ms × 35 = 7s — engine daemon boot can take ~5s

function isDaemonConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "AbortError" || error.name === "TimeoutError") return false
  const message = error.message.toLowerCase()
  return (
    message.includes("fetch failed")
    || message.includes("failed to fetch")
    || message.includes("unable to connect")
    || message.includes("econnrefused")
    || message.includes("network")
    || message.includes("connect")
  )
}

function daemonSpawnCommand(): string[] | undefined {
  const raw = typeof process !== "undefined" ? process.env.ARCANA_DAEMON_CMD : undefined
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.every((part) => typeof part === "string")
      ? (parsed as string[])
      : undefined
  } catch {
    return undefined
  }
}

async function daemonHealthOk(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1_500)
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let lastDaemonRespawnAt = 0

async function respawnDaemon(url: string, directory: string | undefined): Promise<boolean> {
  const bun = (globalThis as { Bun?: { spawn?: (...args: unknown[]) => unknown } }).Bun
  const cmd = daemonSpawnCommand()
  if (!bun?.spawn || !cmd?.length) return false
  const now = Date.now()
  if (now - lastDaemonRespawnAt < DAEMON_RESPAWN_DEBOUNCE_MS) return false
  lastDaemonRespawnAt = now
  const cwd = directory ?? (typeof process !== "undefined" ? process.cwd() : undefined)
  try {
    const proc = bun.spawn({
      cmd,
      stdio: ["ignore", "ignore", "ignore"],
      cwd,
      env: {
        ...(typeof process !== "undefined" ? (process.env as Record<string, string>) : {}),
        ARCANA_DAEMON: "1",
        ...(cwd ? { ARCANA_DAEMON_CWD: cwd } : {}),
      },
    }) as { unref?: () => void }
    proc?.unref?.()
    for (let attempt = 0; attempt < DAEMON_RESPAWN_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      if (await daemonHealthOk(url)) return true
    }
  } catch {
    // fall through — caller retries the original error
  }
  return false
}

export function wrapDaemonFetch(baseUrl: string, directory: string | undefined, baseFetch: typeof fetch) {
  const wrapped = async (input: URL | RequestInfo, init?: RequestInit) => {
    try {
      return await baseFetch(input, init)
    } catch (error) {
      if (!isDaemonConnectionError(error)) throw error
      const respawned = await respawnDaemon(baseUrl, directory)
      if (!respawned) throw error
      return baseFetch(input, init)
    }
  }
  return wrapped as unknown as typeof fetch
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

    const effectiveFetch = props.fetch ?? wrapDaemonFetch(props.url, props.directory, fetch)

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
            events = await sdk.global.event({
              signal: ctrl.signal,
              sseMaxRetryAttempts: 0,
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
          // fetch error, silent death, or partial event left in the parser
          // buffer at EOF). SSE events carry no id, so Last-Event-ID replay
          // is impossible — listeners (session route) re-sync the active
          // session from REST to close the gap.
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
