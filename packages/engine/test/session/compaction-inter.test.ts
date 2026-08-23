import { describe, expect, test } from "bun:test"
import {
  compactSuccessMetadata,
  hysteresisTokensFromMessages,
  META_LAST_COMPACT_AT,
  META_LAST_COMPACT_PASS,
  META_LAST_COMPACT_RESULT_TOKENS,
  META_LAST_COMPACT_SOURCE_TOKENS,
  META_LAST_COMPACT_TOKENS,
  minInterTokenDelta,
  passesCompactHysteresis,
  readLastCompactTokens,
  shouldInterCompact,
  usageForHysteresis,
} from "../../src/session/compaction-inter"
import type { SessionV1 } from "@arcana/core/v1/session"

describe("compaction-inter.shouldInterCompact", () => {
  test("false when below 85% threshold", () => {
    expect(
      shouldInterCompact({
        count: 80_000,
        context: 100_000,
        thresholdPercent: 85,
      }),
    ).toBe(false)
  })

  test("true at 85% when never compacted", () => {
    expect(
      shouldInterCompact({
        count: 85_000,
        context: 100_000,
        thresholdPercent: 85,
      }),
    ).toBe(true)
  })

  test("hysteresis: blocks if growth since last compact is small", () => {
    expect(
      shouldInterCompact({
        count: 90_000,
        context: 100_000,
        thresholdPercent: 85,
        lastCompactTokens: 88_000, // only +2k; min delta is max(5k, 5%*100k=5k)
      }),
    ).toBe(false)
  })

  test("hysteresis: allows when growth exceeds min delta", () => {
    expect(
      shouldInterCompact({
        count: 95_000,
        context: 100_000,
        thresholdPercent: 85,
        lastCompactTokens: 85_000, // +10k
      }),
    ).toBe(true)
  })

  test("minInterTokenDelta scales with context", () => {
    expect(minInterTokenDelta(100_000)).toBe(5_000)
    expect(minInterTokenDelta(200_000)).toBe(10_000)
  })

  test("M2: alreadyHot allows below percent (hard ceiling path)", () => {
    // 65k is below 85% of 100k but may still be past usable budget
    expect(
      shouldInterCompact({
        count: 65_000,
        context: 100_000,
        thresholdPercent: 85,
      }),
    ).toBe(false)
    expect(
      shouldInterCompact({
        count: 65_000,
        context: 100_000,
        thresholdPercent: 85,
        alreadyHot: true,
      }),
    ).toBe(true)
  })

  test("M2: alreadyHot still respects hysteresis", () => {
    expect(
      shouldInterCompact({
        count: 66_000,
        context: 100_000,
        alreadyHot: true,
        lastCompactTokens: 64_000, // +2k < 5k
      }),
    ).toBe(false)
    expect(
      shouldInterCompact({
        count: 72_000,
        context: 100_000,
        alreadyHot: true,
        lastCompactTokens: 64_000, // +8k
      }),
    ).toBe(true)
  })
})

describe("compaction-inter.hysteresis metric (M1)", () => {
  test("usageForHysteresis matches tokenCount components", () => {
    expect(
      usageForHysteresis({
        input: 10_000,
        output: 2_000,
        reasoning: 500,
        cache: { read: 100, write: 50 },
      }),
    ).toBe(12_650)
  })

  test("passesCompactHysteresis pure growth gate", () => {
    expect(passesCompactHysteresis({ count: 10, context: 100_000 })).toBe(true)
    expect(
      passesCompactHysteresis({
        count: 90_000,
        context: 100_000,
        lastCompactTokens: 88_000,
      }),
    ).toBe(false)
  })

  test("hysteresisTokensFromMessages uses latest finished non-summary assistant", () => {
    const messages = [
      {
        info: {
          role: "user",
          id: "u1",
        } as SessionV1.User,
      },
      {
        info: {
          role: "assistant",
          finish: "stop",
          summary: true,
          tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        } as SessionV1.Assistant,
      },
      {
        info: {
          role: "assistant",
          finish: "stop",
          tokens: { input: 40_000, output: 5_000, reasoning: 0, cache: { read: 0, write: 0 } },
        } as SessionV1.Assistant,
      },
      {
        info: {
          role: "user",
          id: "u2",
        } as SessionV1.User,
      },
    ]
    // Walks from end: user skipped, then assistant 45k
    expect(hysteresisTokensFromMessages(messages as never)).toBe(45_000)
  })

  test("hysteresisTokensFromMessages skips errored assistants", () => {
    // Chronological: good then errored — walk from end skips error, uses good.
    const messages = [
      {
        info: {
          role: "assistant",
          finish: "stop",
          tokens: { input: 12_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        } as SessionV1.Assistant,
      },
      {
        info: {
          role: "assistant",
          finish: "error",
          error: { name: "x", data: {} },
          tokens: { input: 99_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        } as unknown as SessionV1.Assistant,
      },
    ]
    expect(hysteresisTokensFromMessages(messages as never)).toBe(12_000)
  })
})

describe("compaction-inter.metadata", () => {
  test("read/write last compact tokens", () => {
    const meta = compactSuccessMetadata(undefined, {
      sourceTokens: 150_000,
      resultTokens: 18_000,
      pass: "inter",
    })
    expect(meta[META_LAST_COMPACT_TOKENS]).toBe(18_000)
    expect(meta[META_LAST_COMPACT_SOURCE_TOKENS]).toBe(150_000)
    expect(meta[META_LAST_COMPACT_RESULT_TOKENS]).toBe(18_000)
    expect(meta[META_LAST_COMPACT_PASS]).toBe("inter")
    expect(typeof meta[META_LAST_COMPACT_AT]).toBe("number")
    expect(readLastCompactTokens(meta)).toBe(18_000)
    expect(readLastCompactTokens({})).toBeUndefined()
  })

  test("uses post-compact baseline so a later 96k session can compact again", () => {
    const afterFirst = compactSuccessMetadata(undefined, {
      sourceTokens: 150_000,
      resultTokens: 18_000,
      pass: "inter",
    })
    const last = readLastCompactTokens(afterFirst)
    expect(
      shouldInterCompact({
        count: 96_000,
        context: 96_000,
        lastCompactTokens: last,
        alreadyHot: true,
      }),
    ).toBe(true)
  })
})
