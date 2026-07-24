import { describe, expect, test } from "bun:test"
import {
  determineLevel,
  getPlan,
  isProactiveCompactBand,
  PROACTIVE_COMPACT_RATIO,
} from "../../src/session/compaction-strategy"

describe("compaction-strategy levels (aligned with 85% threshold)", () => {
  test("proactive ratio is 0.85", () => {
    expect(PROACTIVE_COMPACT_RATIO).toBe(0.85)
  })

  test("level bands", () => {
    const ctx = 100_000
    expect(determineLevel(50_000, ctx)).toBe(0)
    expect(determineLevel(70_000, ctx)).toBe(1)
    expect(determineLevel(84_999, ctx)).toBe(1)
    expect(determineLevel(85_000, ctx)).toBe(2)
    expect(determineLevel(94_000, ctx)).toBe(2)
    expect(determineLevel(95_000, ctx)).toBe(3)
    expect(determineLevel(99_000, ctx)).toBe(4)
  })

  test("isProactiveCompactBand matches level >= 2", () => {
    expect(isProactiveCompactBand(84_000, 100_000)).toBe(false)
    expect(isProactiveCompactBand(85_000, 100_000)).toBe(true)
    expect(isProactiveCompactBand(99_000, 100_000)).toBe(true)
  })

  test("level 2 plan still keeps user messages", () => {
    const plan = getPlan(2)
    expect(plan.keepUserMessages).toBe(true)
    expect(plan.summarizeToolOutputs).toBe(true)
  })
})
