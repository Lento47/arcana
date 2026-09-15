import { describe, expect, test } from "bun:test"
import {
  COMPACT_NOW_PERCENT,
  COMPACT_SOON_PERCENT,
  compactNowPercent,
  compactSoonPercent,
  compactionAutoEnabled,
  contextPressure,
  contextTokenCount,
  contextUsageFor,
  effectiveContext,
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
    expect(hasContextUsage({ reasoning: 1 })).toBe(true)
    expect(hasContextUsage({ cache: { read: 1 } })).toBe(true)
    expect(hasContextUsage({ cache: { write: 1 } })).toBe(true)
  })

  test("false for zero, missing, and non-finite totals", () => {
    expect(hasContextUsage({})).toBe(false)
    expect(hasContextUsage({ input: 0, output: 0 })).toBe(false)
    expect(hasContextUsage({ total: Number.NaN })).toBe(false)
  })
})

describe("compaction config mirrors (engine parity)", () => {
  test("soon defaults to 85 and clamps bad config", () => {
    expect(compactSoonPercent()).toBe(85)
    expect(compactSoonPercent({})).toBe(85)
    expect(compactSoonPercent({ threshold_percent: 90 })).toBe(90)
    expect(compactSoonPercent({ threshold_percent: 0 })).toBe(85)
    expect(compactSoonPercent({ threshold_percent: 101 })).toBe(85)
    expect(compactSoonPercent({ threshold_percent: Number.NaN })).toBe(85)
  })

  test("now stays the emergency band but never below soon", () => {
    expect(compactNowPercent()).toBe(95)
    expect(compactNowPercent({ threshold_percent: 90 })).toBe(95)
    expect(compactNowPercent({ threshold_percent: 98 })).toBe(98)
  })

  test("auto gate defaults on and only explicit false disables", () => {
    expect(compactionAutoEnabled()).toBe(true)
    expect(compactionAutoEnabled({})).toBe(true)
    expect(compactionAutoEnabled({ auto: false })).toBe(false)
  })

  test("effectiveContext prefers advertised window over assumed default", () => {
    expect(effectiveContext({ context: 128_000 }, { default_context_tokens: 200_000 })).toBe(128_000)
    expect(effectiveContext(undefined, { default_context_tokens: 100_000 })).toBe(100_000)
    expect(effectiveContext({ context: 0 }, { default_context_tokens: 100_000 })).toBe(100_000)
    expect(effectiveContext(undefined, undefined)).toBe(0)
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

  test("honors configured reserved buffer and assumed window", () => {
    // reserved applies to the input-cap branch (engine `usable`), not the context path
    expect(usableContextWindow({ context: 128_000, input: 100_000, output: 8_192 }, { reserved: 40_000 })).toBe(60_000)
    expect(usableContextWindow({ context: 128_000, output: 8_192 }, { reserved: 40_000 })).toBe(119_808)
    // unknown window + default_context_tokens: context path uses the assumption
    expect(usableContextWindow(undefined, { default_context_tokens: 100_000 })).toBe(68_000)
    // input cap still wins, reserved applies to it
    expect(usableContextWindow({ input: 100_000 }, { reserved: 10_000, default_context_tokens: 100_000 })).toBe(90_000)
  })
})

describe("contextPressure options", () => {
  test("honors custom soon/now bands", () => {
    expect(contextPressure(89, { soon: 90 })).toBeUndefined()
    expect(contextPressure(90, { soon: 90 })).toBe("compact soon")
    expect(contextPressure(97, { soon: 90, now: 98 })).toBe("compact soon")
    expect(contextPressure(98, { soon: 90, now: 98 })).toBe("compact now")
  })

  test("auto disabled suppresses labels", () => {
    expect(contextPressure(99, { auto: false })).toBeUndefined()
  })
})

describe("contextUsageFor (shared surface snapshot)", () => {
  const limit = { context: 100_000, output: 32_000 }

  test("uses canonical count, effective context and shared bands", () => {
    const snapshot = contextUsageFor({
      tokens: { total: 85_000, input: 80_000, output: 5_000, reasoning: 0, cache: { read: 0, write: 0 } },
      limit,
    })
    expect(snapshot.tokens).toBe(85_000)
    expect(snapshot.percent).toBe(85)
    // engine hard ceiling: 100k - 32k = 68k
    expect(snapshot.overBudget).toBe(true)
    expect(snapshot.pressure).toBe("compact soon")
  })

  test("pressure uses the unrounded ratio and config threshold", () => {
    // 84.6% rounds to 85 for display but must not fire below an 85% threshold.
    const snapshot = contextUsageFor({ tokens: { input: 84_600 }, limit })
    expect(snapshot.percent).toBe(85)
    expect(snapshot.pressure).toBeUndefined()
    // Custom threshold makes the same usage hot.
    const custom = contextUsageFor({ tokens: { input: 84_600 }, limit, compaction: { threshold_percent: 84 } })
    expect(custom.pressure).toBe("compact soon")
  })

  test("auto false and unknown windows yield no pressure and null percent", () => {
    const suppressed = contextUsageFor({
      tokens: { input: 99_000 },
      limit,
      compaction: { auto: false },
    })
    expect(suppressed.pressure).toBeUndefined()
    expect(suppressed.percent).toBe(99)

    const unknown = contextUsageFor({ tokens: { input: 1_000 }, limit: undefined })
    expect(unknown.percent).toBeNull()
    expect(unknown.pressure).toBeUndefined()
    expect(unknown.overBudget).toBe(false)

    const assumed = contextUsageFor({
      tokens: { input: 50_000 },
      limit: undefined,
      compaction: { default_context_tokens: 100_000 },
    })
    expect(assumed.percent).toBe(50)
  })
})
