import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { acquireLock, releaseLock, setHeartbeatInterval } from "../../src/session/session-lock"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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

  it("keeps the lock timestamp fresh via heartbeat so sibling invocations don't see us as stale", async () => {
    // Speed up the heartbeat so the test doesn't have to wait the production
    // 60s. Reset in afterEach-style logic by re-acquiring a no-op lock? No —
    // setHeartbeatInterval sets a module-level value, but bun's test runner
    // reuses the process across tests in this file, so subsequent tests
    // would inherit the fast heartbeat. We restore the default at the end.
    setHeartbeatInterval(50)
    try {
      expect(acquireLock(dir)).toBe("acquired")
      const lockPath = path.join(dir, ".arcana", ".session-lock")
      // Backdate the timestamp past the PID-recycle grace window so a stale
      // read would categorize the lock as `stale_dead`.
      const before = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      const backdated = Date.now() - 10 * 60 * 1000
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ ...before, timestamp: backdated }),
        "utf-8",
      )
      // Wait long enough for one heartbeat tick (50ms) plus jitter.
      await sleep(200)
      const after = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(after.timestamp).toBeGreaterThan(backdated)
      expect(after.pid).toBe(process.pid)
    } finally {
      setHeartbeatInterval(60 * 1000)
    }
  })

  it("stops the heartbeat after the last owned lock is released", () => {
    expect(acquireLock(dir)).toBe("acquired")
    releaseLock(dir)
    // Re-acquire on a fresh dir confirms the previous one cleaned up.
    const dir2 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "arcana-lock-test-")))
    try {
      expect(acquireLock(dir2)).toBe("acquired")
      // First dir's lock file should be gone (cleaned up by releaseLock).
      expect(fs.existsSync(path.join(dir, ".arcana", ".session-lock"))).toBe(false)
    } finally {
      releaseLock(dir2)
      fs.rmSync(dir2, { recursive: true, force: true })
    }
  })
})
