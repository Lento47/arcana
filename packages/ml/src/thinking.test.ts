import { describe, expect, test } from "bun:test"
import { formatThinkingPlanForAudit, planThinking, type ThinkingPlanInput } from "./thinking.js"

function plan(input: Partial<ThinkingPlanInput> & { request: string }) {
  return planThinking({
    deliverable: "direct_answer",
    qualityBar: "solid",
    evidenceNeed: "none",
    ...input,
  } as ThinkingPlanInput)
}

describe("thinking planner", () => {
  test("fast shallow request gets quick style", () => {
    const result = plan({ request: "quick rough draft of launch copy", qualityBar: "fast" })
    expect(result.budget.style).toBe("quick")
    expect(result.budget.maxSilentRevisions).toBe(0)
    expect(result.steps.steps.length).toBeGreaterThan(0)
  })

  test("strict evidence-backed request gets deep or staged style", () => {
    const result = plan({
      request: "thoroughly review this repo for the highest impact bugs and verify each fix",
      qualityBar: "strict",
      evidenceNeed: "required",
      availableTools: ["read", "grep", "run_test", "edit"],
    })
    expect(["deep", "staged"]).toContain(result.budget.style)
    expect(result.budget.maxToolRounds).toBeGreaterThanOrEqual(8)
    expect(result.steps.requiresValidation).toBe(true)
    expect(result.steps.requiresMultipleTools).toBe(true)
  })

  test("code patch asks for implementation and validation steps", () => {
    const result = plan({
      request: "fix the failing bun test in packages/ml",
      deliverable: "code_patch",
      qualityBar: "strict",
      availableTools: ["read", "edit", "run_test"],
    })
    expect(result.steps.steps.some((s) => s.toLowerCase().includes("test"))).toBe(true)
    expect(result.steps.requiresValidation).toBe(true)
  })

  test("audit line includes style and budget", () => {
    const result = plan({
      request: "compare the tradeoffs of two auth approaches",
      qualityBar: "strict",
      evidenceNeed: "light",
    })
    const audit = formatThinkingPlanForAudit(result)
    expect(audit).toContain(`style=${result.budget.style}`)
    expect(audit).toContain("reasoning_tokens=")
  })

  test("prompt addendum carries structured metadata", () => {
    const result = plan({
      request: "deep dive into the runtime architecture",
      deliverable: "execution_plan",
      qualityBar: "strict",
      evidenceNeed: "required",
    })
    expect(result.promptAddendum).toContain("<arcana-thinking-plan")
    expect(result.promptAddendum).toContain("reasoning_budget=")
    expect(result.promptAddendum).toContain("steps=")
    expect(result.promptAddendum).toContain("validation=required")
  })
})
