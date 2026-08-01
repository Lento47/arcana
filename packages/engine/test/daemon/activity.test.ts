import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  __setIdleTimeoutForTest,
  armIdle,
  clearIdle,
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
})
