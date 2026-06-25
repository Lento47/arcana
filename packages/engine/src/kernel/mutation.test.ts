import { describe, expect, test } from "bun:test"
import { canTransitionMutation, createMutationProposal, defaultMutationControls, mutationHasApplyEvidence } from "./mutation"

describe("Arcana mutation authority", () => {
  test("creates proposed mutation with risk-derived controls", () => {
    const mutation = createMutationProposal({
      source: "agent",
      intent: "Change runtime identity wiring",
      risk: "medium",
      files: [{ path: "packages/engine/src/index.ts", operation: "modify", additions: 4, deletions: 1 }],
    })

    expect(mutation.id.startsWith("mut_")).toBe(true)
    expect(mutation.state).toBe("proposed")
    expect(mutation.controls.requires_approval).toBe(true)
    expect(mutation.controls.requires_checkpoint).toBe(true)
    expect(mutation.controls.requires_verifier).toBe(false)
  })

  test("uses stricter controls for high and critical risk", () => {
    expect(defaultMutationControls("high")).toEqual({
      requires_approval: true,
      requires_checkpoint: true,
      requires_verifier: true,
      requires_human_review: false,
    })
    expect(defaultMutationControls("critical")).toEqual({
      requires_approval: true,
      requires_checkpoint: true,
      requires_verifier: true,
      requires_human_review: true,
    })
  })

  test("allows ordered mutation transitions", () => {
    expect(canTransitionMutation("proposed", "approved").allowed).toBe(true)
    expect(canTransitionMutation("approved", "applied").allowed).toBe(true)
    expect(canTransitionMutation("applied", "verified").allowed).toBe(true)
    expect(canTransitionMutation("verified", "reverted").allowed).toBe(true)
  })

  test("blocks unordered mutation transitions", () => {
    expect(canTransitionMutation("proposed", "applied").allowed).toBe(false)
    expect(canTransitionMutation("rejected", "applied").allowed).toBe(false)
    expect(canTransitionMutation("failed", "verified").allowed).toBe(false)
  })

  test("requires checkpoint evidence before an approved mutation can be applied", () => {
    const missingEvidence = createMutationProposal({
      source: "agent",
      state: "approved",
      intent: "Modify engine entrypoint",
      risk: "medium",
      files: [{ path: "packages/engine/src/index.ts", operation: "modify" }],
    })
    const withEvidence = createMutationProposal({
      source: "agent",
      state: "approved",
      intent: "Modify engine entrypoint",
      risk: "medium",
      files: [{ path: "packages/engine/src/index.ts", operation: "modify" }],
      evidence: { checkpoint_id: "chk_123" },
    })

    expect(mutationHasApplyEvidence(missingEvidence)).toBe(false)
    expect(mutationHasApplyEvidence(withEvidence)).toBe(true)
  })
})
