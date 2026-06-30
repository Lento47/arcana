// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { RUNPROOF_SCHEMA_VERSION, type ExecutionContract, type RunProof, type RunProofEvent } from "./types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function rollbackRestoreStatus(value: unknown): RunProof["rollback"]["restore_status"] {
  return value === "staged" || value === "approved" || value === "executed" || value === "rejected"
    ? value
    : "not_staged"
}

function legacyContract(proof: RunProof): ExecutionContract {
  return {
    id: `contract_${proof.id}`,
    created_at: proof.lifecycle.started_at ?? proof.timestamp,
    goal: proof.user_intent,
    scope: "Legacy RunProof 0.1 record; execution scope was not captured.",
    allowed_files: [
      ...proof.execution.file_reads.map((read) => read.path),
      ...proof.execution.file_writes.map((write) => write.path),
    ],
    allowed_commands: proof.execution.shell_commands.map((command) => command.command),
    risk_level: proof.risk.level,
    required_approvals: proof.risk.required_approval ? ["Legacy proof required approval"] : [],
    expected_artifacts: ["RunProof evidence bundle"],
    rollback_plan:
      proof.rollback.strategy === "none"
        ? "Legacy proof did not capture a rollback plan."
        : (proof.rollback.restore_command ?? `Restore checkpoint ${proof.rollback.checkpoint_id}.`),
    verification_steps: [
      proof.verification.typecheck?.command,
      proof.verification.lint?.command,
      proof.verification.build?.command,
      ...proof.verification.tests.map((test) => test.command),
      ...proof.verification.manual_checks.map((check) => check.description),
    ].filter((step): step is string => Boolean(step)),
    status:
      proof.lifecycle.status === "completed"
        ? "completed"
        : proof.lifecycle.status === "cancelled"
          ? "cancelled"
          : "active",
  }
}

function legacyEvents(proof: RunProof): RunProofEvent[] {
  const started = proof.lifecycle.started_at ?? proof.timestamp
  return [
    {
      id: `evt_${proof.id}_legacy_plan`,
      timestamp: started,
      type: "plan.created",
      actor: "system",
      summary: "Legacy RunProof 0.1 record normalized without original live timeline events.",
      status: proof.lifecycle.status,
      risk: proof.risk.level,
      refs: { contract_id: `contract_${proof.id}` },
    },
    ...proof.execution.tool_calls.map(
      (call): RunProofEvent => ({
        id: `evt_${call.id}`,
        timestamp: call.timestamp,
        type: "tool.requested",
        actor: "agent",
        summary: call.input_summary ? `${call.name}: ${call.input_summary}` : `Tool requested: ${call.name}`,
        risk: call.risk,
        status: call.status,
        refs: { tool_call_id: call.id, tool: call.name },
      }),
    ),
    ...proof.execution.shell_commands.map(
      (command): RunProofEvent => ({
        id: `evt_${command.id}`,
        timestamp: command.timestamp,
        type: "command.executed",
        actor: "agent",
        summary: command.command,
        risk: command.risk,
        status: command.status,
        refs: { shell_command_id: command.id, cwd: command.cwd },
        data: { exit_code: command.exit_code },
      }),
    ),
  ]
}

export function normalizeRunProof(input: RunProof): RunProof {
  const proof = structuredClone(input) as RunProof & { contract?: unknown; events?: unknown; schema_version?: unknown }
  proof.schema_version = RUNPROOF_SCHEMA_VERSION

  if (!isRecord(proof.contract)) proof.contract = legacyContract(proof)
  else {
    proof.contract = {
      id: typeof proof.contract.id === "string" ? proof.contract.id : `contract_${proof.id}`,
      created_at:
        typeof proof.contract.created_at === "string" ? proof.contract.created_at : proof.lifecycle.started_at,
      goal: typeof proof.contract.goal === "string" ? proof.contract.goal : proof.user_intent,
      scope:
        typeof proof.contract.scope === "string" ? proof.contract.scope : "Current repository and active user request.",
      allowed_files: stringArray(proof.contract.allowed_files),
      allowed_commands: stringArray(proof.contract.allowed_commands),
      risk_level: proof.risk.level,
      required_approvals: stringArray(proof.contract.required_approvals),
      expected_artifacts: stringArray(proof.contract.expected_artifacts),
      rollback_plan:
        typeof proof.contract.rollback_plan === "string"
          ? proof.contract.rollback_plan
          : "No rollback checkpoint has been created yet.",
      verification_steps: stringArray(proof.contract.verification_steps),
      status:
        proof.contract.status === "draft" ||
        proof.contract.status === "active" ||
        proof.contract.status === "completed" ||
        proof.contract.status === "cancelled"
          ? proof.contract.status
          : "active",
    }
  }

  if (!Array.isArray(proof.events)) proof.events = legacyEvents(proof)
  proof.rollback = {
    ...proof.rollback,
    restore_status: rollbackRestoreStatus(proof.rollback.restore_status),
    approval_required: typeof proof.rollback.approval_required === "boolean" ? proof.rollback.approval_required : true,
  }
  return proof as RunProof
}
