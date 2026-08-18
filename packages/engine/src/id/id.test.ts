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
})
