import { touchActivity } from "./lock"

/**
 * Idle self-destruct control for the daemon process.
 *
 * The daemon shuts itself down after IDLE_TIMEOUT_MS without activity so a
 * forgotten process does not linger. The bug this module fixes: the timer was
 * armed once at boot and never reset by anything, so every daemon died exactly
 * 5 minutes after start even while the TUI was connected and streaming.
 *
 * Liveness rules (all verified call sites):
 * - Any HTTP request resets the timer (server.ts request middleware).
 * - Each SSE heartbeat resets the timer (event.ts heartbeat tick, 10s).
 * - While at least one SSE client is connected the timer is suspended
 *   entirely; it re-arms when the last client disconnects.
 *
 * Result: TUI open = daemon alive. TUI closed + no traffic 5 min = clean stop.
 */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000

/** Test-only override so idle-stop behavior is testable without a 5-minute wait. */
export function __setIdleTimeoutForTest(ms: number): void {
  idleTimeoutMs = ms
}

let idleTimeoutMs = IDLE_TIMEOUT_MS

type IdleHandle = {
  cwd: string
  stop: () => void
}

let handle: IdleHandle | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let suspended = false
let sseClients = 0

function arm(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (suspended || !handle) return
  timer = setTimeout(() => {
    if (!handle) return
    const stop = handle.stop
    handle = undefined
    timer = undefined
    // Lifecycle.stopDaemon logs the stop (reason + uptime from the lock).
    void stop()
  }, idleTimeoutMs)
}

/** Arm the idle self-destruct for a running daemon. */
export function armIdle(cwd: string, stop: () => void): void {
  handle = { cwd, stop }
  arm()
}

/**
 * Any real activity keeps the daemon alive. `cwd` is optional so the server
 * layer (which does not track the daemon workspace) can reset without it.
 */
export function resetActivity(cwd?: string): void {
  if (!handle) return
  if (cwd !== undefined && cwd !== handle.cwd) return
  touchActivity(handle.cwd)
  arm()
}

/** First SSE client connected: the daemon must not idle-stop while in use. */
export function sseConnected(): void {
  sseClients++
  if (sseClients === 1) {
    suspended = true
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }
}

/** Last SSE client disconnected: restart the idle countdown from scratch. */
export function sseDisconnected(): void {
  if (sseClients > 0) sseClients--
  if (sseClients === 0) {
    suspended = false
    arm()
  }
}

/** Called when the daemon stops for any reason (idle, signal, crash exit). */
export function clearIdle(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  handle = undefined
  suspended = false
  sseClients = 0
}
