// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export const ARCANA_OWNED_CONCEPTS = [
  "runtime_identity",
  "action_envelope",
  "security_classification",
  "policy_result",
  "permission_decision",
  "file_change_lifecycle",
  "candidate_selection",
  "completion_gate",
  "proof_projection",
  "visible_runtime_state",
  "compatibility_decay",
] as const

export type ArcanaOwnedConcept = (typeof ARCANA_OWNED_CONCEPTS)[number]

export type ArcanaCanonicalOwner = {
  readonly concept: ArcanaOwnedConcept
  readonly owner: string
  readonly reason: string
}

export function canonicalOwners(): ArcanaCanonicalOwner[] {
  return [
    { concept: "runtime_identity", owner: "kernel", reason: "runtime identity must be declared once at process boundary" },
    { concept: "action_envelope", owner: "kernel/action", reason: "every execution unit must share one envelope shape" },
    { concept: "security_classification", owner: "kernel/security-context", reason: "risk and controls must be derived before permission, mutation, and verification" },
    { concept: "policy_result", owner: "kernel/action + permission bridge", reason: "policy must be attached to action and enforced by permission boundary" },
    { concept: "permission_decision", owner: "permission service", reason: "human and saved approvals remain one service responsibility" },
    { concept: "file_change_lifecycle", owner: "kernel/mutation", reason: "file changes must move through one mutation authority" },
    { concept: "candidate_selection", owner: "kernel/candidate", reason: "candidate ranking must be separate from model confidence" },
    { concept: "completion_gate", owner: "kernel/verifier", reason: "done must be certified by verifier evidence, not agent self-claim" },
    { concept: "proof_projection", owner: "kernel/runproof-projection", reason: "proof must be projected from runtime records" },
    { concept: "visible_runtime_state", owner: "kernel/tui-projection", reason: "TUI must observe kernel state instead of inventing state" },
    { concept: "compatibility_decay", owner: "kernel/compat + kernel/compat-metrics", reason: "legacy surfaces need measured removal signals" },
  ]
}

export function ownerForConcept(concept: ArcanaOwnedConcept): ArcanaCanonicalOwner {
  const owner = canonicalOwners().find((entry) => entry.concept === concept)
  if (!owner) throw new Error(`No canonical owner registered for ${concept}`)
  return owner
}

export function allConceptsHaveOwners(): boolean {
  const owners = new Set(canonicalOwners().map((entry) => entry.concept))
  return ARCANA_OWNED_CONCEPTS.every((concept) => owners.has(concept))
}
