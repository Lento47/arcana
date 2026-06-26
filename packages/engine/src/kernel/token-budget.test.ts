import { describe, expect, test } from "bun:test"
import { admitTokenEstimate, consumeTokenBudget, createTokenBudget, estimateCostMicros, remainingTokens } from "./token-budget"
import { zeroTokenTotals } from "./token-ledger"

describe("Arcana token budget", () => {
  test("admits estimates within token budget", () => {
    const budget = createTokenBudget({ id: "tbud_1", scope: "action", owner_id: "act_1", token_limit: 1000 })
    const estimated = { ...zeroTokenTotals(), input_uncached: 100, output_visible: 50 }

    const admission = admitTokenEstimate({ budget, estimated })

    expect(admission.decision).toBe("allow")
    expect(admission.remaining_tokens).toBe(850)
  })

  test("requires compaction when token budget would be exceeded", () => {
    const budget = createTokenBudget({ id: "tbud_1", scope: "action", owner_id: "act_1", token_limit: 100 })
    const estimated = { ...zeroTokenTotals(), input_uncached: 125 }

    expect(admitTokenEstimate({ budget, estimated }).decision).toBe("compact_context")
  })

  test("requires approval when cost budget would be exceeded", () => {
    const budget = createTokenBudget({ id: "tbud_1", scope: "pipeline", owner_id: "pipe_1", cost_limit_micros: 1000 })
    const estimated = { ...zeroTokenTotals(), input_uncached: 100 }

    expect(admitTokenEstimate({ budget, estimated, estimated_cost_micros: 1500 }).decision).toBe("require_approval")
  })

  test("reduces candidate count before fixed-N waste", () => {
    const budget = createTokenBudget({ id: "tbud_1", scope: "pipeline", owner_id: "pipe_1", max_candidates: 3 })

    expect(admitTokenEstimate({ budget, estimated: zeroTokenTotals(), candidate_count: 5 }).decision).toBe("reduce_candidates")
  })

  test("consumption is monotonic", () => {
    const budget = createTokenBudget({ id: "tbud_1", scope: "run", owner_id: "run_1", token_limit: 1000 })
    const next = consumeTokenBudget({ budget, actual_tokens: 200 })

    expect(remainingTokens(next)).toBeLessThan(remainingTokens(budget)!)
    expect(next.consumed_tokens).toBe(200)
  })

  test("cost estimates are derived from totals and unit cost", () => {
    expect(estimateCostMicros({ ...zeroTokenTotals(), input_uncached: 10, output_visible: 5 }, 2)).toBe(30)
  })
})
