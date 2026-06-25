// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { MessageID, SessionID } from "@/session/schema"

export const EngineActionID = Schema.String.pipe(Schema.brand("EngineActionID"))
export type EngineActionID = typeof EngineActionID.Type

export const RiskLevel = Schema.Literal("low", "medium", "high", "critical")
export type RiskLevel = typeof RiskLevel.Type

export const EngineActionSource = Schema.Literal("user", "agent", "subagent", "system", "verifier")
export type EngineActionSource = typeof EngineActionSource.Type

export const EngineActionKind = Schema.Literal(
  "tool",
  "mcp",
  "file_read",
  "file_write",
  "shell",
  "network",
  "session",
  "model",
)
export type EngineActionKind = typeof EngineActionKind.Type

export const RequiredControl = Schema.Literal("approval", "diff", "checkpoint", "sandbox", "verifier", "human_review")
export type RequiredControl = typeof RequiredControl.Type

export const RiskAssessment = Schema.Struct({
  level: RiskLevel,
  reasons: Schema.Array(Schema.String),
  required_controls: Schema.Array(RequiredControl),
})
export type RiskAssessment = typeof RiskAssessment.Type

export const SandboxConstraint = Schema.Struct({
  kind: Schema.String,
  value: Schema.String,
  reason: Schema.optional(Schema.String),
})
export type SandboxConstraint = typeof SandboxConstraint.Type

export const PolicyDecision = Schema.Union(
  Schema.Struct({
    action: Schema.Literal("allow"),
    reason: Schema.String,
    evidence_required: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("deny"),
    reason: Schema.String,
  }),
  Schema.Struct({
    action: Schema.Literal("ask"),
    reason: Schema.String,
    approval_scope: Schema.Literal("once", "session", "project"),
  }),
  Schema.Struct({
    action: Schema.Literal("sandbox"),
    reason: Schema.String,
    constraints: Schema.Array(SandboxConstraint),
  }),
  Schema.Struct({
    action: Schema.Literal("propose_diff"),
    reason: Schema.String,
  }),
  Schema.Struct({
    action: Schema.Literal("require_verifier"),
    reason: Schema.String,
  }),
)
export type PolicyDecision = typeof PolicyDecision.Type

export const EngineAction = Schema.Struct({
  id: EngineActionID,
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  source: EngineActionSource,
  kind: EngineActionKind,
  name: Schema.String,
  input: Schema.Unknown,
  cwd: Schema.optional(Schema.String),
  risk: RiskAssessment,
  policy: PolicyDecision,
  reversible: Schema.Boolean,
  proof_event_id: Schema.optional(Schema.String),
  time: Schema.Struct({
    created: Schema.Number,
    started: Schema.optional(Schema.Number),
    ended: Schema.optional(Schema.Number),
  }),
})
export type EngineAction = typeof EngineAction.Type

export const ProposedFileDiff = Schema.Struct({
  path: Schema.String,
  additions: Schema.Number,
  deletions: Schema.Number,
  patch: Schema.optional(Schema.String),
  summary: Schema.String,
})
export type ProposedFileDiff = typeof ProposedFileDiff.Type

export const MutationProposal = Schema.Struct({
  id: Schema.String,
  sessionID: SessionID,
  actionID: EngineActionID,
  files: Schema.Array(ProposedFileDiff),
  risk: RiskAssessment,
  approval: PolicyDecision,
  checkpoint_id: Schema.optional(Schema.String),
})
export type MutationProposal = typeof MutationProposal.Type

export const VerifierPass = Schema.Struct({
  id: Schema.String,
  sessionID: SessionID,
  actionIDs: Schema.Array(EngineActionID),
  diffIDs: Schema.Array(Schema.String),
  model: Schema.optional(Schema.String),
  status: Schema.Literal("passed", "failed", "inconclusive"),
  concerns: Schema.Array(Schema.String),
  required_followups: Schema.Array(Schema.String),
})
export type VerifierPass = typeof VerifierPass.Type

export const EngineEvent = Schema.Union(
  Schema.Struct({ type: Schema.Literal("action.proposed"), action: EngineAction }),
  Schema.Struct({ type: Schema.Literal("policy.decided"), actionID: EngineActionID, decision: PolicyDecision }),
  Schema.Struct({ type: Schema.Literal("action.started"), actionID: EngineActionID }),
  Schema.Struct({ type: Schema.Literal("action.completed"), actionID: EngineActionID, output: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("action.failed"), actionID: EngineActionID, error: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("diff.proposed"), proposal: MutationProposal }),
  Schema.Struct({ type: Schema.Literal("diff.applied"), proposalID: Schema.String }),
  Schema.Struct({ type: Schema.Literal("verification.completed"), verifier: VerifierPass }),
  Schema.Struct({ type: Schema.Literal("rollback.created"), checkpointID: Schema.String }),
  Schema.Struct({ type: Schema.Literal("runproof.updated"), runproofID: Schema.String }),
)
export type EngineEvent = typeof EngineEvent.Type

export function lowRisk(reason: string, controls: RequiredControl[] = []): RiskAssessment {
  return { level: "low", reasons: [reason], required_controls: controls }
}

export function allow(reason: string, evidence_required: string[] = []): PolicyDecision {
  return { action: "allow", reason, evidence_required }
}

export function newActionID(): EngineActionID {
  return EngineActionID.make(`act_${crypto.randomUUID()}`)
}

export function createEngineAction(input: Omit<EngineAction, "id" | "risk" | "policy" | "reversible" | "time"> & {
  id?: EngineActionID
  risk?: RiskAssessment
  policy?: PolicyDecision
  reversible?: boolean
  created?: number
}): EngineAction {
  return {
    id: input.id ?? newActionID(),
    sessionID: input.sessionID,
    messageID: input.messageID,
    source: input.source,
    kind: input.kind,
    name: input.name,
    input: input.input,
    cwd: input.cwd,
    risk: input.risk ?? lowRisk("Action created without specialized risk classification."),
    policy: input.policy ?? allow("No specialized policy decision has been attached yet."),
    reversible: input.reversible ?? false,
    proof_event_id: input.proof_event_id,
    time: { created: input.created ?? Date.now() },
  }
}
