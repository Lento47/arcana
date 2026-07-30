/**
 * TUI-2 Production Mounting: Approval Spine Adapter
 *
 * Bridges the Arcana approval lifecycle (core/crypto) to the TUI
 * command-spine rendering system.
 *
 * Path:
 *   approval event → SpineEntry → operator action → ApprovalOperatorService
 *
 * Never imports:
 *   GovernedApprovalExecutor
 *   raw approval database mutations
 *   Phase C executor callbacks
 */

import type { ApprovalRecord, ApprovalState } from "../../core/crypto/approval-lifecycle"
import type { SpineEntry, SpineKind, StatusTone } from "./spine-types"
import { SPINE_GLYPH } from "./spine-types"

// ─── Approval → SpineEntry ──────────────────────────────────────────

const APPROVAL_STATE_KIND: Record<ApprovalState, SpineKind> = {
  PENDING: "approve",
  APPROVED: "ok",
  DENIED: "fail",
  CLAIMED: "run",
  CONSUMED: "ok",
  EXPIRED: "fail",
  INVALIDATED: "fail",
}

const APPROVAL_STATE_TONE: Record<ApprovalState, StatusTone> = {
  PENDING: "warning",
  APPROVED: "accent",
  DENIED: "error",
  CLAIMED: "info",
  CONSUMED: "success",
  EXPIRED: "muted",
  INVALIDATED: "error",
}

const APPROVAL_STATE_LABEL: Record<ApprovalState, string> = {
  PENDING: "approval required",
  APPROVED: "approved",
  DENIED: "denied",
  CLAIMED: "executing",
  CONSUMED: "consumed",
  EXPIRED: "expired",
  INVALIDATED: "invalidated",
}

/**
 * Convert an ApprovalRecord to a SpineEntry for rendering.
 */
export function approvalToSpineEntry(approval: ApprovalRecord): SpineEntry {
  const kind = APPROVAL_STATE_KIND[approval.state]
  const tone = APPROVAL_STATE_TONE[approval.state]
  const label = APPROVAL_STATE_LABEL[approval.state]

  return {
    id: `approval:${approval.approvalId}:${approval.version}`,
    index: 0,
    elapsed: "",
    kind,
    label,
    actor: approval.approvedBy ?? "operator",
    glyph: approvalGlyph(approval.state),
    summary: approvalSummary(approval),
    body: approvalBody(approval),
    bodyLabel: "approval gate",
    collapsible: true,
    expandedByDefault: approval.state === "PENDING",
    source: {
      messageID: approval.approvalId,
      kind: "approve",
    },
  }
}

function approvalGlyph(state: ApprovalState): string {
  switch (state) {
    case "PENDING": return SPINE_GLYPH.approve ?? "◤"
    case "APPROVED": return "✓"
    case "DENIED": return "✗"
    case "CLAIMED": return "▷"
    case "CONSUMED": return "▣"
    case "EXPIRED": return "×"
    case "INVALIDATED": return "✗"
  }
}

function approvalSummary(approval: ApprovalRecord): string {
  const action = approval.requestHash.slice(0, 8)
  switch (approval.state) {
    case "PENDING":
      return `${action} · exact request required`
    case "APPROVED":
      return `approved once · operator ${approval.approvedBy ?? "unknown"}`
    case "DENIED":
      return `denied by operator ${approval.approvedBy ?? "unknown"}`
    case "CLAIMED":
      return `claimed · execution ${approval.executionId ?? "pending"}`
    case "CONSUMED":
      return `consumed · execution ${approval.executionId ?? "unknown"}`
    case "EXPIRED":
      return `expired · not claimed in time`
    case "INVALIDATED":
      return `invalidated · new authorization required`
  }
}

