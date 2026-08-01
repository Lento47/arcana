import { describe, expect, test } from "bun:test"
import {
  createMissingDeltaTracker,
  MISSING_DELTA_MAX_PER_PART,
  MISSING_DELTA_MAX_BYTES,
} from "../src/util/missing-delta-tracker"

describe("createMissingDeltaTracker (P12.5)", () => {
  test("counts deltas per part with bytes and last sequence", () => {
    const t = createMissingDeltaTracker()
    t.note("prt_1", "abc", 10)
    t.note("prt_1", "def", 11)
    const snap = t.snapshot()
    const s = snap.get("prt_1")!
    expect(s.count).toBe(2)
    expect(s.bytes).toBe(6)
    expect(s.lastSequence).toBe(11)
    expect(t.overflowed("prt_1")).toBe(false)
  })

  test("overflow at the per-part count cap resets the log", () => {
    const t = createMissingDeltaTracker()
    let overflowed = false
    for (let i = 0; i < MISSING_DELTA_MAX_PER_PART; i++) {
      t.note("prt_big", "x", i)
      if (t.overflowed("prt_big")) overflowed = true
    }
    expect(overflowed).toBe(true)
    // After overflow the log is reset: next note starts fresh.
    t.note("prt_big", "y", 999)
    expect(t.snapshot().get("prt_big")!.count).toBe(1)
  })

  test("overflow at the byte cap resets the log", () => {
    const t = createMissingDeltaTracker()
    const chunk = "a".repeat(1024)
    let overflowed = false
    for (let i = 0; i < MISSING_DELTA_MAX_BYTES / 1024 + 1 && !overflowed; i++) {
      t.note("prt_bytes", chunk, i)
      if (t.overflowed("prt_bytes")) overflowed = true
    }
    expect(overflowed).toBe(true)
  })

  test("clear removes a part's stats", () => {
    const t = createMissingDeltaTracker()
    t.note("prt_2", "abc", 1)
    t.clear("prt_2")
    expect(t.snapshot().has("prt_2")).toBe(false)
  })

  test("empty delta counts but no bytes", () => {
    const t = createMissingDeltaTracker()
    t.note("prt_3", undefined, 7)
    const s = t.snapshot().get("prt_3")!
    expect(s.count).toBe(1)
    expect(s.bytes).toBe(0)
    expect(s.lastSequence).toBe(7)
  })
})
