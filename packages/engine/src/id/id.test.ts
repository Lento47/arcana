import { describe, expect, test } from "bun:test"
import { Identifier } from "./id"

const DAY = 24 * 60 * 60 * 1000

describe("Identifier timestamp encoding", () => {
  test("round-trips modern millisecond timestamps", () => {
    const now = Date.now()
    for (const ts of [now, now - 3 * DAY, now - 10 * DAY, 1_700_000_000_000]) {
      const decoded = Identifier.timestamp(Identifier.create("tool", "ascending", ts))
      expect(Math.abs(decoded - ts)).toBeLessThan(1000)
    }
  })

  test("ascending IDs preserve chronological order", () => {
    const earlier = Identifier.create("tool", "ascending", 1_700_000_000_000)
    const later = Identifier.create("tool", "ascending", 1_700_000_001_000)
    expect(Identifier.timestamp(later)).toBeGreaterThan(Identifier.timestamp(earlier))
  })

  test("ascending IDs sort by creation order within the same second", () => {
    // Same encoded second, different wall-clock milliseconds. The counter
    // must advance per call; otherwise the random suffix decides the order.
    const ids = [
      Identifier.create("tool", "ascending", 1_700_000_000_001),
      Identifier.create("tool", "ascending", 1_700_000_000_100),
      Identifier.create("tool", "ascending", 1_700_000_000_999),
    ]
    const sorted = [...ids].sort()
    expect(sorted).toEqual(ids)
  })

  test("ascending IDs stay ordered across a burst within the counter capacity", () => {
    // 2000 IDs in one encoded second stay strictly ordered (the 12-bit
    // counter allows 4095 per second before any carry).
    const base = 1_700_000_000_000
    const burst = Array.from({ length: 2000 }, (_, index) =>
      Identifier.create("tool", "ascending", base + index),
    )
    const sorted = [...burst].sort()
    expect(sorted).toEqual(burst)
  })
})
