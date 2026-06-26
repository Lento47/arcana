// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type {
  ArcanaCompatHealth,
  ArcanaEngineAction,
  ArcanaKernelProjection,
  ArcanaMutationProposal,
  ArcanaPipelinePlan,
  ArcanaRollout,
  ArcanaRunProofProjection,
  ArcanaTokenBudgetAdmission,
  ArcanaTokenReconciliation,
  ArcanaVerifierRecord,
} from "@/kernel"

export type ArcanaCockpitPanel =
  | "mission"
  | "actions"
  | "risk"
  | "diffgate"
  | "verify"
  | "proof"
  | "tokens"
  | "candidate"
  | "rollback"
  | "sovereignty"
  | "compat"
  | "layout"
  | "focus"
  | "help"

export type ArcanaCockpitFocus = {
  readonly panel: ArcanaCockpitPanel
  readonly index: number
}

export type ArcanaCockpitTokenState = {
  readonly admission?: ArcanaTokenBudgetAdmission
  readonly reconciliation?: ArcanaTokenReconciliation
  readonly pressure: "calm" | "attention" | "danger" | "blocked"
}

export type ArcanaCockpitProjection = {
  readonly run_id: string
  readonly objective: string
  readonly kernel?: ArcanaKernelProjection
  readonly pipeline?: ArcanaPipelinePlan
  readonly actions: readonly ArcanaEngineAction[]
  readonly mutations: readonly ArcanaMutationProposal[]
  readonly verifier?: ArcanaVerifierRecord
  readonly proof?: ArcanaRunProofProjection
  readonly tokens?: ArcanaCockpitTokenState
  readonly compat?: ArcanaCompatHealth
  readonly rollouts: readonly ArcanaRollout[]
  readonly focus: ArcanaCockpitFocus
  readonly updated_at: string
}

export type ArcanaCockpitProjectionEvent =
  | { type: "kernel"; projection: ArcanaKernelProjection }
  | { type: "pipeline"; plan: ArcanaPipelinePlan }
  | { type: "action"; action: ArcanaEngineAction }
  | { type: "mutation"; mutation: ArcanaMutationProposal }
  | { type: "verifier"; verifier: ArcanaVerifierRecord }
  | { type: "proof"; proof: ArcanaRunProofProjection }
  | { type: "token.admission"; admission: ArcanaTokenBudgetAdmission }
  | { type: "token.reconciliation"; reconciliation: ArcanaTokenReconciliation }
  | { type: "compat"; compat: ArcanaCompatHealth }
  | { type: "rollout"; rollout: ArcanaRollout }
  | { type: "focus"; focus: ArcanaCockpitFocus }

export function createEmptyCockpitProjection(input: {
  readonly run_id: string
  readonly objective?: string
  readonly now?: string
}): ArcanaCockpitProjection {
  return {
    run_id: input.run_id,
    objective: input.objective ?? "",
    actions: [],
    mutations: [],
    rollouts: [],
    focus: { panel: "mission", index: 0 },
    updated_at: input.now ?? new Date().toISOString(),
  }
}

function tokenPressure(input: {
  readonly admission?: ArcanaTokenBudgetAdmission
  readonly reconciliation?: ArcanaTokenReconciliation
}): ArcanaCockpitTokenState["pressure"] {
  if (input.admission?.decision === "stop" || input.reconciliation?.status === "missing_estimate") return "blocked"
  if (input.admission?.decision === "require_approval" || input.reconciliation?.status === "over_estimate") return "danger"
  if (input.admission && input.admission.decision !== "allow") return "attention"
  return "calm"
}

export function reduceCockpitProjection(
  projection: ArcanaCockpitProjection,
  event: ArcanaCockpitProjectionEvent,
  now = new Date().toISOString(),
): ArcanaCockpitProjection {
  if (event.type === "kernel") {
    return {
      ...projection,
      kernel: event.projection,
      objective: event.projection.objective || projection.objective,
      pipeline: event.projection.pipeline ?? projection.pipeline,
      actions: event.projection.actions,
      mutations: event.projection.mutations,
      verifier: event.projection.verifier ?? projection.verifier,
      compat: projection.compat
        ? { ...projection.compat, active_shims: event.projection.compatibility_active }
        : projection.compat,
      updated_at: now,
    }
  }

  if (event.type === "pipeline") return { ...projection, pipeline: event.plan, objective: event.plan.objective, updated_at: now }
  if (event.type === "action") return { ...projection, actions: [...projection.actions, event.action], updated_at: now }
  if (event.type === "mutation") return { ...projection, mutations: [...projection.mutations, event.mutation], updated_at: now }
  if (event.type === "verifier") return { ...projection, verifier: event.verifier, updated_at: now }
  if (event.type === "proof") return { ...projection, proof: event.proof, updated_at: now }
  if (event.type === "compat") return { ...projection, compat: event.compat, updated_at: now }
  if (event.type === "rollout") return { ...projection, rollouts: [...projection.rollouts.filter((item) => item.key !== event.rollout.key), event.rollout], updated_at: now }
  if (event.type === "focus") return { ...projection, focus: event.focus, updated_at: now }

  if (event.type === "token.admission") {
    const tokens = { admission: event.admission, reconciliation: projection.tokens?.reconciliation }
    return { ...projection, tokens: { ...tokens, pressure: tokenPressure(tokens) }, updated_at: now }
  }

  const tokens = { admission: projection.tokens?.admission, reconciliation: event.reconciliation }
  return { ...projection, tokens: { ...tokens, pressure: tokenPressure(tokens) }, updated_at: now }
}

export function createCockpitProjectionStore(initial: ArcanaCockpitProjection) {
  let current = initial
  return {
    snapshot(): ArcanaCockpitProjection {
      return current
    },
    dispatch(event: ArcanaCockpitProjectionEvent, now?: string): ArcanaCockpitProjection {
      current = reduceCockpitProjection(current, event, now)
      return current
    },
  }
}

export function cockpitProjectionSummary(projection: ArcanaCockpitProjection): string {
  const risk = projection.kernel?.risk_band ?? "unknown"
  const proof = projection.proof?.completeness ?? projection.kernel?.proof_completeness ?? 0
  const mutations = projection.mutations.length
  const actions = projection.actions.length
  const token = projection.tokens?.pressure ?? "calm"
  return `mission=${projection.objective || "unset"} risk=${risk} proof=${proof} actions=${actions} mutations=${mutations} tokens=${token}`
}
