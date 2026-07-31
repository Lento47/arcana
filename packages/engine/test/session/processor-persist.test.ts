import { describe, expect, test } from "bun:test"
import { shouldFlushPersist } from "../../src/session/processor"

const NOW = 1_000_000

describe("shouldFlushPersist", () => {
  test("no flush on first delta after start (interval not elapsed, count low)", () => {
    expect(shouldFlushPersist({ lastAt: NOW, count: 1 }, NOW + 100, 500, 64)).toBe(false)
  })

  test("flush when the interval elapsed", () => {
    expect(shouldFlushPersist({ lastAt: NOW, count: 1 }, NOW + 500, 500, 64)).toBe(true)
    expect(shouldFlushPersist({ lastAt: NOW, count: 1 }, NOW + 501, 500, 64)).toBe(true)
  })

  test("flush when the delta count threshold is hit", () => {
    expect(shouldFlushPersist({ lastAt: NOW, count: 63 }, NOW + 10, 500, 64)).toBe(false)
    expect(shouldFlushPersist({ lastAt: NOW, count: 64 }, NOW + 10, 500, 64)).toBe(true)
  })

  test("flush when both conditions are true", () => {
    expect(shouldFlushPersist({ lastAt: NOW, count: 64 }, NOW + 600, 500, 64)).toBe(true)
  })

  test("default parameters match the processor constants", () => {
    // Interval 500ms, threshold 64 — if these change, the processor and the
    // test must agree. Assert the defaults exist and behave.
    expect(shouldFlushPersist({ lastAt: NOW, count: 1 }, NOW + 500)).toBe(true)
    expect(shouldFlushPersist({ lastAt: NOW, count: 64 }, NOW + 10)).toBe(true)
  })
})