function approvalBody(approval: ApprovalRecord): string {
  const lines = [
    `Approval: ${approval.approvalId}`,
    `Version: ${approval.version}`,
    `State: ${approval.state}`,
    `Session: ${approval.sessionId}`,
    `Workspace: ${approval.workspaceId}`,
    `Request: ${approval.requestHash}`,
    `Contract: ${approval.contractRevision}`,
    `Expires: ${approval.expiresAt}`,
  ]

  if (approval.approvedBy) {
    lines.push(`Operator: ${approval.approvedBy}`)
  }
  if (approval.executionId) {
    lines.push(`Execution: ${approval.executionId}`)
  }

  return lines.join("\n")
}

// ─── Actionability ──────────────────────────────────────────────────

/**
 * Check if an approval is actionable (can be approved/denied).
 */
export function isApprovalActionable(approval: ApprovalRecord): boolean {
  return approval.state === "PENDING"
}

/**
 * Check if an approval is in a terminal state.
 */
export function isApprovalTerminal(approval: ApprovalRecord): boolean {
  return ["CONSUMED", "EXPIRED", "INVALIDATED", "DENIED"].includes(approval.state)
}

// ─── Receipt Generation ─────────────────────────────────────────────

export type ApprovalReceiptLine = {
  glyph: string
  text: string
  tone: StatusTone
}

/**
 * Generate receipt lines for an approval state transition.
 * Used for the command spine receipt display.
 */
export function generateApprovalReceipt(approval: ApprovalRecord): ApprovalReceiptLine[] {
  const lines: ApprovalReceiptLine[] = []

  switch (approval.state) {
    case "PENDING":
      lines.push({ glyph: "◤", text: `approval ${approval.requestHash.slice(0, 8)} · exact request required`, tone: "warning" })
      break

    case "APPROVED":
      lines.push({ glyph: "◤", text: `approval approved once · operator ${approval.approvedBy ?? "unknown"}`, tone: "accent" })
      break

    case "CLAIMED":
      lines.push({ glyph: "◤", text: `approval claimed · execution ${approval.executionId ?? "pending"}`, tone: "info" })
      break

    case "CONSUMED":
      lines.push({ glyph: "✓", text: `approval consumed · execution ${approval.executionId ?? "unknown"}`, tone: "success" })
      lines.push({ glyph: "▣", text: `authority approval consumed · 0 uses`, tone: "success" })
      break

    case "DENIED":
      lines.push({ glyph: "✗", text: `denied by operator ${approval.approvedBy ?? "unknown"}`, tone: "error" })
      lines.push({ glyph: "✗", text: `approval ${approval.requestHash.slice(0, 8)} · approval rejected`, tone: "error" })
      break

    case "INVALIDATED":
      lines.push({ glyph: "✗", text: `capability revoked`, tone: "error" })
      lines.push({ glyph: "×", text: `approval invalidated · new authorization required`, tone: "error" })
      break

    case "EXPIRED":
      lines.push({ glyph: "×", text: `approval expired · not claimed in time`, tone: "muted" })
      break
  }

  return lines
}

// ─── Recovery Presentation ──────────────────────────────────────────

/**
 * Generate persistent recovery-required presentation.
 * Must remain visible even when ordinary lifecycle events are filtered.
 */
export function generateRecoveryPresentation(executionId: string): ApprovalReceiptLine[] {
  return [
    { glyph: "!", text: "recovery required", tone: "error" },
    { glyph: " ", text: "effect outcome uncertain", tone: "warning" },
    { glyph: " ", text: "automatic replay blocked", tone: "warning" },
    { glyph: " ", text: "manual reconciliation required", tone: "warning" },
    { glyph: " ", text: `execution ${executionId}`, tone: "muted" },
  ]
}

/**
 * Generate INVALIDATED presentation with reason.
 */
export function generateInvalidatedPresentation(
  approvalId: string,
  reason: string,
): ApprovalReceiptLine[] {
  return [
    { glyph: "×", text: "approval invalidated", tone: "error" },
    { glyph: " ", text: reason, tone: "warning" },
    { glyph: " ", text: "new approval required", tone: "muted" },
  ]
}
