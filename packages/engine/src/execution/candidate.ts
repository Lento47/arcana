// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { EngineActionID, ProposedFileDiff, RiskAssessment } from "./action"
import { PipelineID } from "./pipeline"

export const CandidateID = Schema.String.pipe(Schema.brand("CandidateID"))
export type CandidateID = typeof CandidateID.Type

export const CandidateScore = Schema.Struct({
  correctness: Schema.Number,
  security: Schema.Number,
  maintainability: Schema.Number,
  performance: Schema.Number,
  minimality: Schema.Number,
  verification_depth: Schema.Number,
  rollback_safety: Schema.Number,
  confidence: Schema.Number,
})
export type CandidateScore = typeof CandidateScore.Type

export const CandidatePatchStatus = Schema.Literal("proposed", "evaluating", "selected", "rejected", "applied")
export type CandidatePatchStatus = typeof CandidatePatchStatus.Type

export const CandidatePatch = Schema.Struct({
  id: CandidateID,
  pipeline_id: PipelineID,
  action_ids: Schema.Array(EngineActionID),
  status: CandidatePatchStatus,
  summary: Schema.String,
  rationale: Schema.String,
  diffs: Schema.Array(ProposedFileDiff),
  risk: RiskAssessment,
  score: Schema.optional(CandidateScore),
  rejection_reason: Schema.optional(Schema.String),
})
export type CandidatePatch = typeof CandidatePatch.Type

export const CandidateSet = Schema.Struct({
  id: Schema.String,
  pipeline_id: PipelineID,
  objective: Schema.String,
  candidates: Schema.Array(CandidatePatch),
  selected_candidate_id: Schema.optional(CandidateID),
})
export type CandidateSet = typeof CandidateSet.Type

export function newCandidateID(): CandidateID {
  return CandidateID.make(`cand_${crypto.randomUUID()}`)
}

export function engineeringQualityScore(score: CandidateScore): number {
  const weighted =
    score.correctness * 0.3 +
    score.security * 0.25 +
    score.maintainability * 0.2 +
    score.minimality * 0.1 +
    score.verification_depth * 0.1 +
    score.rollback_safety * 0.05

  if (!Number.isFinite(weighted)) return 0
  return Math.max(0, Math.min(100, Math.round(weighted)))
}

export function createCandidatePatch(input: Omit<CandidatePatch, "id" | "status"> & {
  id?: CandidateID
  status?: CandidatePatchStatus
}): CandidatePatch {
  return {
    id: input.id ?? newCandidateID(),
    pipeline_id: input.pipeline_id,
    action_ids: input.action_ids,
    status: input.status ?? "proposed",
    summary: input.summary,
    rationale: input.rationale,
    diffs: input.diffs,
    risk: input.risk,
    score: input.score,
    rejection_reason: input.rejection_reason,
  }
}

export function selectBestCandidate(candidates: CandidatePatch[]): CandidatePatch | undefined {
  return candidates
    .filter((candidate) => candidate.score)
    .sort((a, b) => engineeringQualityScore(b.score!) - engineeringQualityScore(a.score!))[0]
}
