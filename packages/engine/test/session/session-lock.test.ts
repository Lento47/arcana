import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { acquireLock, releaseLock } from "../../src/session/session-lock"

describe("session-lock", () => {
  let dir: string

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "arcana-lock-test-")))
  })

  afterEach(() => {
    releaseLock(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("acquires a free lock without warning", () => {
    const result = acquireLock(dir)
    expect(result).toBe("acquired")
  })

  it("silently reacquires the lock when held by our own process", () => {
    // The user's scenario: a single arcana TUI creates multiple sessions in
    // the same project. Each createNext call re-acquires the lock. Without
    // the isOwnLock check, the second acquire would see the first lock and
    // emit a spurious "Concurrent sessions may conflict" warning.
    expect(acquireLock(dir, "session-1")).toBe("acquired")
    expect(acquireLock(dir, "session-2")).toBe("acquired")
    expect(acquireLock(dir, "session-3")).toBe("acquired")
  })

  it("refreshes the timestamp on own-PID reacquire so the PID-recycle grace check stays accurate", () => {
    expect(acquireLock(dir, "session-1")).toBe("acquired")
    const first = JSON.parse(
      fs.readFileSync(path.join(dir, ".arcana", ".session-lock"), "utf-8"),
    )
    // Force a measurable gap between the two acquires. The lock file's
    // timestamp is used downstream by the PID-recycle grace check; if we
    // didn't refresh it on own-PID acquire, the lock would look stale after
    // the TUI ran for longer than PID_RECYCLE_GRACE_MS.
    const original = first.timestamp
    const later = original + 10_000
    const realNow = Date.now
    Date.now = () => later
    try {
      expect(acquireLock(dir, "session-2")).toBe("acquired")
    } finally {
      Date.now = realNow
    }
    const refreshed = JSON.parse(
      fs.readFileSync(path.join(dir, ".arcana", ".session-lock"), "utf-8"),
    )
    expect(refreshed.timestamp).toBe(later)
  })

  it("cleans up a dead-foreign-PID lock and acquires", () => {
    // Write a lock from a dead process (PID 999999 is very unlikely to be live).
    fs.mkdirSync(path.join(dir, ".arcana"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, ".arcana", ".session-lock"),
      JSON.stringify({ pid: 999999, ppid: 1, timestamp: Date.now() - 1000 }),
    )
    const result = acquireLock(dir)
    expect(result).toBe("stale_cleaned")
  })

  it("cleans up a 24h-old lock and acquires", () => {
    fs.mkdirSync(path.join(dir, ".arcana"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, ".arcana", ".session-lock"),
      JSON.stringify({
        pid: 999999,
        ppid: 999998,
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      }),
    )
    const result = acquireLock(dir)
    expect(result).toBe("stale_cleaned")
  })
})
