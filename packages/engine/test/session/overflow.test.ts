import { describe, expect, test } from "bun:test"
import {
  compactionPressure,
  DEFAULT_PERFORMANCE_MAX_INPUT_TOKENS,
  DEFAULT_THRESHOLD_PERCENT,
  effectiveContext,
  isOverflow,
  performanceMaxInputTokens,
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

describe("overflow.compactionPressure", () => {
  const wide = model({ context: 1_000_000, output: 131_072 })

  test("uses the 96k performance limit independently of a 1M safety window", () => {
    expect(performanceMaxInputTokens(cfg())).toBe(DEFAULT_PERFORMANCE_MAX_INPUT_TOKENS)
    expect(compactionPressure({ cfg: cfg(), model: wide, tokens: tokens(95_999) })).toMatchObject({
      hot: false,
      limit: 96_000,
    })
    expect(compactionPressure({ cfg: cfg(), model: wide, tokens: tokens(150_000) })).toEqual({
      count: 150_000,
      hot: true,
      limit: 96_000,
      reason: "performance",
    })
  })

  test("performance false preserves safety compaction", () => {
    const config = cfg({ performance: false })
    expect(compactionPressure({ cfg: config, model: wide, tokens: tokens(150_000) }).hot).toBe(false)
    expect(compactionPressure({ cfg: config, model: wide, tokens: tokens(850_000) })).toMatchObject({
      hot: true,
      reason: "safety",
    })
  })

  test("auto false disables both pressure classes", () => {
    expect(
      compactionPressure({ cfg: cfg({ auto: false }), model: wide, tokens: tokens(900_000) }).hot,
    ).toBe(false)
  })

  test("supports a configured performance limit", () => {
    const config = cfg({ performance_max_input_tokens: 120_000 })
    expect(performanceMaxInputTokens(config)).toBe(120_000)
    expect(compactionPressure({ cfg: config, model: wide, tokens: tokens(119_999) }).hot).toBe(false)
    expect(compactionPressure({ cfg: config, model: wide, tokens: tokens(120_000) }).reason).toBe("performance")
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

  test("default_context_tokens assumes a window for unknown-limit models (G1a)", () => {
    const m = model({ context: 0, output: 8_000 })
    const config = cfg({ default_context_tokens: 100_000 })
    // effectiveContext resolves the assumed window
    expect(effectiveContext(config, m)).toBe(100_000)
    expect(effectiveContext(cfg(), m)).toBe(0)
    // 50k = 50% of the assumed window → no overflow
    expect(isOverflow({ cfg: config, model: m, tokens: tokens(50_000) })).toBe(false)
    // 85k = 85% of assumed → proactive safety trigger fires on a limit-less model
    expect(isOverflow({ cfg: config, model: m, tokens: tokens(85_000) })).toBe(true)
    // usable derives from the assumed window too: 100k - min(20k, 8k) = 92k
    expect(usable({ cfg: config, model: m })).toBe(92_000)
    // compactionPressure surfaces it as safety, with limit at threshold% of assumed
    expect(compactionPressure({ cfg: config, model: m, tokens: tokens(85_000) })).toMatchObject({
      hot: true,
      reason: "safety",
      limit: 85_000,
    })
  })

  test("default_context_tokens never overrides an advertised window", () => {
    const config = cfg({ default_context_tokens: 100_000 })
    expect(effectiveContext(config, model({ context: 400_000, output: 4_000 }))).toBe(400_000)
    // advertised wins even when smaller than the assumption
    expect(effectiveContext(config, model({ context: 32_000, output: 4_000 }))).toBe(32_000)
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
