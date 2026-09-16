import { touchActivity } from "./lock"

/**
 * Idle self-destruct control for the daemon process.
 *
 * The daemon is an independent process: the TUI attaches over HTTP/SSE and
 * may exit (Ctrl+C) while a session turn is still running. Liveness rules:
 *
 * - Any HTTP request resets the countdown (server.ts request middleware).
 * - Any published engine event resets the countdown (event-v2-bridge).
 * - At least one SSE client connected → no countdown at all (TUI open).
 * - A session turn is live → the WORK fuse applies: the daemon keeps serving
 *   (and the model keeps running) with no client attached, and only stops if
 *   the turn goes completely silent past the work timeout.
 * - No client, no work → the RECONNECT GRACE: the daemon stays this long after
 *   the last activity so the operator can reopen the TUI and see the finished
 *   work before the process stops.
 *
 * Configured by `arcana.json` → `daemon: { grace_ms, work_timeout_ms }` (any
 * CLI surface that starts the daemon reads it) with env overrides:
 * ARCANA_DAEMON_GRACE_MS / ARCANA_DAEMON_WORK_TIMEOUT_MS, plus the legacy
 * ARCANA_DAEMON_IDLE_TIMEOUT_MS name for the grace. A grace of 0 disables the
 * self-destruct entirely.
 */

const RECONNECT_GRACE_MS = 10 * 60 * 1000
const WORK_TIMEOUT_MS = 60 * 60 * 1000

function envMs(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return undefined
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return undefined
}

/**
 * Env-captured overrides. Config (`arcana.json` daemon.grace_ms /
 * daemon.work_timeout_ms) must never override an explicit operator env:
 *   ARCANA_DAEMON_GRACE_MS        reconnect grace ("0" disables the self-stop)
 *   ARCANA_DAEMON_IDLE_TIMEOUT_MS legacy name for the grace
 *   ARCANA_DAEMON_WORK_TIMEOUT_MS silence fuse while a turn is live
 * Defaults (used when neither env nor config sets a value): 10 min / 60 min.
 */
const graceEnvMs = envMs("ARCANA_DAEMON_GRACE_MS") ?? envMs("ARCANA_DAEMON_IDLE_TIMEOUT_MS")
const workEnvMs = envMs("ARCANA_DAEMON_WORK_TIMEOUT_MS")

let graceMs = graceEnvMs ?? RECONNECT_GRACE_MS
let workTimeoutMs = workEnvMs ?? WORK_TIMEOUT_MS

/**
 * Apply the engine config's daemon lifecycle values at server start. Env wins;
 * config fills only what the operator did not set in the environment.
 */
export function applyDaemonTimeouts(input: { grace_ms?: number; work_timeout_ms?: number } | undefined): void {
  if (!input) return
  if (graceEnvMs === undefined && typeof input.grace_ms === "number" && input.grace_ms >= 0) {
    graceMs = input.grace_ms
  }
  if (workEnvMs === undefined && typeof input.work_timeout_ms === "number" && input.work_timeout_ms >= 0) {
    workTimeoutMs = input.work_timeout_ms
  }
  arm()
}

/** Test-only overrides so fuse behavior is testable without real waits. */
export function __setIdleTimeoutForTest(ms: number): void {
  graceMs = ms
}

export function __setWorkTimeoutForTest(ms: number): void {
  workTimeoutMs = ms
}

type IdleHandle = {
  cwd: string
  stop: () => void
}

type TimerReason = "grace" | "work"

let handle: IdleHandle | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let timerReason: TimerReason | undefined
let deadlineAt: number | undefined
let suspended = false
let sseClients = 0
/** Session turns currently running (busy/retry status), by session id. */
const work = new Set<string>()

function arm(): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  timerReason = undefined
  deadlineAt = undefined
  // Grace 0 disables the self-destruct entirely (legacy operator override).
  if (graceMs === 0) return
  if (suspended || !handle) return
  const workHeld = work.size > 0
  const duration = workHeld ? workTimeoutMs : graceMs
  // A zero work fuse means "never stop while work is live".
  if (duration === 0) return
  timerReason = workHeld ? "work" : "grace"
  deadlineAt = Date.now() + duration
  timer = setTimeout(() => {
    if (!handle) return
    const stop = handle.stop
    handle = undefined
    timer = undefined
    timerReason = undefined
    deadlineAt = undefined
    // Lifecycle.stopDaemon logs the stop (reason + uptime from the lock).
    void stop()
  }, duration)
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

/**
 * A session turn became live. While any turn is held the daemon keeps serving
 * even with no TUI attached, so closing the TUI (Ctrl+C) never abandons work.
 */
export function holdWork(sessionID: string): void {
  if (!sessionID) return
  if (work.has(sessionID)) return
  work.add(sessionID)
  arm()
}

/** A session turn settled. Re-arms with a fresh reconnect grace when idle. */
export function releaseWork(sessionID: string): void {
  if (!work.delete(sessionID)) return
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
    timerReason = undefined
    deadlineAt = undefined
  }
}

/** Last SSE client disconnected: restart the countdown from scratch. */
export function sseDisconnected(): void {
  if (sseClients > 0) sseClients--
  if (sseClients === 0) {
    suspended = false
    arm()
  }
}

export type ActivityStatus = {
  /** Connected SSE clients (TUI/desktop). > 0 means the stop is suspended. */
  clients: number
  /** Live session turns holding the daemon. */
  workHeld: number
  /** Why the countdown is paused: a client is attached, or no reason. */
  suspended: boolean
  /** Which fuse is armed, null when suspended/disabled. */
  reason: TimerReason | "suspended" | null
  /** Epoch ms when the daemon would stop, null when suspended/disabled. */
  deadlineAt: number | null
  /** How long the operator has to reopen the TUI after work settles. */
  reconnectGraceMs: number
  /** Silence fuse while a session turn is live. */
  workTimeoutMs: number
}

/** Read-only liveness projection for /health. Never touches activity. */
export function activityStatus(): ActivityStatus {
  return {
    clients: sseClients,
    workHeld: work.size,
    suspended,
    reason: suspended ? "suspended" : (timerReason ?? null),
    deadlineAt: deadlineAt ?? null,
    reconnectGraceMs: graceMs,
    workTimeoutMs,
  }
}

/** Called when the daemon stops for any reason (idle, signal, crash exit). */
export function clearIdle(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  timerReason = undefined
  deadlineAt = undefined
  handle = undefined
  suspended = false
  sseClients = 0
  work.clear()
}
