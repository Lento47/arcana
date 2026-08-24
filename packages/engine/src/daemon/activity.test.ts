import { afterEach, describe, expect, test } from "bun:test"
import { armIdle, clearIdle, resetActivity, __setIdleTimeoutForTest } from "./activity"

/**
 * Regression tests for the idle self-destruct that killed the daemon
 * MID-TURN (2026-08-23: long quiet goal_check / local-ollama turns crossed
 * the old fixed 5-minute fuse while SSE was down, leaving the TUI alive but
 * the server port dead — "Unable to connect" on every send).
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function setup(): { stopped: () => boolean } {
  let stopped = false
  armIdle("cwd-activity-test", () => {
    stopped = true
  })
  return { stopped: () => stopped }
}

afterEach(() => {
  clearIdle()
  __setIdleTimeoutForTest(5 * 60 * 1000)
})

describe("daemon idle self-destruct", () => {
  test("stops after the idle timeout when nothing happens", async () => {
    __setIdleTimeoutForTest(60)
    const s = setup()
    await sleep(160)
    expect(s.stopped()).toBe(true)
  })

  test("turn lifecycle activity postpones stop (quiet-turn protection)", async () => {
    __setIdleTimeoutForTest(150)
    const s = setup()
    // Simulate a long quiet turn emitting periodic events (~every 80ms).
    for (let i = 0; i < 4; i++) {
      await sleep(80)
      resetActivity()
    }
    // Total elapsed ~320ms > 150ms timeout; without resets it would be dead.
    expect(s.stopped()).toBe(false)
    // Once activity stops, the fuse completes normally.
    await sleep(220)
    expect(s.stopped()).toBe(true)
  })

  test("ARCANA_DAEMON_IDLE_TIMEOUT_MS=0 disables self-destruct entirely", async () => {
    __setIdleTimeoutForTest(0)
    const s = setup()
    await sleep(120)
    expect(s.stopped()).toBe(false)
  })
})
