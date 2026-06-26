// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaEngineAction } from "./action"
import type { ArcanaMutationProposal } from "./mutation"
import type { ArcanaPipelinePlan } from "./pipeline"
import type { ArcanaVerifierRecord } from "./verifier"

export type ArcanaTuiRiskBand = "calm" | "attention" | "danger" | "blocked"

export type ArcanaKernelProjection = {
  readonly run_id: string
  readonly objective: string
  readonly pipeline?: ArcanaPipelinePlan
  readonly current_stage?: string
  readonly risk_band: ArcanaTuiRiskBand
  readonly actions: readonly ArcanaEngineAction[]
  readonly mutations: readonly ArcanaMutationProposal[]
  readonly verifier?: ArcanaVerifierRecord
  readonly proof_completeness: number
  readonly rollback_ready: boolean
  readonly provider_route?: string
  readonly compatibility_active: number
}

export function riskBandForProjection(input: {
  readonly actions: readonly ArcanaEngineAction[]
  readonly mutations: readonly ArcanaMutationProposal[]
  readonly verifier?: ArcanaVerifierRecord
}): ArcanaTuiRiskBand {
  if (input.verifier?.completion_gate_passed === false) return "blocked"
  if (input.actions.some((action) => action.risk === "critical") || input.mutations.some((mutation) => mutation.risk === "critical")) return "blocked"
  if (input.actions.some((action) => action.risk === "high") || input.mutations.some((mutation) => mutation.risk === "high")) return "danger"
  if (input.actions.some((action) => action.risk === "medium") || input.mutations.some((mutation) => mutation.risk === "medium")) return "attention"
  return "calm"
}

export function projectionRollbackReady(mutations: readonly ArcanaMutationProposal[]): boolean {
  if (mutations.length === 0) return true
  return mutations.every((mutation) => Boolean(mutation.evidence.checkpoint_id) || mutation.state === "reverted" || mutation.state === "rejected")
}

export function createKernelProjection(input: Omit<ArcanaKernelProjection, "risk_band" | "rollback_ready">): ArcanaKernelProjection {
  return {
    ...input,
    risk_band: riskBandForProjection({ actions: input.actions, mutations: input.mutations, verifier: input.verifier }),
    rollback_ready: projectionRollbackReady(input.mutations),
  }
}

export function projectionIsProofBacked(projection: ArcanaKernelProjection): boolean {
  return projection.proof_completeness > 0 && projection.actions.every((action) => action.evidence.some((evidence) => evidence.kind === "runproof_event"))
}
