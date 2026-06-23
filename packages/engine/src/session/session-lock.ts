/**
 * Concurrent session lock (failure mode #13).
 *
 * Prevents multiple arcana sessions from running in the same project
 * directory simultaneously. Uses a PID-based lock file:
 *
 * - On session start: write `.arcana/.session-lock` with PID + timestamp
 * - On session end: delete the lock file
 * - On start, check for existing lock:
 *   - Stale PID (process dead) → clean up and proceed
 *   - Lock > 24h old → treat as stale, clean up and proceed
 *   - Active PID → warn, let user decide
 */

import fs from "fs"
import path from "path"
import { Effect } from "effect"

// ---------------------------------------------------------------------------
// Lock file format
// ---------------------------------------------------------------------------

export interface SessionLockData {
  pid: number
  timestamp: number
  /**
   * Parent PID at lock-acquire time. Used to detect PID reuse on the
   * recorded PID: if the parent is gone, the original process tree is dead
   * and the PID was almost certainly recycled to a different process.
   */
  ppid?: number
  sessionId?: string
}

/**
 * Maximum lock age before it is treated as stale (24 hours in ms).
 */
export const STALE_LOCK_MS = 24 * 60 * 60 * 1000

/**
 * If the lock's PID appears alive but the lock is older than this AND no
 * parent process is recorded, treat it as a recycled PID. PID reuse on
 * Windows/Linux can fool `process.kill(pid, 0)` — a freshly-spawned process
 * may inherit the recycled PID. This is the empirical window observed on
 * developer machines where the warning spuriously fires.
 */
