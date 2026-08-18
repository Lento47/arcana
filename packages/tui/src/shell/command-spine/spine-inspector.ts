/**
 * PR6: universal [v] inspector content.
 *
 * One forensic command that adapts to the focused row:
 * conversation -> source message; tool -> command/inputs/output; approval ->
 * immutable exact request; effect -> execution receipt; proof -> full proof
 * chain; subagent -> process/session; error -> stack/event id/recovery advice.
 */

import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { Message, Part, ToolPart } from "@arcana/sdk/v2"
import type { GovernanceRunProof } from "../types"
import type { SpineApprovalSnapshot, SpineEntry } from "./spine-types"
import { shortHash } from "./approval-snapshot"
import { projectSessionCharter } from "./session-charter"

export type SpineInspectionSection = {
  title: string
  rows: Array<[string, string]>
  body?: string
}

export type SpineInspectionInput = {
  entry: SpineEntry
  approval?: ApprovalRecord
  snapshot?: SpineApprovalSnapshot
  proof?: GovernanceRunProof
  message?: Message
  parts?: Part[]
  subagent?: { id: string; title?: string; agent?: string; directory?: string } | undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function json(value: unknown): string {
  if (value === undefined) return "unavailable"
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toolPart(input: SpineInspectionInput): ToolPart | undefined {
  const partID = input.entry.source?.partID
  const parts = input.parts ?? []
  if (partID) return parts.find((part): part is ToolPart => part.type === "tool" && part.id === partID)
  return parts.find((part): part is ToolPart => part.type === "tool")
}

function recoveryAdvice(entry: SpineEntry): string {
  if (entry.proof?.integrity === "INVALID") {
    return "Recovery: proof integrity is invalid. Stop and inspect the evidence chain before any further effect."
  }
  if (entry.kind === "fail" || entry.receipt?.status === "fail") {
    return "Recovery: review the failing command/inputs, fix the cause, retry the turn. Automatic replay is blocked."
  }
  if (entry.id.startsWith("governance-trace:") || entry.id.startsWith("governance-proof:")) {
    return "Recovery: governance evidence is degraded or missing. Resync the session and re-verify before acting."
  }
  return "Recovery: no automatic replay is available; reconcile manually from the evidence above."
}

export function buildSpineInspection(input: SpineInspectionInput): SpineInspectionSection[] {
  const { entry, approval, snapshot, proof } = input
  const sections: SpineInspectionSection[] = []

  const charter = projectSessionCharter(proof)
  if (charter && proof) {
    sections.push({
      title: "Session charter",
      rows: [
        ["Contract", proof.contractStatus ?? "none"],
        ["Proof", charter.proof.label],
        ["Integrity", proof.integrityStatus],
        ["Trace", proof.traceHealth],
        ["Proof hash", proof.proofHash || "unavailable"],
      ],
    })
  }

  // Approval -> immutable exact request.
  if (entry.source?.kind === "approve" && (entry.id.startsWith("approval:") || entry.approval)) {
    const rows: Array<[string, string]> = []
    if (approval) {
      rows.push(
        ["Approval ID", approval.approvalId],
        ["Version", String(approval.version)],
        ["State", approval.state],
        ["Session ID", approval.sessionId],
        ["Workspace ID", approval.workspaceId],
        ["Request hash", approval.requestHash],
        ["Contract revision", String(approval.contractRevision)],
        ["Expires", approval.expiresAt],
        ["Created", approval.createdAt],
        ["Updated", approval.updatedAt],
      )
      if (approval.principalId) rows.push(["Principal", approval.principalId])
      if (approval.approvedBy) rows.push(["Operator", approval.approvedBy])
      if (approval.executionId) rows.push(["Execution ID", approval.executionId])
    }
    if (snapshot) {
      rows.push(
        ["Tool", snapshot.tool ?? "unavailable"],
        ["Action", snapshot.action ?? "unavailable"],
        ["Capability", snapshot.capability ?? "unavailable"],
        ["Principal", snapshot.principal ?? "unavailable"],
        ["Policy", snapshot.policy ?? "unavailable"],
        ["Change", snapshot.change ?? "unavailable · fail-closed"],
        ["Route", snapshot.route ?? "LOCAL TUI"],
        ["Risk", snapshot.risk ?? "unavailable"],
        ["Expires", snapshot.expires ?? "unknown"],
      )
      if (!snapshot.available) rows.push(["Snapshot", "unavailable · fail-closed"])
    }
    sections.push({ title: "Exact request", rows })
  }

  // Proof / effect -> execution receipt + proof chain.
  if (entry.proof || entry.id.startsWith("governance-proof:") || entry.id.startsWith("proof-continuation:")) {
    const rows: Array<[string, string]> = []
    if (entry.proof) {
      rows.push(
        ["Receipt", entry.proof.receipt ?? "unavailable"],
        ["Evidence", `${entry.proof.evidence ?? 0} artifacts`],
        ["Proof", `${entry.proof.proofLevel ?? "P0"} · integrity ${(entry.proof.integrity ?? "unverified").toLowerCase()}`],
        ["Policy", entry.proof.policy ?? "unavailable"],
        ["Request hash", entry.proof.requestHash ?? "unavailable"],
        ["Tool", entry.proof.tool ?? "unavailable"],
        ["Action", entry.proof.action ?? "unavailable"],
        ["Execution ID", entry.proof.executionId ?? "unavailable"],
      )
    }
    if (proof) {
      rows.push(
        ["Proof hash", proof.proofHash || "unavailable"],
        ["Run root", proof.runRoot || "unavailable"],
        ["Proof level", proof.proofLevel],
        ["Trace health", proof.traceHealth],
        ["Integrity", proof.integrityStatus],
        ["Lifecycle", proof.lifecycleStatus],
        ["Verification", proof.assuranceProfile.verification],
        ["Unauthorized executions", String(proof.authorizationProfile.unauthorizedExecutions)],
      )
    }
    sections.push({ title: "Execution receipt / proof chain", rows, body: entry.body })
  }

  // Tool -> command/inputs/output.
  const part = toolPart(input)
  if (entry.source?.kind === "tool" || entry.source?.kind === "subtask" || part) {
    const rows: Array<[string, string]> = [
      ["Tool", part?.tool ?? entry.summary],
      ["Status", part?.state.status ?? entry.receipt?.status ?? "unknown"],
    ]
    if (entry.receipt?.command) rows.push(["Command", entry.receipt.command])
    if (part && "input" in part.state) rows.push(["Inputs", json(part.state.input)])
    if (part && part.state.status === "completed") rows.push(["Output", part.state.output])
    if (part && part.state.status === "error") rows.push(["Error", part.state.error])
    sections.push({
      title: "Tool call",
      rows,
      body: entry.diff?.body ?? entry.body,
    })
  }

  // Conversation -> source message.
  if (input.message || entry.source?.kind === "message" || entry.source?.kind === "text") {
    const message = input.message
    const rows: Array<[string, string]> = []
    if (message) {
      rows.push(
        ["Message ID", message.id],
        ["Role", message.role],
        ["Session ID", message.sessionID],
      )
      if ("agent" in message && message.agent) rows.push(["Agent", message.agent])
      if ("modelID" in message && message.modelID) rows.push(["Model", message.modelID])
      if ("time" in message && typeof message.time.created === "number") {
        rows.push(["Created", new Date(message.time.created).toISOString()])
      }
    }
    sections.push({
      title: "Source message",
      rows,
      body: entry.body ?? entry.summary,
    })
  }

  // Subagent -> process/session.
  if (entry.source?.kind === "subtask" || entry.kind === "agent" || input.subagent) {
    const child = input.subagent
    const rows: Array<[string, string]> = [
      ["Session ID", child?.id ?? entry.source?.sessionID ?? entry.id],
      ["Title", child?.title ?? entry.summary],
      ["Agent", child?.agent ?? entry.actor ?? "subagent"],
      ["PID", "unavailable · isolated child session"],
    ]
    if (child?.directory) rows.push(["Directory", child.directory])
    sections.push({ title: "Subagent session", rows, body: entry.body })
  }

  // Error -> stack/event id/recovery advice.
  if (entry.kind === "fail") {
    sections.push({
      title: "Error",
      rows: [
        ["Event ID", entry.id],
        ["Kind", entry.kind],
        ["Label", entry.label ?? "fail"],
        ["Summary", entry.summary],
      ],
      body: [entry.body, recoveryAdvice(entry)].filter(Boolean).join("\n\n"),
    })
  }

  // Fallback: raw entry context (never silently empty).
  if (sections.length === 0) {
    sections.push({
      title: "Spine entry",
      rows: [
        ["Entry ID", entry.id],
        ["Kind", entry.kind],
        ["Label", entry.label ?? "—"],
        ["Summary", entry.summary],
      ],
      body: entry.body,
    })
  }

  return sections
}

/** Short hash reuse so inspector headers and rows agree on formatting. */
export { shortHash as inspectorShortHash }
