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
  sessionId?: string
}

/**
 * Maximum lock age before it is treated as stale (24 hours in ms).
 */
export const STALE_LOCK_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Process exit cleanup
// ---------------------------------------------------------------------------

const acquiredLocks = new Set<string>()
let exitHandlerRegistered = false

function registerExitHandlerOnce(): void {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true
  process.on("exit", () => {
    for (const lockPath of acquiredLocks) {
      try {
        if (fs.existsSync(lockPath)) {
          // Only clean up if we still own it
          const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
          if (raw.pid === process.pid) fs.unlinkSync(lockPath)
        }
      } catch {
        // Best-effort on process exit
      }
    }
  })
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

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 is a null signal on POSIX — checks if process exists
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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

  // PID is dead → stale
  if (!isProcessAlive(existing.pid)) {
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
        timestamp: Date.now(),
        sessionId,
      })
      trackLock(lockPath)
      return "stale_cleaned"
    }

    case "active": {
      console.warn(
        `[arcana] Another arcana session is active (PID ${status.pid}). Concurrent sessions may conflict.`,
      )
      // Still write our lock — caller decides whether to proceed
      writeLock(projectRoot, {
        pid: process.pid,
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
