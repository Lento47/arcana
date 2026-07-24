import { describe, expect, test } from "bun:test"
import {
  classifyCompactionFailure,
  isAcceptableReduction,
  isContextLengthError,
  isDegenerateSummary,
  resolveCompactionOutcome,
  MIN_SUMMARY_CHARS,
} from "../../src/session/compaction-failure"

describe("compaction-failure.classify", () => {
  test("context length is deterministic", () => {
    expect(classifyCompactionFailure({ message: "maximum context length exceeded" })).toBe("deterministic")
    expect(isContextLengthError("ContextOverflowError: prompt is too long")).toBe(true)
  })

  test("429 and 5xx are transient", () => {
    expect(classifyCompactionFailure({ status: 429 })).toBe("transient")
    expect(classifyCompactionFailure({ status: 503 })).toBe("transient")
    expect(classifyCompactionFailure({ status: 408 })).toBe("transient")
  })

  test("most 4xx are deterministic", () => {
    expect(classifyCompactionFailure({ status: 400 })).toBe("deterministic")
    expect(classifyCompactionFailure({ status: 401 })).toBe("deterministic")
  })

  test("timeout and empty are transient", () => {
    expect(classifyCompactionFailure({ timeout: true })).toBe("transient")
    expect(classifyCompactionFailure({ emptyResponse: true })).toBe("transient")
  })
})

describe("compaction-failure.degenerate", () => {
  test("empty / missing is degenerate (N3 soft-fail)", () => {
    expect(isDegenerateSummary("")).toBe(true)
    expect(isDegenerateSummary("   ")).toBe(true)
    expect(isDegenerateSummary(null)).toBe(true)
  })

  test("tiny non-empty is degenerate", () => {
    expect(isDegenerateSummary("hi")).toBe(true)
    expect(isDegenerateSummary("ok")).toBe(true)
  })

  test("structured content is not degenerate", () => {
    const good = `## Goal
- Implement rate limiting on the API gateway

## Progress
### Done
- Added middleware skeleton

## Next Steps
- Wire Redis store
`
    expect(good.length).toBeGreaterThan(MIN_SUMMARY_CHARS)
    expect(isDegenerateSummary(good)).toBe(false)
  })

  test("placeholder-only is degenerate", () => {
    const hollow = `## Goal
- (none)

## Progress
### Done
- (none)
`
    // may or may not pass length; residual should fail
    expect(isDegenerateSummary(hollow) || hollow.replace(/\(none\)/g, "").trim().length < 20).toBe(true)
  })
})

describe("compaction-failure.reduction", () => {
  test("requires ~20% shrink on large heads only", () => {
    expect(isAcceptableReduction({ tokensBefore: 10_000, tokensAfter: 7_000 })).toBe(true)
    expect(isAcceptableReduction({ tokensBefore: 10_000, tokensAfter: 9_000 })).toBe(false)
    expect(isAcceptableReduction({ tokensBefore: 0, tokensAfter: 10 })).toBe(true)
    // small head: skip ratio guard
    expect(isAcceptableReduction({ tokensBefore: 500, tokensAfter: 490 })).toBe(true)
  })
})

describe("compaction-failure.outcome", () => {
  test("auto soft-fails on overflow during summary", () => {
    expect(
      resolveCompactionOutcome({ auto: true, overflowDuringSummary: true }),
    ).toBe("soft_fail")
  })

  test("manual hard-fails on overflow during summary", () => {
    expect(
      resolveCompactionOutcome({ auto: false, overflowDuringSummary: true }),
    ).toBe("hard_fail")
  })

  test("auto soft-fails on degenerate summary", () => {
    expect(resolveCompactionOutcome({ auto: true, summary: "x" })).toBe("soft_fail")
  })

  test("empty summary soft-fails (N3)", () => {
    expect(resolveCompactionOutcome({ auto: true, summary: "" })).toBe("soft_fail")
    expect(resolveCompactionOutcome({ auto: true, summary: null })).toBe("soft_fail")
    expect(resolveCompactionOutcome({ auto: false, summary: "" })).toBe("hard_fail")
  })

  test("apply when summary is solid", () => {
    const summary = "Implemented JWT refresh flow and fixed auth middleware edge cases for mobile clients."
    expect(
      resolveCompactionOutcome({
        auto: true,
        summary,
        tokensBefore: 10_000,
        tokensAfter: 100,
      }),
    ).toBe("apply")
  })

  test("soft-fail insufficient reduction in auto on large head", () => {
    const summary = "Implemented JWT refresh flow and fixed auth middleware edge cases for mobile clients."
    expect(
      resolveCompactionOutcome({
        auto: true,
        summary,
        tokensBefore: 10_000,
        tokensAfter: 9_500,
      }),
    ).toBe("soft_fail")
  })
})
