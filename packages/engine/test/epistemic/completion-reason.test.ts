import { describe, it, expect } from "bun:test"
import {
  deriveCompletionReason,
  isSuccessfulCompletion,
  isInterruption,
  type SessionCompletionReason,
} from "@arcana/engine/session/epistemic/completion-reason"

describe("deriveCompletionReason", () => {
  it("returns normal for undefined metadata", () => {
    expect(deriveCompletionReason(undefined)).toBe("normal")
  })

  it("returns normal for empty metadata", () => {
    expect(deriveCompletionReason({})).toBe("normal")
  })

  it("returns step_limit for __arcana_max_steps_hit", () => {
    expect(deriveCompletionReason({ __arcana_max_steps_hit: true })).toBe("step_limit")
  })

  it("returns cancelled for __arcana_cancelled", () => {
    expect(deriveCompletionReason({ __arcana_cancelled: true })).toBe("cancelled")
  })

  it("returns budget_exhausted for __arcana_budget_exhausted", () => {
    expect(deriveCompletionReason({ __arcana_budget_exhausted: true })).toBe("budget_exhausted")
  })

  it("returns decision_required for __arcana_decision_required", () => {
    expect(deriveCompletionReason({ __arcana_decision_required: true })).toBe("decision_required")
  })

  it("returns graceful_failure for __arcana_graceful_failure", () => {
    expect(deriveCompletionReason({ __arcana_graceful_failure: true })).toBe("graceful_failure")
  })

  it("priority: cancelled > budget_exhausted > step_limit", () => {
    expect(deriveCompletionReason({
      __arcana_cancelled: true,
      __arcana_budget_exhausted: true,
      __arcana_max_steps_hit: true,
    })).toBe("cancelled")
  })

  it("priority: budget_exhausted > step_limit", () => {
    expect(deriveCompletionReason({
      __arcana_budget_exhausted: true,
      __arcana_max_steps_hit: true,
    })).toBe("budget_exhausted")
  })

  it("ignores non-boolean metadata flags", () => {
    expect(deriveCompletionReason({
      __arcana_cancelled: "yes",
      __arcana_max_steps_hit: 1,
    })).toBe("normal")
  })
})

describe("isSuccessfulCompletion", () => {
  it("normal is successful", () => {
    expect(isSuccessfulCompletion("normal")).toBe(true)
  })
  it("graceful_failure is successful", () => {
    expect(isSuccessfulCompletion("graceful_failure")).toBe(true)
  })
  it("step_limit is not successful", () => {
    expect(isSuccessfulCompletion("step_limit")).toBe(false)
  })
  it("cancelled is not successful", () => {
    expect(isSuccessfulCompletion("cancelled")).toBe(false)
  })
  it("budget_exhausted is not successful", () => {
    expect(isSuccessfulCompletion("budget_exhausted")).toBe(false)
  })
  it("decision_required is not successful", () => {
    expect(isSuccessfulCompletion("decision_required")).toBe(false)
  })
})

describe("isInterruption", () => {
  it("cancelled is interruption", () => {
    expect(isInterruption("cancelled")).toBe(true)
  })
  it("budget_exhausted is interruption", () => {
    expect(isInterruption("budget_exhausted")).toBe(true)
  })
  it("step_limit is interruption", () => {
    expect(isInterruption("step_limit")).toBe(true)
  })
  it("normal is not interruption", () => {
    expect(isInterruption("normal")).toBe(false)
  })
  it("graceful_failure is not interruption", () => {
    expect(isInterruption("graceful_failure")).toBe(false)
  })
  it("decision_required is not interruption", () => {
    expect(isInterruption("decision_required")).toBe(false)
  })
})
