// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import {
  deriveSecurityContext,
  type ArcanaSecurityContext,
  type ArcanaSecurityContextInput,
  type ArcanaSecurityControl,
  type ArcanaSecurityRisk,
} from "./security-context"

export const ARCANA_ACTION_KINDS = ["model", "tool", "mcp", "shell", "file_read", "file_write", "network", "provider"] as const
export type ArcanaActionKind = (typeof ARCANA_ACTION_KINDS)[number]

export const ARCANA_ACTION_SOURCES = ["user", "planner", "builder", "verifier", "system", "migration"] as const
export type ArcanaActionSource = (typeof ARCANA_ACTION_SOURCES)[number]

export type ArcanaPolicyDecision = "allow" | "deny" | "ask" | "sandbox" | "propose_diff" | "require_verifier"

export type ArcanaActionEvidenceRequirement = {
  readonly kind: "runproof_event" | "policy_record" | "permission_record" | "mutation_record" | "verifier_record" | "telemetry_span"
  readonly required: boolean
}

export type ArcanaEngineAction = {
  readonly id: string
  readonly session_id?: string
  readonly message_id?: string
  readonly source: ArcanaActionSource
  readonly kind: ArcanaActionKind
  readonly name: string
  readonly input_summary: string
  readonly cwd?: string
  readonly security_context: ArcanaSecurityContext
  readonly risk: ArcanaSecurityRisk
  readonly policy: ArcanaPolicyDecision
  readonly required_controls: readonly ArcanaSecurityControl[]
  readonly reversible: boolean
  readonly evidence: readonly ArcanaActionEvidenceRequirement[]
  readonly proof_event_id?: string
}

function defaultActionEvidence(kind: ArcanaActionKind): ArcanaActionEvidenceRequirement[] {
  const evidence: ArcanaActionEvidenceRequirement[] = [
    { kind: "runproof_event", required: true },
    { kind: "policy_record", required: true },
    { kind: "telemetry_span", required: false },
  ]

  if (kind === "file_write") evidence.push({ kind: "mutation_record", required: true })
  if (kind === "shell" || kind === "mcp" || kind === "network") evidence.push({ kind: "permission_record", required: true })
  return evidence
}

export function decidePolicyForAction(context: ArcanaSecurityContext): ArcanaPolicyDecision {
  if (context.risk === "critical") return "ask"
  if (context.required_controls.includes("verifier")) return "require_verifier"
  if (context.required_controls.includes("sandbox")) return "sandbox"
  if (context.required_controls.includes("approval")) return "ask"
  if (context.required_controls.includes("checkpoint") || context.required_controls.includes("rollback")) return "propose_diff"
  return "allow"
}

export function actionIsReversible(kind: ArcanaActionKind, context: ArcanaSecurityContext): boolean {
  if (kind === "model" || kind === "file_read" || kind === "provider") return true
  if (kind === "network") return false
  if (context.dangerous_capabilities.includes("publish_artifact")) return false
  if (context.dangerous_capabilities.includes("network_egress")) return false
  return context.required_controls.includes("rollback") || context.required_controls.includes("checkpoint")
}

export function createEngineAction(input: {
  readonly id?: string
  readonly session_id?: string
  readonly message_id?: string
  readonly source: ArcanaActionSource
  readonly kind: ArcanaActionKind
  readonly name: string
  readonly input_summary: string
  readonly cwd?: string
  readonly security?: Omit<ArcanaSecurityContextInput, "action_kind">
  readonly proof_event_id?: string
}): ArcanaEngineAction {
  const securityContext = deriveSecurityContext({
    action_kind: input.kind,
    ...(input.security),
  })

  return {
    id: input.id ?? `act_${input.kind}`,
    session_id: input.session_id,
    message_id: input.message_id,
    source: input.source,
    kind: input.kind,
    name: input.name,
    input_summary: input.input_summary,
    cwd: input.cwd,
    security_context: securityContext,
    risk: securityContext.risk,
    policy: decidePolicyForAction(securityContext),
    required_controls: securityContext.required_controls,
    reversible: actionIsReversible(input.kind, securityContext),
    evidence: defaultActionEvidence(input.kind),
    proof_event_id: input.proof_event_id,
  }
}

export function actionRequiresPermission(action: ArcanaEngineAction): boolean {
  return action.policy === "ask" || action.evidence.some((evidence) => evidence.kind === "permission_record" && evidence.required)
}

export function actionRequiresMutationGate(action: ArcanaEngineAction): boolean {
  return action.kind === "file_write" || action.policy === "propose_diff" || action.evidence.some((evidence) => evidence.kind === "mutation_record" && evidence.required)
}

export function actionCanRunWithoutVerifier(action: ArcanaEngineAction): boolean {
  return action.policy !== "require_verifier" && !action.required_controls.includes("verifier")
}
