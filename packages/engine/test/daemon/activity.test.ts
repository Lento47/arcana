import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  __setIdleTimeoutForTest,
  __setWorkTimeoutForTest,
  activityStatus,
  armIdle,
  clearIdle,
  holdWork,
  releaseWork,
  resetActivity,
  sseConnected,
  sseDisconnected,
} from "../../src/daemon/activity"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("daemon idle activity control", () => {
  beforeEach(() => {
    __setIdleTimeoutForTest(120)
    clearIdle()
  })

  afterEach(() => {
    clearIdle()
    __setIdleTimeoutForTest(5 * 60 * 1000)
    __setWorkTimeoutForTest(60 * 60 * 1000)
  })

  it("stops the daemon when no activity arrives before the timeout", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("resetActivity re-arms the timer and prevents the stop", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    await sleep(60) // t≈60
    resetActivity("L:\\ws") // deadline extends to ≈180
    await sleep(60) // t≈120
    resetActivity("L:\\ws") // deadline extends to ≈240
    await sleep(100) // t≈220 — inside the re-armed window
    expect(stopped).toBe(0)
    await sleep(60) // t≈280 — past the re-armed deadline
    expect(stopped).toBe(1)
  })

  it("resetActivity ignores a different workspace cwd", async () => {
    let stopped = 0
    armIdle("L:\\ws-a", () => stopped++)
    resetActivity("L:\\ws-b")
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("an open SSE client suspends the idle stop entirely", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    sseConnected()
    await sleep(250)
    expect(stopped).toBe(0)
  })

  it("the idle countdown restarts from scratch when the last client disconnects", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    sseConnected()
    await sleep(80)
    sseDisconnected()
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("two clients: first connect suspends, first disconnect keeps it suspended", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    sseConnected()
    sseConnected()
    sseDisconnected()
    await sleep(250)
    expect(stopped).toBe(0)
    sseDisconnected()
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("clearIdle cancels a pending stop", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    clearIdle()
    await sleep(200)
    expect(stopped).toBe(0)
  })

  it("a live work hold keeps the daemon alive without a client", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    holdWork("ses-1")
    // Past the reconnect grace: the turn is still live, so the daemon stays.
    await sleep(200)
    expect(stopped).toBe(0)
    // Work settles with no client attached: a fresh grace starts, then stops.
    releaseWork("ses-1")
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("the work fuse stops a wedged turn after the work timeout", async () => {
    __setWorkTimeoutForTest(150)
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    holdWork("ses-wedged")
    await sleep(80)
    resetActivity("L:\\ws") // extends the work fuse to ≈230ms
    await sleep(100) // t≈180: inside the re-armed work fuse
    expect(stopped).toBe(0)
    await sleep(100) // t≈280: past it
    expect(stopped).toBe(1)
  })

  it("releasing work while a client is attached stays suspended", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    holdWork("ses-1")
    sseConnected()
    releaseWork("ses-1")
    await sleep(250)
    expect(stopped).toBe(0)
    sseDisconnected()
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("nested sessions hold until the last one settles", async () => {
    let stopped = 0
    armIdle("L:\\ws", () => stopped++)
    holdWork("ses-parent")
    holdWork("ses-child")
    releaseWork("ses-child")
    await sleep(200)
    expect(stopped).toBe(0)
    releaseWork("ses-parent")
    await sleep(200)
    expect(stopped).toBe(1)
  })

  it("activityStatus reports the armed fuse and live work", async () => {
    armIdle("L:\\ws", () => {})
    holdWork("ses-1")
    const working = activityStatus()
    expect(working.workHeld).toBe(1)
    expect(working.reason).toBe("work")
    expect(working.deadlineAt).toBeGreaterThan(Date.now())
    expect(working.reconnectGraceMs).toBe(120)

    releaseWork("ses-1")
    expect(activityStatus().reason).toBe("grace")

    sseConnected()
    expect(activityStatus().reason).toBe("suspended")
    expect(activityStatus().deadlineAt).toBeNull()
    sseDisconnected()
  })
})
