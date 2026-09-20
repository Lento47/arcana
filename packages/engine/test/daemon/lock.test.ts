import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquireLock, isLockStale, lockPath, readLock, removeLock, workspaceHash } from "../../src/daemon/lock"

/**
 * The lock must never deadlock daemon boot.
 *
 * A zero-filled `~/.arcana/daemon/<hash>.json` (interrupted NTFS write) made
 * `readLock` return null while `acquireLock` kept failing EEXIST, so the
 * daemon died with "Lock race lost but no winner lock found" on every launch
 * and the TUI burned its full readiness window before falling back to the
 * worker. These tests pin the self-healing behavior.
 */
const workspace = "L:\\PROJECTS\\arcana-lock-test"
let home: string
let previousHome: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "arcana-lock-home-"))
  previousHome = process.env.ARCANA_HOME
  process.env.ARCANA_HOME = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.ARCANA_HOME
  else process.env.ARCANA_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
})

function seedLock(body: string) {
  const dir = join(home, "daemon")
  mkdirSync(dir, { recursive: true })
  writeFileSync(lockPath(workspaceHash(workspace)), body)
}

describe("daemon lock self-healing", () => {
  test("a NUL-filled lock reads as missing and is reclaimed", () => {
    seedLock("\0".repeat(164))

    expect(readLock(workspace)).toBeNull()
    const lock = acquireLock(workspace, 9142, "test")
    expect(lock).not.toBeNull()
    expect(lock!.pid).toBe(process.pid)
    expect(readLock(workspace)).toEqual(lock)
  })

  test("truncated or non-JSON content is reclaimed", () => {
    seedLock('{"workspace": "L:\\\\PROJ')

    expect(readLock(workspace)).toBeNull()
    expect(acquireLock(workspace, 9143, "test")).not.toBeNull()
  })

  test("parseable JSON with a broken shape is reclaimed", () => {
    seedLock('{"workspace":"L:\\\\PROJECTS","port":"nope"}')

    expect(readLock(workspace)).toBeNull()
    expect(acquireLock(workspace, 9144, "test")).not.toBeNull()
  })

  test("a live lock is respected, not stolen", () => {
    seedLock(
      JSON.stringify({
        workspace,
        pid: process.pid,
        port: 9142,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        version: "test",
      }),
    )

    expect(readLock(workspace)?.pid).toBe(process.pid)
    expect(isLockStale(readLock(workspace)!)).toBe(false)
    expect(acquireLock(workspace, 9145, "test")).toBeNull()
    // The live owner's lock is untouched.
    expect(readLock(workspace)?.port).toBe(9142)
  })

  test("a stale lock from a dead pid is reclaimed", () => {
    seedLock(
      JSON.stringify({
        workspace,
        // A pid that cannot be running: exceeds Windows' pid range.
        pid: 999_999,
        port: 9146,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        version: "test",
      }),
    )

    const stale = readLock(workspace)
    expect(stale).not.toBeNull()
    expect(isLockStale(stale!)).toBe(true)
    expect(acquireLock(workspace, 9147, "test")?.pid).toBe(process.pid)
    expect(readLock(workspace)?.port).toBe(9147)
  })

  test("removeLock clears the file", () => {
    acquireLock(workspace, 9148, "test")
    removeLock(workspace)
    expect(readLock(workspace)).toBeNull()
  })
})
