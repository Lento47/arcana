import { describe, expect, test } from "bun:test"
import {
  DEFAULT_INTRA_HARD_BREACH_MIN_STEPS,
  DEFAULT_INTRA_MIN_COMPACTABLE_TOKENS,
  DEFAULT_INTRA_MIN_STEPS,
  intraEnabled,
  shouldIntraCompact,
} from "../../src/session/compaction-intra"

describe("compaction-intra.intraEnabled", () => {
  test("on by default when auto on", () => {
    expect(intraEnabled(undefined)).toBe(true)
    expect(intraEnabled({})).toBe(true)
    expect(intraEnabled({ auto: true })).toBe(true)
  })
  test("off when auto false or intra false", () => {
    expect(intraEnabled({ auto: false })).toBe(false)
    expect(intraEnabled({ intra: false })).toBe(false)
    expect(intraEnabled({ auto: true, intra: false })).toBe(false)
  })
})

describe("compaction-intra.shouldIntraCompact", () => {
  test("requires min steps", () => {
    expect(
      shouldIntraCompact({
        step: 2,
        count: 90_000,
        context: 100_000,
      }),
    ).toBe(false)
    expect(
      shouldIntraCompact({
        step: DEFAULT_INTRA_MIN_STEPS,
        count: 90_000,
        context: 100_000,
      }),
    ).toBe(true)
  })

  test("requires min compactable tokens", () => {
    expect(
      shouldIntraCompact({
        step: 5,
        count: DEFAULT_INTRA_MIN_COMPACTABLE_TOKENS - 1,
        context: 100_000,
        thresholdPercent: 1, // pass percent so min mass is the gate
      }),
    ).toBe(false)
  })

  test("requires threshold percent", () => {
    expect(
      shouldIntraCompact({
        step: 5,
        count: 80_000,
        context: 100_000,
        thresholdPercent: 85,
      }),
    ).toBe(false)
  })

  test("hysteresis blocks small growth after last compact", () => {
    expect(
      shouldIntraCompact({
        step: 5,
        count: 90_000,
        context: 100_000,
        lastCompactTokens: 88_000,
      }),
    ).toBe(false)
    expect(
      shouldIntraCompact({
        step: 5,
        count: 95_000,
        context: 100_000,
        lastCompactTokens: 85_000,
      }),
    ).toBe(true)
  })

  test("disabled flag", () => {
    expect(
      shouldIntraCompact({
        step: 10,
        count: 99_000,
        context: 100_000,
        enabled: false,
      }),
    ).toBe(false)
  })

  test("M2: alreadyHot allows below percent (hard ceiling path)", () => {
    expect(
      shouldIntraCompact({
        step: 5,
        count: 65_000,
        context: 100_000,
        thresholdPercent: 85,
      }),
    ).toBe(false)
    expect(
      shouldIntraCompact({
        step: 5,
        count: 65_000,
        context: 100_000,
        thresholdPercent: 85,
        alreadyHot: true,
      }),
    ).toBe(true)
  })

  test("M2: hardBreach lowers min steps to 2 but not below hard floor", () => {
    expect(
      shouldIntraCompact({
        step: 2,
        count: 90_000,
        context: 100_000,
        minSteps: 5,
      }),
    ).toBe(false)
    expect(
      shouldIntraCompact({
        step: 2,
        count: 90_000,
        context: 100_000,
        minSteps: 5,
        hardBreach: true,
      }),
    ).toBe(true)
    expect(
      shouldIntraCompact({
        step: 1,
        count: 90_000,
        context: 100_000,
        minSteps: 5,
        hardBreach: true,
      }),
    ).toBe(false)
    expect(DEFAULT_INTRA_HARD_BREACH_MIN_STEPS).toBe(2)
  })

  test("M1: hardBreach never skips hysteresis", () => {
    expect(
      shouldIntraCompact({
        step: 5,
        count: 90_000,
        context: 100_000,
        hardBreach: true,
        alreadyHot: true,
        lastCompactTokens: 88_000, // +2k < 5k
      }),
    ).toBe(false)
    expect(
      shouldIntraCompact({
        step: 2,
        count: 95_000,
        context: 100_000,
        hardBreach: true,
        alreadyHot: true,
        lastCompactTokens: 85_000, // +10k
      }),
    ).toBe(true)
  })
})
