import { describe, expect, test } from "bun:test"
import { hasDocsOnlyIdentityBreaks, nativeBreakingChanges, requiredBreakingChangeAxes } from "./breaking-change"

describe("Arcana native breaking change doctrine", () => {
  test("tracks architecture breaks beyond naming", () => {
    const changes = nativeBreakingChanges()
    const axes = requiredBreakingChangeAxes()

    expect(changes.length).toBeGreaterThanOrEqual(8)
    expect(axes.has("runtime_identity")).toBe(true)
    expect(axes.has("authority_boundary")).toBe(true)
    expect(axes.has("execution_contract")).toBe(true)
    expect(axes.has("mutation_authority")).toBe(true)
    expect(axes.has("verification_authority")).toBe(true)
    expect(axes.has("proof_projection")).toBe(true)
    expect(axes.has("ui_truth_model")).toBe(true)
    expect(axes.has("compatibility_boundary")).toBe(true)
    expect(axes.has("pipeline_model")).toBe(true)
  })

  test("does not accept documentation-only identity breaks", () => {
    expect(hasDocsOnlyIdentityBreaks()).toBe(false)
  })

  test("maps each break to implementation enforcement", () => {
    for (const change of nativeBreakingChanges()) {
      expect(change.enforcement).not.toBe("documentation")
      expect(change.arcana_replacement.toLowerCase()).toContain("arcana")
      expect(change.upstream_assumption.length).toBeGreaterThan(20)
      expect(change.arcana_replacement.length).toBeGreaterThan(20)
    }
  })
})
