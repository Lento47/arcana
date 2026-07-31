import { describe, expect, test } from "bun:test"
import { createSseWatchdog } from "../src/util/sse-watchdog"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("createSseWatchdog", () => {
  test("trips once after timeoutMs of silence", async () => {
    let trips = 0
    const w = createSseWatchdog({ timeoutMs: 50, onTrip: () => trips++ })
    w.arm()
    await sleep(120)
    expect(trips).toBe(1)
    // Single fire: no re-arm means no second trip.
    await sleep(80)
    expect(trips).toBe(1)
  })

  test("re-arm on events defers the trip", async () => {
    let trips = 0
    const w = createSseWatchdog({ timeoutMs: 60, onTrip: () => trips++ })
    w.arm()
    for (let i = 0; i < 5; i++) {
      await sleep(30)
      w.arm() // an event arrived — push the window out
    }
    // 150ms elapsed with events every 30ms; the 60ms window kept resetting.
    expect(trips).toBe(0)
    // Now go silent past the window.
    await sleep(100)
    expect(trips).toBe(1)
  })

  test("stop cancels a pending trip", async () => {
    let trips = 0
    const w = createSseWatchdog({ timeoutMs: 50, onTrip: () => trips++ })
    w.arm()
    w.stop()
    await sleep(120)
    expect(trips).toBe(0)
  })

  test("arm after stop re-arms cleanly", async () => {
    let trips = 0
    const w = createSseWatchdog({ timeoutMs: 50, onTrip: () => trips++ })
    w.arm()
    w.stop()
    await sleep(30)
    w.arm()
    await sleep(120)
    expect(trips).toBe(1)
  })

  test("trip during silence between events fires exactly once until re-armed", async () => {
    let trips = 0
    const w = createSseWatchdog({ timeoutMs: 50, onTrip: () => trips++ })
    w.arm()
    await sleep(100) // window expires, trips once
    w.arm() // new stream connection established
    await sleep(100) // silent again
    expect(trips).toBe(2)
  })
})
