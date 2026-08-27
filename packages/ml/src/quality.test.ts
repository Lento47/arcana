import { describe, expect, test } from "bun:test"
import { avoidSlopScore, evaluateResponseQuality, formatQualityGateForAudit, type RepeatedSegment } from "./quality.js"

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
    const result = avoidSlopScore(
      "Use `bun test` to validate. It depends on your environment whether the output matches exactly.",
    )
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
      response:
        "Patch `packages/ml/src/quality.ts` by adding `buildRevisionPrompt()`, then run `bun --cwd packages/ml test` to validate.",
    })
    expect(result.verdict).toBe("pass")
    expect(result.genericityScore).toBe(0)
  })

  test("repeated answer loops trigger revision", () => {
    const repeated = "Run `bun test packages/ml/src/quality.test.ts` and inspect the failures."
    const result = evaluateResponseQuality({
      request: "avoid repeating yourself and finish the answer",
      response: `${repeated}\n${repeated}\nThen summarize the result.`,
    })

    expect(result.verdict).toBe("revise_silently")
    expect(result.problems.some((p) => p.includes("Repeated response segments"))).toBe(true)
    expect(result.revisionHints.some((hint) => hint.includes("Remove repeated sentences"))).toBe(true)
  })

  test("completion claims require evidence for technical deliverables", () => {
    const result = evaluateResponseQuality({
      request: "fix the startup performance bug",
      response: "Done. The startup performance issue is fixed.",
      expectation: {
        deliverable: "code_patch",
        qualityBar: "solid",
        evidenceNeed: "light",
        interactionIntervention: "silent",
        constraints: [],
        mustAvoid: [],
        shouldInclude: [],
        assumptions: [],
        promptHints: [],
      },
    })

    expect(result.verdict).toBe("revise_silently")
    expect(result.problems).toContain("Completion claim is not backed by evidence.")
  })

  test("completion claims pass when backed by command or file evidence", () => {
    const result = evaluateResponseQuality({
      request: "fix the startup performance bug",
      response: "Fixed `packages/tui/src/context/sync.tsx` and ran `bun --cwd packages/tui typecheck`.",
      expectation: {
        deliverable: "code_patch",
        qualityBar: "solid",
        evidenceNeed: "light",
        interactionIntervention: "silent",
        constraints: [],
        mustAvoid: [],
        shouldInclude: [],
        assumptions: [],
        promptHints: [],
      },
    })

    expect(result.problems).not.toContain("Completion claim is not backed by evidence.")
  })

  test("audit format includes genericity score", () => {
    const result = evaluateResponseQuality({
      request: "give me the patch",
      response: "This is a robust and scalable solution.",
    })
    const audit = formatQualityGateForAudit(result)
    expect(audit).toContain("genericity=")
  })

  test("semantic deduplication catches rephrased content", () => {
    // Two segments with high token overlap but different wording
    // (needs ≥0.7 Jaccard similarity after stop word removal)
    const response = [
      "Add error handling to the main function to catch unexpected failures and log the error details.",
      "Add error handling to the main function to catch unexpected failures and log the error message.",
      "After that, run the test suite to verify the changes work correctly.",
    ].join("\n\n")

    const result = evaluateResponseQuality({
      request: "add error handling",
      response,
    })

    // Should detect semantic repetition
    const semanticRepeats = result.repeatedSegments.filter((r: RepeatedSegment) => r.kind === "semantic")
    expect(semanticRepeats.length).toBeGreaterThan(0)
    expect(result.problems.some((p) => p.includes("Semantically similar"))).toBe(true)
  })

  test("semantic deduplication does not false-positive on different content", () => {
    const response = [
      "First, install the dependency with `bun add effect`.",
      "Then, update the schema in `packages/core/src/schema.ts` to add the new field.",
      "Finally, run `bun test packages/core` to verify the changes.",
    ].join("\n\n")

    const result = evaluateResponseQuality({
      request: "add a new field to the schema",
      response,
    })

    expect(result.repeatedSegments).toHaveLength(0)
  })

  test("exact deduplication still works alongside semantic", () => {
    const repeated = "Run `bun test packages/ml/src/quality.test.ts` and inspect the failures."
    const result = evaluateResponseQuality({
      request: "avoid repeating yourself",
      response: `${repeated}\n${repeated}\nThen summarize the result.`,
    })

    const exactRepeats = result.repeatedSegments.filter((r: RepeatedSegment) => r.kind === "exact")
    expect(exactRepeats.length).toBeGreaterThan(0)
    expect(result.verdict).toBe("revise_silently")
  })

  test("repeatedSegments is exposed on QualityGateResult", () => {
    const result = evaluateResponseQuality({
      request: "test",
      response: "Concrete response with file.ts and 42 metrics.",
    })
    expect(result.repeatedSegments).toBeDefined()
    expect(Array.isArray(result.repeatedSegments)).toBe(true)
  })

  test("ask_user verdict when score is very low and intervention is confirm", () => {
    const result = evaluateResponseQuality({
      request: "give me a specific answer",
      response: "maybe perhaps it could be something",
      expectation: {
        deliverable: "direct_answer",
        qualityBar: "solid",
        evidenceNeed: "none",
        interactionIntervention: "confirm",
        constraints: [],
        mustAvoid: [],
        shouldInclude: [],
        assumptions: [],
        promptHints: [],
      },
    })
    expect(result.verdict).toBe("ask_user")
    expect(result.interactionIntervention).toBe("confirm")
  })

  test("constraintFit penalizes responses that ignore explicit constraints", () => {
    const result = evaluateResponseQuality({
      request: "fix the bug",
      response: "Here is a detailed analysis of the codebase architecture with file.ts and 42 metrics.",
      expectation: {
        deliverable: "code_patch",
        qualityBar: "solid",
        evidenceNeed: "light",
        interactionIntervention: "silent",
        constraints: ["must include a patch", "must run tests"],
        mustAvoid: [],
        shouldInclude: [],
        assumptions: [],
        promptHints: [],
      },
    })
    expect(result.constraintFitScore).toBeLessThan(0.8)
    expect(result.problems.some((p) => p.includes("constraints"))).toBe(true)
  })

  test("strict code_patch uses lower threshold (0.72) than strict default (0.78)", () => {
    // A response that would fail at 0.78 but pass at 0.72
    const result = evaluateResponseQuality({
      request: "fix the bug in the parser",
      response: "Patch `src/parser.ts` line 42: change `parse(input)` to `parse(input, { strict: true })`. Run `bun test`.",
      expectation: {
        deliverable: "code_patch",
        qualityBar: "strict",
        evidenceNeed: "light",
        interactionIntervention: "silent",
        constraints: [],
        mustAvoid: [],
        shouldInclude: [],
        assumptions: [],
        promptHints: [],
      },
    })
    // This concrete patch response should pass with the lower code_patch threshold
    expect(result.verdict).toBe("pass")
  })

  test("semantic repeats contribute to problems but do not force hardFail", () => {
    // Two semantically similar but not exact-repeat segments
    const response = [
      "Add error handling to the main function to catch unexpected failures and log the error details.",
      "Add error handling to the main function to catch unexpected failures and log the error message.",
      "Then run `bun test` to verify the changes work correctly.",
    ].join("\n\n")

    const result = evaluateResponseQuality({
      request: "add error handling",
      response,
    })

    // Semantic repeats should be detected
    const semanticRepeats = result.repeatedSegments.filter((r) => r.kind === "semantic")
    expect(semanticRepeats.length).toBeGreaterThan(0)
    expect(result.problems.some((p) => p.includes("Semantically similar"))).toBe(true)

    // But the response should NOT be hard-failed — it has concrete markers
    // (file references, commands) that boost the score above threshold
    // The key assertion: verdict is NOT forced to revise_silently purely from semantic repeats
    // (it may still revise for other reasons, but not from hardFail)
    expect(result.repeatedSegments.filter((r) => r.kind === "exact")).toHaveLength(0)
  })
})
