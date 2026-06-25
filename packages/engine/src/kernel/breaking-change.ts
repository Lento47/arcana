// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { ArcanaAuthority } from "./kernel"

export const ArcanaIdentityAxis = Schema.Literals([
  "runtime_identity",
  "authority_boundary",
  "execution_contract",
  "mutation_authority",
  "verification_authority",
  "proof_projection",
  "ui_truth_model",
  "compatibility_boundary",
  "pipeline_model",
])
export type ArcanaIdentityAxis = typeof ArcanaIdentityAxis.Type

export const ArcanaBreakEnforcement = Schema.Literals(["contract", "runtime", "test", "migration", "documentation"])
export type ArcanaBreakEnforcement = typeof ArcanaBreakEnforcement.Type

export const ArcanaBreakStatus = Schema.Literals(["planned", "started", "enforced", "blocked"])
export type ArcanaBreakStatus = typeof ArcanaBreakStatus.Type

export const ArcanaNativeBreakingChange = Schema.Struct({
  id: Schema.String,
  axis: ArcanaIdentityAxis,
  upstream_assumption: Schema.String,
  arcana_replacement: Schema.String,
  authority: Schema.optional(ArcanaAuthority),
  enforcement: ArcanaBreakEnforcement,
  status: ArcanaBreakStatus,
})
export type ArcanaNativeBreakingChange = typeof ArcanaNativeBreakingChange.Type

export function nativeBreakingChanges(): ArcanaNativeBreakingChange[] {
  return [
    {
      id: "arcana-runtime-identity",
      axis: "runtime_identity",
      upstream_assumption: "The process identifies through legacy fork environment and naming conventions.",
      arcana_replacement: "Arcana engine exports ARCANA_ENGINE, ARCANA_RUNTIME, ARCANA_PID, and an ArcanaKernelContract by default.",
      authority: "intent",
      enforcement: "runtime",
      status: "started",
    },
    {
      id: "kernel-owns-execution-authority",
      axis: "authority_boundary",
      upstream_assumption: "The chat loop and command handler implicitly own execution authority.",
      arcana_replacement: "Arcana routes execution authority through explicit kernel authorities: intent, plan, risk, policy, permission, mutation, verification, rollback, and proof.",
      authority: "policy",
      enforcement: "contract",
      status: "started",
    },
    {
      id: "tool-call-becomes-engine-action",
      axis: "execution_contract",
      upstream_assumption: "A model tool call can execute as a direct side effect of generation.",
      arcana_replacement: "Arcana represents tool, shell, MCP, file, network, model, and session operations as EngineAction envelopes before execution.",
      authority: "risk",
      enforcement: "contract",
      status: "started",
    },
    {
      id: "mutation-through-diff-gate",
      axis: "mutation_authority",
      upstream_assumption: "Edit/write/apply-patch tools own file mutation directly.",
      arcana_replacement: "Arcana makes file mutation a diff-gate concern: proposed, approved, applied, rejected, and rolled back.",
      authority: "mutation",
      enforcement: "migration",
      status: "planned",
    },
    {
      id: "verifier-owns-completion",
      axis: "verification_authority",
      upstream_assumption: "The same agent that made a change can declare the task complete.",
      arcana_replacement: "Arcana requires verifier evidence, explicit limitations, or human override before trusted completion.",
      authority: "verification",
      enforcement: "migration",
      status: "planned",
    },
    {
      id: "runproof-is-event-projection",
      axis: "proof_projection",
      upstream_assumption: "Proof or summary can be assembled after the fact from prose and tool outputs.",
      arcana_replacement: "Arcana projects RunProof from kernel and engine events so evidence is generated as execution happens.",
      authority: "proof",
      enforcement: "migration",
      status: "started",
    },
    {
      id: "tui-is-cockpit-not-authority",
      axis: "ui_truth_model",
      upstream_assumption: "UI state and conversation rendering define what happened.",
      arcana_replacement: "Arcana TUI renders kernel, policy, mutation, verification, rollback, and proof state as a cockpit over engine truth.",
      authority: "proof",
      enforcement: "contract",
      status: "planned",
    },
    {
      id: "compatibility-is-explicit",
      axis: "compatibility_boundary",
      upstream_assumption: "Legacy fork compatibility is ambient and always-on.",
      arcana_replacement: "Arcana compatibility shims are explicit, opt-in, and removable; native runtime identity is default.",
      authority: "policy",
      enforcement: "runtime",
      status: "started",
    },
    {
      id: "pipeline-over-one-shot-agent-loop",
      axis: "pipeline_model",
      upstream_assumption: "A single agent loop can handle fix, feature, security, refactor, research, and algorithmic work the same way.",
      arcana_replacement: "Arcana uses task-specific pipelines with acceptance criteria, budgets, candidate search, risk controls, and verifier gates.",
      authority: "plan",
      enforcement: "contract",
      status: "planned",
    },
  ]
}

export function breakingChangesByAxis(axis: ArcanaIdentityAxis): ArcanaNativeBreakingChange[] {
  return nativeBreakingChanges().filter((change) => change.axis === axis)
}

export function breakingChangesByStatus(status: ArcanaBreakStatus): ArcanaNativeBreakingChange[] {
  return nativeBreakingChanges().filter((change) => change.status === status)
}

export function requiredBreakingChangeAxes(): Set<ArcanaIdentityAxis> {
  return new Set(nativeBreakingChanges().map((change) => change.axis))
}

export function hasDocsOnlyIdentityBreaks(): boolean {
  return nativeBreakingChanges().some((change) => change.enforcement === "documentation")
}
