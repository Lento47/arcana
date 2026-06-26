import { describe, expect, test } from "bun:test"
import { evaluateTokenEfficiency, shouldStopCandidateSearch } from "./token-efficiency"

describe("token efficiency", () => {
  test("scores cache-aware token use", () => {
    const result = evaluateTokenEfficiency({
      estimated_tokens: 1000,
      actual_tokens: 1040,
      cached_read_tokens: 700,
      cached_write_tokens: 100,
      uncached_input_tokens: 200,
      output_tokens: 40,
      latency_ms: 520,
      accepted_outcome: true,
    })

    expect(result.cache_hit_ratio).toBe(0.7)
    expect(result.estimate_delta_tokens).toBe(40)
    expect(result.score).toBeGreaterThan(75)
    expect(result.notes).toEqual([])
  })

  test("flags drift and wasted token burn", () => {
    const result = evaluateTokenEfficiency({
      estimated_tokens: 1000,
      actual_tokens: 1500,
      output_tokens: 900,
      reasoning_tokens: 600,
      accepted_outcome: false,
    })

    expect(result.notes).toContain("estimate_actual_drift")
    expect(result.notes).toContain("high_reasoning_pressure")
    expect(result.notes).toContain("high_visible_output_pressure")
    expect(result.notes).toContain("tokens_spent_without_accepted_outcome")
  })
})

describe("candidate search stopping", () => {
  test("stops on decisive winner", () => {
    const decision = shouldStopCandidateSearch({
      seen: [
        { quality: 0.96, confidence: 0.94, token_burn: 1000 },
        { quality: 0.76, confidence: 0.7, token_burn: 900 },
      ],
      max_candidates: 8,
      remaining_budget_tokens: 10_000,
      min_quality_lead: 0.15,
      min_confidence: 0.9,
      marginal_gain_floor: 0.02,
    })

    expect(decision).toEqual({ stop: true, reason: "decisive_winner" })
  })

  test("stops when budget cannot afford median candidate", () => {
    const decision = shouldStopCandidateSearch({
      seen: [
        { quality: 0.5, confidence: 0.4, token_burn: 900 },
        { quality: 0.55, confidence: 0.5, token_burn: 1100 },
      ],
      max_candidates: 8,
      remaining_budget_tokens: 500,
      min_quality_lead: 0.3,
      min_confidence: 0.95,
      marginal_gain_floor: 0.01,
    })

    expect(decision.reason).toBe("budget_tight")
  })
})
