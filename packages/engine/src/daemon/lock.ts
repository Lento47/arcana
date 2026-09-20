import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"
import { atomicWriteSync } from "../util/atomic-write"

export interface DaemonLock {
  workspace: string
  pid: number
  port: number
  startedAt: number
  lastActivityAt: number
  version: string
}

const DAEMON_DIR_ENV = "ARCANA_HOME"

/**
 * Resolve the daemon directory per call so `ARCANA_HOME` (the repo-wide
 * override used by license/proof/proxy paths) can redirect it — including in
 * tests, which must never touch a real `~/.arcana/daemon`.
 */
function daemonDir(): string {
  return join(process.env[DAEMON_DIR_ENV] ?? join(homedir(), ".arcana"), "daemon")
}

export function workspaceHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
}

export function lockPath(wsHash: string): string {
  return join(daemonDir(), `${wsHash}.json`)
}

function ensureDir() {
  const dir = daemonDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function readLock(cwd: string): DaemonLock | null {
  try {
    const file = lockPath(workspaceHash(cwd))
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf8")
    const parsed = JSON.parse(raw) as Partial<DaemonLock> | null
    // A parseable file is not automatically a usable lock: an interrupted
    // NTFS write can leave JSON-ish or zero-filled content. Validate the
    // fields every consumer depends on, so a corrupt lock reads as "no lock"
    // and the next acquisition can reclaim it.
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid) || parsed.pid <= 0) return null
    if (typeof parsed.port !== "number" || !Number.isInteger(parsed.port) || parsed.port <= 0) return null
    return parsed as DaemonLock
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
  const claim = () => {
    // wx = write + exclusive create. Throws EEXIST if file already exists.
    writeFileSync(file, JSON.stringify(lock, null, 2), { flag: "wx" })
    return lock
  }
  try {
    return claim()
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err
  }

  // EEXIST: someone owns the path. Return null only for a *live* owner; a
  // corrupt (unparseable/NUL-filled) or dead lock is reclaimed so one bad
  // file can never deadlock daemon boot forever.
  const existing = readLock(cwd)
  if (existing && !isLockStale(existing)) return null

  try {
    unlinkSync(file)
  } catch {
    // Already gone (or unlink failed): the claim below decides.
  }
  try {
    return claim()
  } catch (err: any) {
    if (err?.code === "EEXIST") return null // lost the re-claim race
    throw err
  }
}

export function updateLock(cwd: string, patch: Partial<DaemonLock>): void {
  const existing = readLock(cwd)
  if (!existing) return
  atomicWriteSync(lockPath(workspaceHash(cwd)), JSON.stringify({ ...existing, ...patch }, null, 2))
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
    const dir = daemonDir()
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = readFileSync(join(dir, f), "utf8")
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
