import { describe, expect, test } from "bun:test"
import {
  COMPACT_NOW_PERCENT,
  COMPACT_SOON_PERCENT,
  contextPressure,
  contextTokenCount,
  hasContextUsage,
  usableContextWindow,
} from "../../src/util/context-pressure"

describe("contextPressure", () => {
  test("defaults match engine 85 / 95 bands", () => {
    expect(COMPACT_SOON_PERCENT).toBe(85)
    expect(COMPACT_NOW_PERCENT).toBe(95)
  })

  test("undefined below soon threshold", () => {
    expect(contextPressure(null)).toBeUndefined()
    expect(contextPressure(undefined)).toBeUndefined()
    expect(contextPressure(84)).toBeUndefined()
  })

  test("soon at 85 inclusive", () => {
    expect(contextPressure(85)).toBe("compact soon")
    expect(contextPressure(94)).toBe("compact soon")
  })

  test("now at 95 inclusive", () => {
    expect(contextPressure(95)).toBe("compact now")
    expect(contextPressure(100)).toBe("compact now")
  })
})

describe("contextTokenCount (engine session/overflow parity)", () => {
  test("prefers provider-filled total over the sum", () => {
    // sum would be 8000+2000+500+1000+0 = 11500; total wins.
    expect(
      contextTokenCount({ total: 9500, input: 8000, output: 2000, reasoning: 500, cache: { read: 1000, write: 0 } }),
    ).toBe(9500)
  })

  test("falls back to the sum when total missing or non-finite", () => {
    expect(contextTokenCount({ input: 8000, output: 2000, reasoning: 500, cache: { read: 1000, write: 0 } })).toBe(
      11500,
    )
    expect(
      contextTokenCount({ total: Number.NaN, input: 1000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    ).toBe(1000)
  })

  test("tolerates absent fields", () => {
    expect(contextTokenCount({})).toBe(0)
    expect(contextTokenCount({ cache: {} })).toBe(0)
  })
})

describe("hasContextUsage", () => {
  test("true on any real usage channel", () => {
    expect(hasContextUsage({ input: 1 })).toBe(true)
    expect(hasContextUsage({ output: 1 })).toBe(true)
    expect(hasContextUsage({ total: 1 })).toBe(true)
  })

  test("false for zero, missing, and non-finite totals", () => {
    expect(hasContextUsage({})).toBe(false)
    expect(hasContextUsage({ input: 0, output: 0 })).toBe(false)
    expect(hasContextUsage({ total: Number.NaN })).toBe(false)
  })
})

describe("usableContextWindow (engine session/overflow.usable defaults)", () => {
  test("unlimited / unknown window has no ceiling (0)", () => {
    expect(usableContextWindow(undefined)).toBe(0)
    expect(usableContextWindow({ context: 0, output: 8192 })).toBe(0)
  })

  test("context path reserves capped model output", () => {
    // engine context path subtracts full maxOutputTokens (cap 32k) — small output → full reserve
    expect(usableContextWindow({ context: 128_000, output: 8_192 })).toBe(128_000 - 8_192)
    // large output clamps to the 32k OUTPUT_TOKEN_MAX cap
    expect(usableContextWindow({ context: 200_000, output: 64_000 })).toBe(168_000)
    // output unset → falls back to the 32k cap
    expect(usableContextWindow({ context: 128_000 })).toBe(96_000)
  })

  test("input cap wins when present", () => {
    // engine: limit.input - min(20k, maxOutput); here reserve = min(20k, 8192) = 8192
    expect(usableContextWindow({ context: 128_000, input: 100_000, output: 8_192 })).toBe(91_808)
    // never negative
    expect(usableContextWindow({ context: 10_000, input: 5_000, output: 30_000 })).toBe(0)
  })
})
