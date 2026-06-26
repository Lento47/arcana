// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Agent contract — loaded from .arcana/contracts/ or session metadata.
 * Contracts are the binding agreement between user intent and kernel
 * execution. They define what must be true before a run is "done."
 */
export type AgentContract = {
  readonly id: string
  readonly name: string
  readonly objective: string
  readonly constraints: readonly string[]
  readonly evidence_required: readonly string[]
  readonly rollback_plan?: string
  readonly verification_gates: readonly string[]
  readonly source: ".arcana/contracts" | "session" | "cli" | "inline"
}

export function createAgentContract(input: {
  name: string
  objective: string
  constraints?: string[]
  evidence_required?: string[]
  rollback_plan?: string
  verification_gates?: string[]
  source?: AgentContract["source"]
}): AgentContract {
  return {
    id: `contract_${crypto.randomUUID()}`,
    name: input.name,
    objective: input.objective,
    constraints: input.constraints ?? [],
    evidence_required: input.evidence_required ?? [],
    rollback_plan: input.rollback_plan,
    verification_gates: input.verification_gates ?? [],
    source: input.source ?? "inline",
  }
}

export function contractSummary(contract: AgentContract): string {
  const parts: string[] = []
  if (contract.constraints.length) parts.push(`${contract.constraints.length} constraints`)
  if (contract.evidence_required.length) parts.push(`${contract.evidence_required.length} gates`)
  if (contract.rollback_plan) parts.push("rollback ready")
  return parts.length ? parts.join(" · ") : "no active contract"
}
