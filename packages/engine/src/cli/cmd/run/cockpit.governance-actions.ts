// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { actionRequiresPermission, canTransitionMutation, mutationHasApplyEvidence } from "@/kernel"
import type { ArcanaCockpitProjection } from "./cockpit.projection-store"

export type CockpitGovernanceActionID =
  | "permission.allow"
  | "permission.deny"
  | "mutation.allow"
  | "mutation.deny"
  | "mutation.open_diff"
  | "rollback.stage"
  | "verifier.rerun"
  | "limitation.accept"
  | "runproof.export"
  | "blocked.explain"

export type CockpitGovernanceStep = 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50

export type CockpitGovernanceAction = {
  readonly id: CockpitGovernanceActionID
  readonly step: CockpitGovernanceStep
  readonly panel: string
  readonly label: string
  readonly target_id?: string
  readonly enabled: boolean
  readonly reason: string
}

function governanceAction(input: CockpitGovernanceAction): CockpitGovernanceAction {
  return input
}

export function permissionGovernanceActions(projection: ArcanaCockpitProjection): readonly CockpitGovernanceAction[] {
  const action = projection.actions.find(actionRequiresPermission)
  return [
    governanceAction({
      id: "permission.allow",
      step: 43,
      panel: "risk-cockpit",
      label: "Allow permission",
      target_id: action?.id,
      enabled: Boolean(action),
      reason: action ? `Action ${action.id} requires permission evidence.` : "No action currently requires permission evidence.",
    }),
    governanceAction({
      id: "permission.deny",
      step: 43,
      panel: "risk-cockpit",
      label: "Deny permission",
      target_id: action?.id,
      enabled: Boolean(action),
      reason: action ? `Action ${action.id} can be denied before execution.` : "No permission decision is pending.",
    }),
  ]
}

export function mutationGovernanceActions(projection: ArcanaCockpitProjection): readonly CockpitGovernanceAction[] {
  const mutation = projection.mutations.find((item) => item.state === "proposed" || item.state === "approved" || item.state === "applied")
  const canAllow = mutation ? canTransitionMutation(mutation.state, mutation.state === "proposed" ? "approved" : "applied").allowed : false
  const canDeny = mutation ? canTransitionMutation(mutation.state, "rejected").allowed : false
  return [
    governanceAction({
      id: "mutation.allow",
      step: 44,
      panel: "diffgate-queue",
      label: "Allow mutation",
      target_id: mutation?.id,
      enabled: Boolean(mutation && canAllow && (mutation.state !== "approved" || mutationHasApplyEvidence(mutation))),
      reason: mutation ? `Mutation ${mutation.id} is ${mutation.state}.` : "No mutation is awaiting a governance decision.",
    }),
    governanceAction({
      id: "mutation.deny",
      step: 44,
      panel: "diffgate-queue",
      label: "Deny mutation",
      target_id: mutation?.id,
      enabled: Boolean(mutation && canDeny),
      reason: mutation ? `Mutation ${mutation.id} can be rejected from ${mutation.state}.` : "No mutation can be rejected.",
    }),
  ]
}

export function mutationDiffAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const mutation = projection.mutations.find((item) => item.files.length > 0)
  return governanceAction({
    id: "mutation.open_diff",
    step: 45,
    panel: "mutation-detail-drawer",
    label: "Open mutation diff",
    target_id: mutation?.id,
    enabled: Boolean(mutation),
    reason: mutation ? `Mutation ${mutation.id} has ${mutation.files.length} file changes.` : "No mutation diff is available.",
  })
}

export function rollbackStageAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const mutation = projection.mutations.find((item) => item.state === "applied" || item.state === "verified")
  return governanceAction({
    id: "rollback.stage",
    step: 46,
    panel: "mutation-detail-drawer",
    label: "Stage rollback",
    target_id: mutation?.id,
    enabled: Boolean(mutation && mutation.controls.requires_checkpoint && mutation.evidence.checkpoint_id),
    reason: mutation ? `Mutation ${mutation.id} rollback depends on checkpoint evidence.` : "No applied or verified mutation is available for rollback.",
  })
}

export function verifierRerunAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const verifier = projection.verifier
  return governanceAction({
    id: "verifier.rerun",
    step: 47,
    panel: "verifier-board",
    label: "Rerun verifier",
    target_id: verifier?.run.id,
    enabled: Boolean(verifier && verifier.run.verdict !== "running"),
    reason: verifier ? `Verifier ${verifier.run.id} is ${verifier.run.verdict}.` : "No verifier record is available.",
  })
}

export function limitationAcceptAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const limitation = projection.verifier?.limitations[projection.focus.index] ?? projection.verifier?.limitations[0]
  return governanceAction({
    id: "limitation.accept",
    step: 48,
    panel: "verifier-board",
    label: "Accept limitation with proof note",
    target_id: limitation?.check,
    enabled: Boolean(limitation && limitation.severity !== "blocking"),
    reason: limitation ? `Verifier limitation ${limitation.check} is ${limitation.severity}.` : "No verifier limitation is available.",
  })
}

export function runProofExportAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const proof = projection.proof
  return governanceAction({
    id: "runproof.export",
    step: 49,
    panel: "proof-ledger",
    label: "Export RunProof receipt",
    target_id: proof?.run_id,
    enabled: Boolean(proof && proof.events.length > 0),
    reason: proof ? `RunProof has ${proof.events.length} events and ${proof.gaps.length} gaps.` : "No RunProof projection is available.",
  })
}

export function cockpitBlockedAction(projection: ArcanaCockpitProjection): CockpitGovernanceAction {
  const verifierBlocked = projection.verifier?.completion_gate_passed === false
  const proofBlocked = projection.proof ? projection.proof.gaps.length > 0 : true
  const enabled = verifierBlocked || proofBlocked
  return governanceAction({
    id: "blocked.explain",
    step: 50,
    panel: "mission-header",
    label: "Explain blocked state",
    target_id: projection.run_id,
    enabled,
    reason: enabled
      ? `Completion is blocked by ${verifierBlocked ? "verifier" : "proof"} state.`
      : "Verifier and proof state do not currently block completion.",
  })
}

export function cockpitGovernanceActions(projection: ArcanaCockpitProjection): readonly CockpitGovernanceAction[] {
  return [
    ...permissionGovernanceActions(projection),
    ...mutationGovernanceActions(projection),
    mutationDiffAction(projection),
    rollbackStageAction(projection),
    verifierRerunAction(projection),
    limitationAcceptAction(projection),
    runProofExportAction(projection),
    cockpitBlockedAction(projection),
  ]
}

export function cockpitGovernanceCoversSteps43To50(actions: readonly CockpitGovernanceAction[]): boolean {
  const steps = new Set(actions.map((action) => action.step))
  return [43, 44, 45, 46, 47, 48, 49, 50].every((step) => steps.has(step as CockpitGovernanceStep))
}
