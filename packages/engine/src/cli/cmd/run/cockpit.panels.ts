// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { selectCandidate, weightedCandidateScore, type ArcanaCandidateSet } from "@/kernel"
import type { ArcanaCockpitProjection } from "./cockpit.projection-store"

export type CockpitPanelID =
  | "mission-header"
  | "pipeline-board"
  | "action-timeline"
  | "action-detail-drawer"
  | "risk-cockpit"
  | "permission-risk-card"
  | "diffgate-queue"
  | "mutation-detail-drawer"
  | "candidate-board"
  | "candidate-compare-drawer"
  | "verifier-board"
  | "proof-ledger"

export type CockpitPanelView = {
  readonly id: CockpitPanelID
  readonly step: 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40
  readonly title: string
  readonly summary: string
  readonly metric: string
  readonly rows: readonly string[]
  readonly empty: boolean
}

function row(value: string | undefined): string[] {
  return value ? [value] : []
}

export function missionHeaderView(projection: ArcanaCockpitProjection): CockpitPanelView {
  return {
    id: "mission-header",
    step: 29,
    title: "Mission Header",
    summary: projection.objective || "No active objective",
    metric: projection.kernel ? `${projection.kernel.risk_band} · ${Math.round((projection.proof?.completeness ?? projection.kernel?.proof_completeness ?? 0) * 100)}% proof` : "no kernel projection",
    rows: [
      `run ${projection.run_id}`,
      `focus ${projection.focus.panel}:${projection.focus.index}`,
      ...row(projection.pipeline ? `pipeline ${projection.pipeline.pipeline}` : undefined),
    ],
    empty: !projection.objective,
  }
}

export function pipelineBoardView(projection: ArcanaCockpitProjection): CockpitPanelView {
  const stages = projection.pipeline?.stages ?? []
  return {
    id: "pipeline-board",
    step: 30,
    title: "Pipeline Board",
    summary: projection.pipeline?.objective ?? "No pipeline plan",
    metric: projection.pipeline ? `${projection.pipeline.pipeline} · ${stages.length} stages` : "no plan",
    rows: stages.map((stage) => `${stage.id} · ${stage.authority}${stage.required ? " · required" : ""}`),
    empty: !projection.pipeline,
  }
}

export function actionTimelineView(projection: ArcanaCockpitProjection): CockpitPanelView {
  return {
    id: "action-timeline",
    step: 31,
    title: "Action Timeline",
    summary: "EngineAction stream",
    metric: `${projection.actions.length} actions`,
    rows: projection.actions.map((action) => `${action.id} · ${action.kind} · ${action.name} · ${action.risk}`),
    empty: projection.actions.length === 0,
  }
}

export function actionDetailDrawerView(projection: ArcanaCockpitProjection, index = projection.focus.index): CockpitPanelView {
  const action = projection.actions[index] ?? projection.actions[0]
  return {
    id: "action-detail-drawer",
    step: 32,
    title: "Action Detail Drawer",
    summary: action ? action.input_summary : "No selected action",
    metric: action ? `${action.kind} · ${action.policy}` : "no action",
    rows: action
      ? [
          `id ${action.id}`,
          `source ${action.source}`,
          `risk ${action.risk}`,
          `reversible ${String(action.reversible)}`,
          `controls ${action.required_controls.join(",") || "none"}`,
        ]
      : [],
    empty: !action,
  }
}

export function riskCockpitView(projection: ArcanaCockpitProjection): CockpitPanelView {
  const actions = projection.actions.filter((action) => action.risk !== "low")
  return {
    id: "risk-cockpit",
    step: 33,
    title: "Risk Cockpit",
    summary: projection.kernel ? `risk band ${projection.kernel.risk_band}` : "No kernel risk band",
    metric: `${actions.length} elevated actions`,
    rows: actions.map((action) => `${action.id} · ${action.risk} · ${action.required_controls.join(",") || "no controls"}`),
    empty: actions.length === 0,
  }
}

export function permissionRiskCardView(projection: ArcanaCockpitProjection): CockpitPanelView {
  const requiringPermission = projection.actions.filter((action) => action.evidence.some((item) => item.kind === "permission_record"))
  return {
    id: "permission-risk-card",
    step: 34,
    title: "Permission Risk Card",
    summary: "Actions requiring permission evidence",
    metric: `${requiringPermission.length} permission records`,
    rows: requiringPermission.map((action) => `${action.id} · ${action.policy} · ${action.risk}`),
    empty: requiringPermission.length === 0,
  }
}

