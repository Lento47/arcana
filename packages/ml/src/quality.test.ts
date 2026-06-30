import { describe, expect, test } from "bun:test"
import { avoidSlopScore, evaluateResponseQuality, formatQualityGateForAudit } from "./quality.js"

describe("avoidSlopScore", () => {
  test("flags business filler and vague verbs", () => {
    const result = avoidSlopScore("We will leverage best practices to build a robust, scalable solution.")
    expect(result.value).toBeGreaterThan(0.3)
    expect(result.hits).toContain("best practices")
    expect(result.hits).toContain("scalable solution")
    expect(result.hits).toContain("leverage")
    expect(result.revisionHints.length).toBeGreaterThan(0)
  })

  test("ignores concrete technical responses", () => {
    const result = avoidSlopScore("Patch `src/index.ts` and run `bun test`. Expected 3 tests to pass.")
    expect(result.value).toBe(0)
    expect(result.hits).toHaveLength(0)
    expect(result.revisionHints).toHaveLength(0)
  })

  test("scores increase with multiple slop categories", () => {
    const heavy = avoidSlopScore(
      "Of course, our cutting-edge, world-class platform will dramatically streamline your workflow and unlock the power of synergy. It depends on your needs, but we suggest you explore this innovative direction.",
    )
    expect(heavy.value).toBeGreaterThan(0.6)
    expect(Object.keys(heavy.categoryHits).length).toBeGreaterThanOrEqual(3)
  })

  test("single mild hedge does not max out the score", () => {
    const result = avoidSlopScore("Use `bun test` to validate. It depends on your environment whether the output matches exactly.")
    expect(result.value).toBeLessThan(0.2)
  })
})

describe("evaluateResponseQuality with avoidSlopScore", () => {
  test("generic marketing language triggers revision", () => {
    const result = evaluateResponseQuality({
      request: "avoid generic output and give specific implementation details",
      response: "Leverage our cutting-edge synergy to unlock the power of a scalable, robust solution.",
    })
    expect(result.verdict).toBe("revise_silently")
    expect(result.genericityScore).toBeGreaterThan(0.4)
    expect(result.problems.some((p) => p.includes("Generic phrases"))).toBe(true)
  })

  test("specific patch passes with new detector", () => {
    const result = evaluateResponseQuality({
      request: "avoid generic output and give the exact patch",
      response: "Patch `packages/ml/src/quality.ts` by adding `buildRevisionPrompt()`, then run `bun --cwd packages/ml test` to validate.",
    })
    expect(result.verdict).toBe("pass")
    expect(result.genericityScore).toBe(0)
  })

  test("audit format includes genericity score", () => {
    const result = evaluateResponseQuality({
      request: "give me the patch",
      response: "This is a robust and scalable solution.",
    })
    const audit = formatQualityGateForAudit(result)
    expect(audit).toContain("genericity=")
  })
})
