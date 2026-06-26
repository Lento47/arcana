import { describe, expect, test } from "bun:test"
import {
  candidatePassesSecurityFloor,
  candidateSetHasDiversity,
  createCandidateSet,
  selectCandidate,
  weightedCandidateScore,
  type ArcanaCandidate,
} from "./candidate"

function candidate(overrides: Partial<ArcanaCandidate> = {}): ArcanaCandidate {
  return {
    id: "A",
    status: "proposed",
    summary: "small scoped fix",
    risk: "medium",
    evidence: ["test_output"],
    score: {
      correctness: 0.8,
      security: 0.8,
      maintainability: 0.8,
      performance: 0.8,
      verification_depth: 0.8,
      rollback_safety: 0.8,
      minimality: 0.8,
    },
    ...overrides,
  }
}

describe("Arcana candidate set scoring", () => {
  test("weightedCandidateScore clamps and weights quality dimensions", () => {
    const score = weightedCandidateScore({
      correctness: 1,
      security: 1,
      maintainability: 1,
      performance: 1,
      verification_depth: 1,
      rollback_safety: 1,
      minimality: 1,
    })

    expect(score).toBe(1)
  })

  test("critical candidate must meet a stricter security floor", () => {
    expect(candidatePassesSecurityFloor(candidate({ score: { ...candidate().score, security: 0.94 } }), "critical")).toBe(false)
    expect(candidatePassesSecurityFloor(candidate({ score: { ...candidate().score, security: 0.95 } }), "critical")).toBe(true)
  })

  test("security-first policy selects the safer candidate before weighted winner", () => {
    const set = createCandidateSet({
      objective: "harden auth refresh",
      risk: "high",
      candidates: [
        candidate({ id: "fast", summary: "fast patch", score: { ...candidate().score, security: 0.9, correctness: 1 } }),
        candidate({ id: "safe", summary: "safer patch", score: { ...candidate().score, security: 0.96, correctness: 0.8 } }),
      ],
      selection_policy: "security_first",
    })

    const selection = selectCandidate(set)
    expect(selection.selected?.id).toBe("safe")
    expect(selection.reason).toContain("security_first")
  })

  test("highest weighted score policy selects by overall engineering quality", () => {
    const set = createCandidateSet({
      objective: "fix typo",
      risk: "low",
      candidates: [
        candidate({ id: "A", summary: "minimal patch", score: { ...candidate().score, correctness: 0.7, security: 0.7 } }),
        candidate({ id: "B", summary: "better patch", score: { ...candidate().score, correctness: 0.95, security: 0.7 } }),
      ],
      selection_policy: "highest_weighted_score",
    })

    expect(selectCandidate(set).selected?.id).toBe("B")
  })

  test("candidate without evidence cannot be selected", () => {
    const set = createCandidateSet({
      objective: "patch dependency",
      risk: "medium",
      candidates: [candidate({ evidence: [], score: { ...candidate().score, verification_depth: 0 } })],
    })

    const selection = selectCandidate(set)
    expect(selection.selected).toBeUndefined()
    expect(selection.reason).toContain("no candidate")
  })

  test("candidate diversity catches one-path generation", () => {
    expect(candidateSetHasDiversity(createCandidateSet({ objective: "x", risk: "low", candidates: [candidate({ id: "A" }), candidate({ id: "B" })] }))).toBe(false)
    expect(candidateSetHasDiversity(createCandidateSet({ objective: "x", risk: "low", candidates: [candidate({ id: "A" }), candidate({ id: "B", summary: "different approach" })] }))).toBe(true)
  })
})
