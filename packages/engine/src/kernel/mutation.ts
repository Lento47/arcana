// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"

export const ArcanaMutationID = Schema.String.pipe(Schema.brand("ArcanaMutationID"))
export type ArcanaMutationID = typeof ArcanaMutationID.Type

export const ArcanaMutationState = Schema.Literals([
  "proposed",
  "approved",
  "rejected",
  "applied",
  "verified",
  "reverted",
  "failed",
])
export type ArcanaMutationState = typeof ArcanaMutationState.Type

export const ArcanaMutationSource = Schema.Literals(["agent", "subagent", "user", "system", "migration"])
export type ArcanaMutationSource = typeof ArcanaMutationSource.Type

export const ArcanaMutationRisk = Schema.Literals(["low", "medium", "high", "critical"])
export type ArcanaMutationRisk = typeof ArcanaMutationRisk.Type

export const ArcanaMutationFileChange = Schema.Struct({
  path: Schema.String,
  operation: Schema.Literals(["create", "modify", "delete", "rename"]),
  previous_path: Schema.optional(Schema.String),
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
  patch_sha256: Schema.optional(Schema.String),
})
export type ArcanaMutationFileChange = typeof ArcanaMutationFileChange.Type

export const ArcanaMutationControls = Schema.Struct({
  requires_approval: Schema.Boolean,
  requires_checkpoint: Schema.Boolean,
  requires_verifier: Schema.Boolean,
  requires_human_review: Schema.Boolean,
})
export type ArcanaMutationControls = typeof ArcanaMutationControls.Type

export const ArcanaMutationEvidence = Schema.Struct({
  action_id: Schema.optional(Schema.String),
  runproof_id: Schema.optional(Schema.String),
  checkpoint_id: Schema.optional(Schema.String),
  verifier_id: Schema.optional(Schema.String),
})
export type ArcanaMutationEvidence = typeof ArcanaMutationEvidence.Type

export const ArcanaMutationProposal = Schema.Struct({
  id: ArcanaMutationID,
  source: ArcanaMutationSource,
  state: ArcanaMutationState,
  intent: Schema.String,
  files: Schema.Array(ArcanaMutationFileChange),
  risk: ArcanaMutationRisk,
  controls: ArcanaMutationControls,
  evidence: ArcanaMutationEvidence,
})
export type ArcanaMutationProposal = typeof ArcanaMutationProposal.Type

export function newMutationID(): ArcanaMutationID {
  return ArcanaMutationID.make(`mut_${crypto.randomUUID()}`)
}

export function defaultMutationControls(risk: ArcanaMutationRisk): ArcanaMutationControls {
  if (risk === "critical") {
    return { requires_approval: true, requires_checkpoint: true, requires_verifier: true, requires_human_review: true }
  }
  if (risk === "high") {
    return { requires_approval: true, requires_checkpoint: true, requires_verifier: true, requires_human_review: false }
  }
  if (risk === "medium") {
    return { requires_approval: true, requires_checkpoint: true, requires_verifier: false, requires_human_review: false }
  }
  return { requires_approval: false, requires_checkpoint: true, requires_verifier: false, requires_human_review: false }
}

export function createMutationProposal(input: Omit<ArcanaMutationProposal, "id" | "state" | "controls" | "evidence"> & {
  id?: ArcanaMutationID
  state?: ArcanaMutationState
  controls?: ArcanaMutationControls
  evidence?: ArcanaMutationEvidence
}): ArcanaMutationProposal {
  return {
    id: input.id ?? newMutationID(),
    source: input.source,
    state: input.state ?? "proposed",
    intent: input.intent,
    files: input.files,
    risk: input.risk,
    controls: input.controls ?? defaultMutationControls(input.risk),
    evidence: input.evidence ?? {},
  }
}