const PID_RECYCLE_GRACE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Cross-platform PID-alive check.
 *
 * `process.kill(pid, 0)` is portable but unreliable on Windows PID reuse
 * (a freshly-launched process can be assigned a PID that was just freed).
 * To reduce false positives we additionally require that:
 *   1. The PID matches its own (we never own another's PID), AND
 *   2. The lock is younger than PID_RECYCLE_GRACE_MS, OR
 *      the lock includes a `ppid` that still matches an alive parent.
 *
 * Falls back to the portable signal-0 probe when `ppid` is missing.
 */
function isProcessAlive(pid: number, lockPpid?: number): boolean {
  try {
    process.kill(pid, 0)
  } catch (e: any) {
    // Only ESRCH ("no such process") means dead; EPERM means alive but
    // unowned by us.
    return e?.code === "EPERM"
  }

  // PID is alive according to signal-0. Guard against PID reuse:
  if (typeof lockPpid === "number") {
    if (lockPpid === 1) {
      // Orphan — parent already reaped. PID may have been recycled.
      return false
    }
    try {
      process.kill(lockPpid, 0)
      // Parent still alive — most likely the same session.
      return true
    } catch {
      // Parent is gone. PID very likely recycled.
      return false
    }
  }

  // No ppid recorded in the lock file. Trust signal-0 but lean conservative.
  return true
}

// ---------------------------------------------------------------------------
// Process exit cleanup
// ---------------------------------------------------------------------------

const acquiredLocks = new Set<string>()
let exitHandlerRegistered = false

function cleanupOwnedLocks(): void {
  for (const lockPath of acquiredLocks) {
    try {
      if (fs.existsSync(lockPath)) {
        // Only clean up if we still own it
        const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
        if (raw.pid === process.pid) fs.unlinkSync(lockPath)
      }
    } catch {
      // Best-effort
    }
  }
}

function registerExitHandlerOnce(): void {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true
  process.on("exit", cleanupOwnedLocks)
  // 'exit' does NOT fire on Ctrl-C / kill, so without this the lock would leak
  // until it goes stale (24h). Release it on the common termination signals too.
  const onSignal = (sig: NodeJS.Signals) => {
    cleanupOwnedLocks()
    // A registered signal listener suppresses Node's default termination, so we
    // must hand control back: remove ourselves, then re-raise only if no other
    // listener remains to drive shutdown (avoids fighting a graceful-shutdown
    // handler the app may have installed elsewhere).
    process.removeListener(sig, onSignal)
    if (process.listenerCount(sig) === 0) {
      try { process.kill(process.pid, sig) } catch { /* already gone */ }
    }
  }
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
}

function trackLock(lockPath: string): void {
  acquiredLocks.add(lockPath)
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function lockFilePath(projectRoot: string): string {
  return path.join(projectRoot, ".arcana", ".session-lock")
}

function ensureLockDir(projectRoot: string): void {
  const dir = path.join(projectRoot, ".arcana")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readLock(projectRoot: string): SessionLockData | null {
  const lockPath = lockFilePath(projectRoot)
  try {
    const raw = fs.readFileSync(lockPath, "utf-8")
    const data = JSON.parse(raw) as SessionLockData
    if (
      typeof data.pid !== "number" ||
      typeof data.timestamp !== "number"
    ) {
      return null
    }
    return data
  } catch {
    return null
  }
}

function writeLock(projectRoot: string, data: SessionLockData): void {
  ensureLockDir(projectRoot)
  fs.writeFileSync(lockFilePath(projectRoot), JSON.stringify(data, null, 2), "utf-8")
}

function deleteLock(projectRoot: string): void {
  const lockPath = lockFilePath(projectRoot)
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
  } catch {
    // Best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Lock status
// ---------------------------------------------------------------------------

export type LockStatus =
  | { type: "free" }
  | { type: "stale_dead"; pid: number; timestamp: number }
  | { type: "stale_old"; pid: number; timestamp: number; ageHours: number }
  | { type: "active"; pid: number; timestamp: number }

/**
 * Check the current state of the session lock in the given project.
 */
export function checkLock(projectRoot: string): LockStatus {
  const existing = readLock(projectRoot)
  if (!existing) return { type: "free" }

  const now = Date.now()
  const age = now - existing.timestamp

  // Stale: lock is older than 24h
  if (age > STALE_LOCK_MS) {
    return {
      type: "stale_old",
      pid: existing.pid,
      timestamp: existing.timestamp,
      ageHours: Math.round(age / (60 * 60 * 1000)),
    }
  }

  // PID is dead OR its parent is gone → stale (covers PID reuse)
  if (!isProcessAlive(existing.pid, existing.ppid)) {
    return {
      type: "stale_dead",
      pid: existing.pid,
      timestamp: existing.timestamp,
    }
  }

  // PID alive but the lock is older than the PID-recycle grace window and
  // the lock has no recorded ppid — treat as stale. This catches the case
  // where the original process is dead AND its PID was recycled to a
  // different process that happens to be alive (e.g. an unrelated arcana
  // invocation started after the lock was written).
  if (existing.ppid === undefined && age > PID_RECYCLE_GRACE_MS) {
    return {
      type: "stale_dead",
      pid: existing.pid,
      timestamp: existing.timestamp,
    }
  }

  // Active lock — another session is running
  return {
    type: "active",
    pid: existing.pid,
    timestamp: existing.timestamp,
  }
}

/**
 * True if the given lock is held by the current process. Used to avoid
 * warning about a "concurrent session" when a single arcana invocation
 * creates multiple sessions in the same project (e.g. /new, /fork, subagents).
 */
export function isOwnLock(lock: SessionLockData): boolean {
  return lock.pid === process.pid
}

// ---------------------------------------------------------------------------
// Acquire / release (Effect wrappers)
// ---------------------------------------------------------------------------

/**
 * Acquire the session lock for a project directory.
 *
 * Returns:
 * - `"acquired"` — lock was successfully acquired
 * - `"stale_cleaned"` — stale lock was found and cleaned, new lock acquired
 * - `"warn_active"` — lock is held by an active process; lock is NOT acquired,
 *   the caller should warn the user but may still proceed
 */
export type AcquireResult = "acquired" | "stale_cleaned" | "warn_active"

/**
 * Try to acquire the session lock. Cleans up stale locks automatically.
 * If an active lock exists, logs a warning but returns `"warn_active"`.
 */
export function acquireLock(
  projectRoot: string,
  sessionId?: string,
): AcquireResult {
  registerExitHandlerOnce()
  const lockPath = lockFilePath(projectRoot)
  const status = checkLock(projectRoot)

  switch (status.type) {
    case "free": {
      writeLock(projectRoot, {
        pid: process.pid,
        ppid: process.ppid,
        timestamp: Date.now(),
        sessionId,
      })
      trackLock(lockPath)
      return "acquired"
    }

    case "stale_dead": {
      console.warn(
        `[arcana] Stale session lock found (PID ${status.pid} is dead). Cleaning up.`,
      )
      deleteLock(projectRoot)
      writeLock(projectRoot, {
        pid: process.pid,
        ppid: process.ppid,
        timestamp: Date.now(),
        sessionId,
      })
      trackLock(lockPath)
      return "stale_cleaned"
    }

    case "stale_old": {
      console.warn(
        `[arcana] Stale session lock found (${status.ageHours}h old, PID ${status.pid}). Cleaning up.`,
      )
      deleteLock(projectRoot)
      writeLock(projectRoot, {
        pid: process.pid,
        ppid: process.ppid,
        timestamp: Date.now(),
        sessionId,
      })
      trackLock(lockPath)
      return "stale_cleaned"
    }

    case "active": {
      // The lock is held by an active process. If that process is US, the
      // caller is just creating another session in the same arcana
      // invocation — refresh the lock (so the timestamp stays current for
      // the PID-recycle grace check) and return success silently.
      if (isOwnLock({
        pid: status.pid,
        timestamp: status.timestamp,
      })) {
        writeLock(projectRoot, {
          pid: process.pid,
          ppid: process.ppid,
          timestamp: Date.now(),
          sessionId,
        })
        trackLock(lockPath)
        return "acquired"
      }
      console.warn(
        `[arcana] Another arcana session is active (PID ${status.pid}). Concurrent sessions may conflict.`,
      )
      // Still write our lock — caller decides whether to proceed
      writeLock(projectRoot, {
        pid: process.pid,
        ppid: process.ppid,
        timestamp: Date.now(),
        sessionId,
      })
      trackLock(lockPath)
      return "warn_active"
    }

    default:
      return "acquired"
  }
}

/**
 * Release the session lock for a project directory.
 * Only removes the lock if it was written by this process.
 */
export function releaseLock(projectRoot: string): void {
  const existing = readLock(projectRoot)
  if (!existing) return

  // Only delete if we own the lock (same PID)
  if (existing.pid === process.pid) {
    deleteLock(projectRoot)
    acquiredLocks.delete(lockFilePath(projectRoot))
  }
}

/**
 * Effect wrapper: acquire session lock on session creation.
 */
export const withSessionLock = (
  projectRoot: string,
  sessionId?: string,
): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    acquireLock(projectRoot, sessionId)
  })

/**
 * Effect wrapper: release session lock on session cleanup.
 */
export const releaseSessionLock = (
  projectRoot: string,
): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    releaseLock(projectRoot)
  })
