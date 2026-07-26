import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"

export interface DaemonLock {
  workspace: string
  pid: number
  port: number
  startedAt: number
  lastActivityAt: number
  version: string
}

const DAEMON_DIR = join(homedir(), ".arcana", "daemon")

export function workspaceHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
}

export function lockPath(wsHash: string): string {
  return join(DAEMON_DIR, `${wsHash}.json`)
}

function ensureDir() {
  if (!existsSync(DAEMON_DIR)) mkdirSync(DAEMON_DIR, { recursive: true })
}

export function readLock(cwd: string): DaemonLock | null {
  try {
    const file = lockPath(workspaceHash(cwd))
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf8")
    return JSON.parse(raw) as DaemonLock
  } catch {
    return null
  }
}

/** Atomic lock acquisition — uses O_CREAT|O_EXCL so only one process wins. */
export function acquireLock(cwd: string, port: number, version: string): DaemonLock | null {
  ensureDir()
  const file = lockPath(workspaceHash(cwd))
  const lock: DaemonLock = {
    workspace: cwd,
    pid: process.pid,
    port,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    version,
  }
  try {
    // wx = write + exclusive create. Throws EEXIST if file already exists.
    writeFileSync(file, JSON.stringify(lock, null, 2), { flag: "wx" })
    return lock
  } catch (err: any) {
    if (err?.code === "EEXIST") return null // another process won the race
    throw err
  }
}

export function updateLock(cwd: string, patch: Partial<DaemonLock>): void {
  const existing = readLock(cwd)
  if (!existing) return
  writeFileSync(lockPath(workspaceHash(cwd)), JSON.stringify({ ...existing, ...patch }, null, 2))
}

export function removeLock(cwd: string): void {
  try { unlinkSync(lockPath(workspaceHash(cwd))) } catch {}
}

export function touchActivity(cwd: string): void {
  updateLock(cwd, { lastActivityAt: Date.now() })
}

export function isLockStale(lock: DaemonLock): boolean {
  try {
    process.kill(lock.pid, 0) // Signal 0 = existence check
    return false
  } catch {
    return true
  }
}

/** Scan all lock files across workspaces. Use for status/stop commands run from any directory. */
export function listAllLocks(): DaemonLock[] {
  try {
    if (!existsSync(DAEMON_DIR)) return []
    return readdirSync(DAEMON_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = readFileSync(join(DAEMON_DIR, f), "utf8")
          return JSON.parse(raw) as DaemonLock
        } catch {
          return null
        }
      })
      .filter((l): l is DaemonLock => l !== null)
  } catch {
    return []
  }
}