export function diffGateQueueView(projection: ArcanaCockpitProjection): CockpitPanelView {
  return {
    id: "diffgate-queue",
    step: 35,
    title: "DiffGate Queue",
    summary: "MutationAuthority lifecycle",
    metric: `${projection.mutations.length} mutations`,
    rows: projection.mutations.map((mutation) => `${mutation.id} · ${mutation.state} · ${mutation.risk} · ${mutation.files.length} files`),
    empty: projection.mutations.length === 0,
  }
}

export function mutationDetailDrawerView(projection: ArcanaCockpitProjection, index = projection.focus.index): CockpitPanelView {
  const mutation = projection.mutations[index] ?? projection.mutations[0]
  return {
    id: "mutation-detail-drawer",
    step: 36,
    title: "Mutation Detail Drawer",
    summary: mutation ? mutation.intent : "No selected mutation",
    metric: mutation ? `${mutation.state} · ${mutation.risk}` : "no mutation",
    rows: mutation
      ? [
          `id ${mutation.id}`,
          `source ${mutation.source}`,
          `controls approval=${mutation.controls.requires_approval} checkpoint=${mutation.controls.requires_checkpoint} verifier=${mutation.controls.requires_verifier}`,
          ...mutation.files.map((file) => `${file.operation} ${file.path}`),
        ]
      : [],
    empty: !mutation,
  }
}

export function candidateBoardView(projection: ArcanaCockpitProjection, candidateSets: readonly ArcanaCandidateSet[] = []): CockpitPanelView {
  const total = candidateSets.reduce((count, set) => count + set.candidates.length, 0)
  return {
    id: "candidate-board",
    step: 37,
    title: "Candidate Board",
    summary: "CandidateSet scoring",
    metric: `${total} candidates`,
    rows: candidateSets.flatMap((set) => set.candidates.map((candidate) => `${set.id}/${candidate.id} · ${candidate.status} · ${weightedCandidateScore(candidate.score)}`)),
    empty: candidateSets.length === 0,
  }
}

export function candidateCompareDrawerView(projection: ArcanaCockpitProjection, candidateSets: readonly ArcanaCandidateSet[] = []): CockpitPanelView {
  const selected = candidateSets.map((set) => selectCandidate(set)).find((selection) => selection.selected)
  return {
    id: "candidate-compare-drawer",
    step: 38,
    title: "Candidate Compare Drawer",
    summary: selected?.reason ?? "No selected candidate",
    metric: selected?.selected ? `${selected.selected.id} selected` : "no selection",
    rows: selected?.selected
      ? [
          `risk ${selected.selected.risk}`,
          `security ${selected.selected.score.security}`,
          `correctness ${selected.selected.score.correctness}`,
          `evidence ${selected.selected.evidence.length}`,
        ]
      : [],
    empty: !selected?.selected,
  }
}

export function verifierBoardView(projection: ArcanaCockpitProjection): CockpitPanelView {
  const verifier = projection.verifier
  return {
    id: "verifier-board",
    step: 39,
    title: "Verifier Board",
    summary: verifier ? `completion gate ${String(verifier.completion_gate_passed)}` : "No verifier record",
    metric: verifier ? `${verifier.run.verdict} · ${verifier.run.evidence.length} evidence` : "no verdict",
    rows: verifier ? [...verifier.run.failures, ...verifier.limitations.map((item) => `${item.severity} · ${item.check}`)] : [],
    empty: !verifier,
  }
}

export function proofLedgerView(projection: ArcanaCockpitProjection): CockpitPanelView {
  const proof = projection.proof
  return {
    id: "proof-ledger",
    step: 40,
    title: "Proof Ledger",
    summary: proof ? proof.objective : "No RunProof projection",
    metric: proof ? `${Math.round(proof.completeness * 100)}% · ${proof.gaps.length} gaps` : "no proof",
    rows: proof ? [...proof.gaps, ...proof.events.map((event) => `${event.kind} · ${event.summary}`)] : [],
    empty: !proof,
  }
}

export function cockpitPanelViews(projection: ArcanaCockpitProjection, candidateSets: readonly ArcanaCandidateSet[] = []): readonly CockpitPanelView[] {
  return [
    missionHeaderView(projection),
    pipelineBoardView(projection),
    actionTimelineView(projection),
    actionDetailDrawerView(projection),
    riskCockpitView(projection),
    permissionRiskCardView(projection),
    diffGateQueueView(projection),
    mutationDetailDrawerView(projection),
    candidateBoardView(projection, candidateSets),
    candidateCompareDrawerView(projection, candidateSets),
    verifierBoardView(projection),
    proofLedgerView(projection),
  ]
}

export function cockpitPanelsCoverSteps29To40(views: readonly CockpitPanelView[]): boolean {
  const steps = new Set(views.map((view) => view.step))
  return [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40].every((step) => steps.has(step as CockpitPanelView["step"]))
}
