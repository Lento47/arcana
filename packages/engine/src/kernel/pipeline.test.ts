import { describe, expect, test } from "bun:test"
import {
  createPipelinePlan,
  defaultBudgetForPipeline,
  pipelineHasRequiredAuthorities,
  pipelineRequiresVerifier,
  requiredStagesForPipeline,
} from "./pipeline"

describe("Arcana pipeline plan contract", () => {
  test("fix pipeline encodes reproduce, candidate, diff gate, verifier, and proof stages", () => {
    const plan = createPipelinePlan({ pipeline: "fix", objective: "fix flaky auth refresh", risk: "medium" })
    const stages = plan.stages.map((stage) => stage.kind)

    expect(stages).toContain("reproduce")
    expect(stages).toContain("candidate_generation")
    expect(stages).toContain("candidate_scoring")
    expect(stages).toContain("diff_gate")
    expect(stages).toContain("verifier")
    expect(stages).toContain("proof_export")
    expect(pipelineHasRequiredAuthorities(plan)).toBe(true)
    expect(pipelineRequiresVerifier(plan)).toBe(true)
  })

  test("security pipeline requires threat model and human review budget", () => {
    const plan = createPipelinePlan({ pipeline: "security", objective: "harden token refresh", risk: "high" })
    const stages = plan.stages.map((stage) => stage.kind)

    expect(stages).toContain("threat_model")
    expect(stages).toContain("security_scan")
    expect(plan.budget.human_review_required).toBe(true)
    expect(plan.acceptance_criteria.map((criterion) => criterion.id)).toContain("risk-reduced")
  })

  test("forge pipeline allocates more candidates than a normal fix pipeline", () => {
    const forgeBudget = defaultBudgetForPipeline("forge", "medium")
    const fixBudget = defaultBudgetForPipeline("fix", "medium")

    expect(forgeBudget.max_candidates).toBeGreaterThan(fixBudget.max_candidates)
    expect(forgeBudget.max_wall_clock_minutes).toBeGreaterThan(fixBudget.max_wall_clock_minutes)
  })

  test("low-risk feature still carries verifier stage but can use light verifier budget", () => {
    const plan = createPipelinePlan({ pipeline: "feature", objective: "add theme option", risk: "low" })

    expect(plan.budget.verifier_required).toBe(false)
    expect(pipelineRequiresVerifier(plan)).toBe(true)
    expect(plan.stop_conditions).toContain("verifier-failed")
  })

  test("migration pipeline encodes compatibility and shim decay", () => {
    const plan = createPipelinePlan({ pipeline: "migration", objective: "move tools to kernel action envelope", risk: "high" })

    expect(requiredStagesForPipeline("migration").map((stage) => stage.kind)).toContain("architecture_map")
    expect(plan.acceptance_criteria.map((criterion) => criterion.id)).toContain("replay-safe")
    expect(plan.acceptance_criteria.map((criterion) => criterion.id)).toContain("shim-decay-visible")
    expect(plan.budget.verifier_required).toBe(true)
  })
})
