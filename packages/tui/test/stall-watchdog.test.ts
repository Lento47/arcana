import { describe, expect, test } from "bun:test"
import {
  formatStallLine,
  parseStallIntervalMs,
  startStallWatchdog,
} from "../src/util/stall-watchdog"

describe("parseStallIntervalMs", () => {
  test("off when unset empty zero false", () => {
    expect(parseStallIntervalMs({})).toBeUndefined()
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "" })).toBeUndefined()
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "0" })).toBeUndefined()
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "false" })).toBeUndefined()
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "FALSE" })).toBeUndefined()
  })

  test("rejects below 50ms", () => {
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "49" })).toBeUndefined()
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "abc" })).toBeUndefined()
  })

  test("parses valid interval", () => {
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "200" })).toBe(200)
    expect(parseStallIntervalMs({ ARCANA_DEBUG_STALL_MS: "1000" })).toBe(1000)
  })
})

describe("formatStallLine", () => {
  test("includes snapshot fields", () => {
    const line = formatStallLine(2500, {
      sessionID: "ses_1",
      msgCount: 12,
      partApproxBytes: 999,
      compacting: true,
      lastEventType: "message.part.delta",
      lastEventAgeMs: 40,
      routeType: "session",
    }, { heapUsedMB: 128.4 })
    expect(line).toContain("[stall] gapMs=2500")
    expect(line).toContain("sessionID=ses_1")
    expect(line).toContain("msgCount=12")
    expect(line).toContain("partApproxBytes=999")
    expect(line).toContain("compacting=1")
    expect(line).toContain("lastEventType=message.part.delta")
    expect(line).toContain("heapUsedMB=128.4")
  })
})

describe("startStallWatchdog", () => {
  test("fires when gap exceeds warn threshold", async () => {
    const lines: string[] = []
    let last = performance.now() - 3000 // pretend prior tick was 3s ago
    // Monkey-patch: force first interval callback to see large gap by delaying start
    const stop = startStallWatchdog({
      intervalMs: 50,
      warnGapMs: 200,
      log: (line) => lines.push(line),
      getSnapshot: () => ({ routeType: "home", msgCount: 0 }),
    })
    // Block the event loop so the next interval sees a large gap
    const start = Date.now()
    while (Date.now() - start < 350) {
      // busy wait
    }
    await new Promise((r) => setTimeout(r, 80))
    stop()
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines[0]).toContain("[stall]")
    expect(lines[0]).toContain("routeType=home")
    void last
  })
})
