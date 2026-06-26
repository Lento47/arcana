// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { actionRequiresMutationGate, type ArcanaEngineAction } from "./action"
import { createMutationProposal, type ArcanaMutationFileChange, type ArcanaMutationProposal } from "./mutation"

function fileChangesFromAction(action: ArcanaEngineAction): ArcanaMutationFileChange[] {
  const paths = action.security_context.assets.includes("source_code")
    ? action.security_context.reasons
        .filter((reason) => reason.includes(":"))
        .map((reason) => reason.split(":").slice(1).join(":").trim())
        .filter(Boolean)
    : []

  if (paths.length === 0) {
    return [{ path: action.cwd ?? "<unknown>", operation: "modify" }]
  }

  return paths.map((path) => ({ path, operation: "modify" as const }))
}

export function mutationProposalFromAction(action: ArcanaEngineAction): ArcanaMutationProposal | undefined {
  if (!actionRequiresMutationGate(action)) return undefined

  return createMutationProposal({
    source: action.source === "user" ? "user" : action.source === "system" ? "system" : "agent",
    intent: action.input_summary,
    risk: action.risk,
    files: fileChangesFromAction(action),
    evidence: {
      action_id: action.id,
      runproof_id: action.proof_event_id,
    },
  })
}

export function shadowMutationCoverage(actions: readonly ArcanaEngineAction[], proposals: readonly ArcanaMutationProposal[]): {
  readonly required: number
  readonly proposed: number
  readonly complete: boolean
} {
  const required = actions.filter(actionRequiresMutationGate)
  const proposed = new Set(proposals.map((proposal) => proposal.evidence.action_id).filter(Boolean))
  const covered = required.filter((action) => proposed.has(action.id))

  return {
    required: required.length,
    proposed: covered.length,
    complete: required.length === covered.length,
  }
}
