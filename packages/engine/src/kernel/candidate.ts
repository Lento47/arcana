// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaSecurityRisk } from "./security-context"

export type ArcanaCandidateStatus = "proposed" | "selected" | "rejected" | "superseded"

export type ArcanaCandidateScore = {
  readonly correctness: number
  readonly security: number
  readonly maintainability: number
  readonly performance: number
  readonly verification_depth: number
  readonly rollback_safety: number
  readonly minimality: number
}

export type ArcanaCandidate = {
  readonly id: string
  readonly status: ArcanaCandidateStatus
  readonly summary: string
  readonly mutation_id?: string
  readonly risk: ArcanaSecurityRisk
  readonly score: ArcanaCandidateScore
  readonly evidence: readonly string[]
  readonly rejection_reason?: string
}

export type ArcanaCandidateSet = {
  readonly id: string
  readonly objective: string
  readonly risk: ArcanaSecurityRisk
  readonly candidates: readonly ArcanaCandidate[]
  readonly selection_policy: "highest_weighted_score" | "security_first" | "human_selected"
  readonly selected_candidate_id?: string
}

export type ArcanaCandidateSelection = {
  readonly selected?: ArcanaCandidate
  readonly rejected: readonly ArcanaCandidate[]
  readonly reason: string
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function weightedCandidateScore(score: ArcanaCandidateScore): number {
  return Number((
    clampScore(score.correctness) * 0.30 +
    clampScore(score.security) * 0.25 +
    clampScore(score.maintainability) * 0.15 +
    clampScore(score.performance) * 0.10 +
    clampScore(score.verification_depth) * 0.10 +
    clampScore(score.rollback_safety) * 0.05 +
    clampScore(score.minimality) * 0.05
  ).toFixed(4))
}

export function candidatePassesSecurityFloor(candidate: ArcanaCandidate, setRisk: ArcanaSecurityRisk): boolean {
  const floor = setRisk === "critical" ? 0.95 : setRisk === "high" ? 0.90 : setRisk === "medium" ? 0.75 : 0.60
  return clampScore(candidate.score.security) >= floor
}

export function candidateHasMinimumEvidence(candidate: ArcanaCandidate): boolean {
  return candidate.evidence.length > 0 && candidate.score.verification_depth > 0
}

export function createCandidateSet(input: {
  readonly id?: string
  readonly objective: string
  readonly risk: ArcanaSecurityRisk
  readonly candidates: readonly ArcanaCandidate[]
  readonly selection_policy?: ArcanaCandidateSet["selection_policy"]
  readonly selected_candidate_id?: string
}): ArcanaCandidateSet {
  return {
    id: input.id ?? "cset_1",
    objective: input.objective,
    risk: input.risk,
    candidates: input.candidates,
    selection_policy: input.selection_policy ?? "security_first",
    selected_candidate_id: input.selected_candidate_id,
  }
}

function candidateIsSelectable(candidate: ArcanaCandidate, set: ArcanaCandidateSet): boolean {
  return candidate.status !== "rejected" && candidatePassesSecurityFloor(candidate, set.risk) && candidateHasMinimumEvidence(candidate)
}

export function selectCandidate(set: ArcanaCandidateSet): ArcanaCandidateSelection {
  if (set.selection_policy === "human_selected") {
    const selected = set.candidates.find((candidate) => candidate.id === set.selected_candidate_id)
    if (!selected) return { selected: undefined, rejected: set.candidates, reason: "human_selected policy requires selected_candidate_id" }
    if (!candidateIsSelectable(selected, set)) {
      return {
        selected: undefined,
        rejected: set.candidates,
        reason: `human-selected candidate ${selected.id} failed security or evidence floor`,
      }
    }
    return {
      selected,
      rejected: set.candidates.filter((candidate) => candidate.id !== selected.id),
      reason: `human-selected candidate ${selected.id} accepted after policy floor checks`,
    }
  }

  const selectable = set.candidates.filter((candidate) => candidateIsSelectable(candidate, set))
  if (selectable.length === 0) {
    return { selected: undefined, rejected: set.candidates, reason: "no candidate satisfied security and evidence floors" }
  }

  const ranked = [...selectable].sort((a, b) => {
    if (set.selection_policy === "security_first") {
      const securityDelta = b.score.security - a.score.security
      if (securityDelta !== 0) return securityDelta
    }
    return weightedCandidateScore(b.score) - weightedCandidateScore(a.score)
  })

  const selected = ranked[0]
  return {
    selected,
    rejected: set.candidates.filter((candidate) => candidate.id !== selected?.id),
    reason: selected ? `candidate ${selected.id} selected by ${set.selection_policy}` : "no candidate selected",
  }
}

export function candidateSetHasDiversity(set: ArcanaCandidateSet): boolean {
  const summaries = new Set(set.candidates.map((candidate) => candidate.summary.trim().toLowerCase()))
  return summaries.size > 1 || set.candidates.length <= 1
}
