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

import type { ApprovalRecord, ApprovalState } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import type { SpineApprovalSnapshot, SpineEntry, SpineKind, StatusTone } from "./spine-types"
import { SPINE_GLYPH } from "./spine-types"
import { Locale } from "../../util/locale"
import { shortHash } from "./approval-snapshot"

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
export function approvalToSpineEntry(
  approval: ApprovalRecord,
  snapshot?: SpineApprovalSnapshot,
): SpineEntry {
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
    summary: approvalSummary(approval, snapshot),
    body: approvalBody(approval, snapshot),
    bodyLabel: "approval gate",
    collapsible: true,
    expandedByDefault: approval.state === "PENDING",
    breakthrough: approval.state === "INVALIDATED",
    approval: snapshot,
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
    default: return "?"
  }
}

function approvalSummary(approval: ApprovalRecord, snapshot?: SpineApprovalSnapshot): string {
  const action = snapshot?.tool ?? shortHash(approval.requestHash)
  switch (approval.state) {
    case "PENDING":
      return `approval required · ${action}`
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
    default:
      return `unknown state`
  }
}

function approvalBody(approval: ApprovalRecord, snapshot?: SpineApprovalSnapshot): string {
  // T9: truncate by display width (n + 1 = n cols + the "…" glyph) so CJK
  // approval bodies don't overflow the receipt row.
  const short = (s: string, n = 12) => Locale.truncate(s, n + 1)
  const lines = [
    `Approval: ${short(approval.approvalId, 16)}`,
    `Version: ${approval.version}`,
    `State: ${approval.state}`,
    `Session: ${short(approval.sessionId, 12)}`,
    `Workspace: ${short(approval.workspaceId, 12)}`,
    `Request: ${approval.requestHash}`,
    `Contract: ${String(approval.contractRevision)}`,
    `Expires: ${approval.expiresAt}`,
  ]

  if (snapshot) {
    if (snapshot.tool) lines.push(`Tool: ${snapshot.tool}`)
    if (snapshot.action) lines.push(`Action: ${snapshot.action}`)
    if (snapshot.capability) lines.push(`Capability: ${snapshot.capability}`)
    if (snapshot.principal) lines.push(`Principal: ${snapshot.principal}`)
    if (snapshot.policy) lines.push(`Policy: ${snapshot.policy}`)
    if (snapshot.change) lines.push(`Change: ${snapshot.change}`)
    if (snapshot.route) lines.push(`Route: ${snapshot.route}`)
    if (snapshot.risk) lines.push(`Risk: ${snapshot.risk}`)
    if (snapshot.executionId) lines.push(`Execution: ${snapshot.executionId}`)
    if (!snapshot.available) lines.push("Snapshot: unavailable — fail-closed")
  }

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
/**
 * M10: the ONE parse of an approval spine-entry id — `approval:<approvalId>:<version>`.
 * Joins all middle segments (approvalId itself may contain ":"), strips the trailing
 * version. The shell's focus/select path previously re-parsed with a bare
 * `slice("approval:".length)`, passing `id:version` to the controller.
 */
export function approvalIdFromEntryID(entryID: string): string | undefined {
  if (!entryID.startsWith("approval:")) return undefined
  const parts = entryID.split(":")
  if (parts.length < 3) return undefined
  return parts.slice(1, -1).join(":")
}

export function approvalActionAvailable(
  affordances: readonly AuthorityAffordance[],
  action: "approve" | "deny",
): boolean {
  return affordances.some((item) => item.action === action && item.state === "available")
}

/**
 * Inspection is read-only and therefore allowed for ANY focused approval —
 * PENDING, APPROVED, CLAIMED, CONSUMED, or terminal (runbook: v → a → watch
 * it go CLAIMED → CONSUMED). Only a/d are gated on PENDING. Inspection also
 * stays available while an ACTION GATE is open: the gate owns decisions
 * (←/→ + Enter), but the operator can still navigate and inspect the exact
 * approval request before deciding.
 */
export function approvalInspectionAllowed(input: {
  hasFocusedApproval: boolean
  composerFocused: boolean
  submitting: boolean
}): boolean {
  return (
    input.hasFocusedApproval &&
    !input.composerFocused &&
    !input.submitting
  )
}

/**
 * F-25/F-26/F-27: approval action keys (a approve / d deny) are enabled only
 * when the composer is not focused, no permission/question gate is open (the
 * gate owns decisions via its own keys), no command is in flight, and the
 * focused entry is a still-actionable PENDING approval.
 */
export function approvalActionBindingsEnabled(input: {
  composerFocused: boolean
  gatesOpen: boolean
  submitting: boolean
  focusedAffordances: readonly AuthorityAffordance[]
  /** PR6: authority actions are disabled while governance evidence is unhealthy. */
  governanceHealthy?: boolean
}): boolean {
  return (
    !input.composerFocused &&
    !input.gatesOpen &&
    !input.submitting &&
    input.governanceHealthy !== false &&
    (approvalActionAvailable(input.focusedAffordances, "approve") ||
      approvalActionAvailable(input.focusedAffordances, "deny"))
  )
}

/**
 * F-25/F-26: Esc may close the inspector or clear the approval selection only
 * outside an open gate (Esc is inert while a gate owns the keys) and while no
 * approval command is in flight. Inspector close must work for ANY approval
 * state (runbook: v -> a -> CLAIMED -> CONSUMED).
 */
export function approvalEscapeEnabled(input: {
  gatesOpen: boolean
  submitting: boolean
  inspectorOpen: boolean
  composerFocused: boolean
  focusedApproval: ApprovalRecord | undefined
}): boolean {
  return (
    !input.gatesOpen &&
    !input.submitting &&
    (input.inspectorOpen || (input.focusedApproval !== undefined && !input.composerFocused))
  )
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
      break

    case "DENIED":
      lines.push({ glyph: "✗", text: `denied by operator ${approval.approvedBy ?? "unknown"}`, tone: "error" })
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
