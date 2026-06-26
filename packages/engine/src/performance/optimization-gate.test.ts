import { describe, expect, test } from "bun:test"
import { evaluateOptimizationGate } from "./optimization-gate"

describe("optimization gate", () => {
  const passingBudget = {
    area: "tui_render" as const,
    sample_count: 3,
    p50_ms: 4,
    p95_ms: 6,
    max_ms: 6,
    avg_ms: 5,
    passed: true,
    violations: [],
  }

  test("passes when performance and authorities are preserved", () => {
    const result = evaluateOptimizationGate({
      budget_results: [passingBudget],
      governance_preserved: true,
      security_preserved: true,
      traceability_preserved: true,
      runproof_preserved: true,
      rollout_flagged: false,
      behavior_changed: false,
    })

    expect(result.passed).toBe(true)
    expect(result.blockers).toEqual([])
  })

  test("blocks behavior changes without rollout flags", () => {
    const result = evaluateOptimizationGate({
      budget_results: [passingBudget],
      governance_preserved: true,
      security_preserved: true,
      traceability_preserved: true,
      runproof_preserved: true,
      rollout_flagged: false,
      behavior_changed: true,
    })

    expect(result.passed).toBe(false)
    expect(result.blockers).toContain("behavior_change_without_rollout_flag")
  })

  test("blocks governance bypass even if performance budgets pass", () => {
    const result = evaluateOptimizationGate({
      budget_results: [passingBudget],
      governance_preserved: false,
      security_preserved: true,
      traceability_preserved: true,
      runproof_preserved: true,
      rollout_flagged: true,
      behavior_changed: true,
    })

    expect(result.blockers).toContain("governance_not_preserved")
  })
})
