import { describe, expect, test } from "bun:test"
import {
  DEFAULT_THRESHOLD_PERCENT,
  isOverflow,
  thresholdPercent,
  tokenCount,
  usable,
} from "../../src/session/overflow"
import type { ConfigV1 } from "@arcana/core/v1/config/config"
import type { Provider } from "../../src/provider/provider"

function model(limit: { context: number; input?: number; output: number }): Provider.Model {
  return {
    limit: {
      context: limit.context,
      input: limit.input,
      output: limit.output,
    },
  } as Provider.Model
}

function cfg(compaction?: ConfigV1.Info["compaction"]): ConfigV1.Info {
  return { compaction } as ConfigV1.Info
}

const tokens = (input: number, output = 0, cacheRead = 0) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: cacheRead, write: 0 },
})

describe("overflow.tokenCount", () => {
  test("sums input output cache", () => {
    expect(tokenCount(tokens(10, 20, 5))).toBe(35)
  })
  test("includes reasoning when total is absent", () => {
    expect(
      tokenCount({
        input: 10,
        output: 20,
        reasoning: 5,
        cache: { read: 1, write: 2 },
      }),
    ).toBe(38)
  })
  test("prefers total when set", () => {
    expect(tokenCount({ ...tokens(10, 20), total: 99, reasoning: 5 })).toBe(99)
  })
})

describe("overflow.thresholdPercent", () => {
  test("defaults to 85", () => {
    expect(thresholdPercent(cfg())).toBe(DEFAULT_THRESHOLD_PERCENT)
    expect(thresholdPercent(cfg({}))).toBe(85)
  })
  test("uses configured value", () => {
    expect(thresholdPercent(cfg({ threshold_percent: 90 }))).toBe(90)
  })
  test("rejects out of range", () => {
    expect(thresholdPercent(cfg({ threshold_percent: 0 }))).toBe(85)
    expect(thresholdPercent(cfg({ threshold_percent: 101 }))).toBe(85)
  })
})

describe("overflow.isOverflow (P0 85% proactive)", () => {
  test("false below 85% and below usable", () => {
    // context 100k, usable ~68k (100k-32k). 50k = 50%.
    const m = model({ context: 100_000, output: 32_000 })
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(50_000),
      }),
    ).toBe(false)
  })

  test("true at exactly 85% of context", () => {
    const m = model({ context: 100_000, output: 32_000 })
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(85_000),
      }),
    ).toBe(true)
  })

  test("false at 84% when still under usable", () => {
    // usable for context 200k output 32k = 168k. 84% of 200k = 168k exactly → hard ceiling true.
    // Use larger context so 84% < usable.
    // context 200_000, output 10_000 → usable 190_000. 84% = 168_000 < 190k.
    const m = model({ context: 200_000, output: 10_000 })
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(168_000), // 84%
      }),
    ).toBe(false)
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(170_000), // 85%
      }),
    ).toBe(true)
  })

  test("true at 100%", () => {
    const m = model({ context: 100_000, output: 32_000 })
    expect(isOverflow({ cfg: cfg(), model: m, tokens: tokens(100_000) })).toBe(true)
  })

  test("hard ceiling: past usable even when below 85%", () => {
    // context 100k, usable 68k. count 70k = 70% < 85% but >= usable.
    const m = model({ context: 100_000, output: 32_000 })
    expect(isOverflow({ cfg: cfg(), model: m, tokens: tokens(70_000) })).toBe(true)
    expect(usable({ cfg: cfg(), model: m })).toBe(68_000)
  })

  test("auto false never overflows", () => {
    const m = model({ context: 100_000, output: 32_000 })
    expect(
      isOverflow({
        cfg: cfg({ auto: false }),
        model: m,
        tokens: tokens(99_000),
      }),
    ).toBe(false)
  })

  test("context 0 never overflows", () => {
    const m = model({ context: 0, output: 32_000 })
    expect(isOverflow({ cfg: cfg(), model: m, tokens: tokens(1_000_000) })).toBe(false)
  })

  test("custom threshold_percent 90", () => {
    const m = model({ context: 100_000, output: 5_000 })
    // usable 95k. 88% = 88k < 90 and < usable
    expect(
      isOverflow({
        cfg: cfg({ threshold_percent: 90 }),
        model: m,
        tokens: tokens(88_000),
      }),
    ).toBe(false)
    expect(
      isOverflow({
        cfg: cfg({ threshold_percent: 90 }),
        model: m,
        tokens: tokens(90_000),
      }),
    ).toBe(true)
  })

  test("includes cache.read in percent", () => {
    const m = model({ context: 100_000, output: 5_000 })
    // 80k input + 5k cache = 85k
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(80_000, 0, 5_000),
      }),
    ).toBe(true)
  })

  test("includes reasoning in percent when total absent", () => {
    const m = model({ context: 100_000, output: 5_000 })
    // 80k input + 5k reasoning = 85k → proactive trigger
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: {
          input: 80_000,
          output: 0,
          reasoning: 5_000,
          cache: { read: 0, write: 0 },
        },
      }),
    ).toBe(true)
  })

  test("outputTokenMax affects hard-ceiling usable", () => {
    const m = model({ context: 100_000, output: 32_000 })
    // Without override, usable = 100k - 32k = 68k → 70k overflows via hard ceiling
    expect(isOverflow({ cfg: cfg(), model: m, tokens: tokens(70_000) })).toBe(true)
    // With a tiny outputTokenMax, usable is larger (100k - 1k = 99k) so 70k is not over ceiling;
    // 70% < 85% so overall false
    expect(
      isOverflow({
        cfg: cfg(),
        model: m,
        tokens: tokens(70_000),
        outputTokenMax: 1_000,
      }),
    ).toBe(false)
  })
})
