/**
 * Phase TUI-2: Durable Approval Lifecycle
 *
 * Connects operator decisions to the real Phase C lifecycle.
 * Approval state + events are atomically committed via transactional outbox.
 *
 * Lifecycle:
 *   PENDING → APPROVED → CLAIMED → CONSUMED
 *   PENDING → DENIED
 *   PENDING → EXPIRED
 *   APPROVED → EXPIRED (if not claimed in time)
 *
 * The approval does NOT execute the action. Execution requires:
 *   1. Fresh Phase C PDP/PEP recheck
 *   2. Atomic claim with executionId
 *   3. Effect at most once via execution idempotency key
 *   4. Consumption after confirmed effect
 *
 * Critical invariant: Button-to-effect paths = 0
 * The TUI must never have direct executor access.
 */

import { createHash } from "node:crypto"
import type { ApprovalRoute } from "./approval-routing"
import type { RiskClass } from "../capability/types"

// ─── Approval State Machine ─────────────────────────────────────────

export type ApprovalState =
  | "PENDING"           // Awaiting operator decision
  | "APPROVED"          // Operator approved — not yet claimed
  | "DENIED"            // Operator denied
  | "CLAIMED"           // Execution in progress — executionId bound
  | "CONSUMED"          // Effect completed, approval exhausted
  | "EXPIRED"           // Not claimed in time or stale
  | "INVALIDATED"       // Authority changed (revocation, policy, quarantine) — cannot retry

// ─── Approval Record ────────────────────────────────────────────────

export type ApprovalRecord = {
  approvalId: string
  version: number
  sessionId: string
  workspaceId: string
  requestHash: string
  contractRevision: number

  /** Principal the approval authorizes (agent identity). Optional for backward compat. */
  principalId?: string

  state: ApprovalState

  approvedBy?: string
  /** Operator who revoked the approval (PENDING/APPROVED -> INVALIDATED). */
  revokedBy?: string
  executionId?: string

  /**
   * Advisory routing metadata (Phase D). The routing decision never affects
   * the PDP/PEP; it selects the operator surface that may decide.
   */
  route?: ApprovalRoute
  routingPolicyVersion?: string
  localFallbackAllowed?: boolean
  riskClass?: RiskClass

  expiresAt: string
  updatedAt: string
  createdAt: string
}

// ─── Execution Record ───────────────────────────────────────────────

export type ExecutionState =
  | "CLAIMED"
  | "STARTED"
  | "SUCCEEDED"
  | "FAILED"
  | "RECOVERY_REQUIRED"

export type ApprovalExecutionRecord = {
  executionId: string
  approvalId: string
  approvalVersion: number
  requestHash: string

  state: ExecutionState

  effectReceiptHash?: string
  createdAt: string
  updatedAt: string
}

// ─── Execution Binding ──────────────────────────────────────────────

/**
 * Unique binding that prevents replay and duplicate effects.
 * The executor must reject reuse of the same binding.
 */
export type ApprovalExecutionBinding = {
  approvalId: string
  approvalVersion: number
  executionId: string
  requestHash: string
}

// ─── Outbox Event ───────────────────────────────────────────────────

export type ApprovalOutboxEvent = {
  eventId: string
  approvalId: string
  kind: string
  timestamp: string
  detail: Record<string, unknown>
  status: "PENDING" | "CLAIMED" | "DELIVERED" | "POISONED"
}

/**
 * One atomic lifecycle transition: the approval record, the optional
 * execution record, and the authoritative outbox event commit or roll back
 * together. A state transition must never become visible without its
 * corresponding event.
 */
export type ApprovalTransition = {
  approval: ApprovalRecord
  execution?: ApprovalExecutionRecord
  event: ApprovalOutboxEvent
}

/**
 * Deterministic outbox event identity (ARC-REV-004).
 *
 * The identity derives only from the durable transition: transition kind,
 * approval id, and the resulting approval version. Replaying the same
 * transition reproduces the same id, different transitions cannot collide
 * (version is monotonic per approval), and replay never depends on wall-clock
 * time or randomness. The outbox treats the id as the dedupe key: a retried
 * transition resolves to the same event or is deterministically rejected.
 */
export function transitionEventId(kind: string, approvalId: string, version: number): string {
  return `evt-${kind}-${approvalId}-v${version}`
}

// ─── Command Types ──────────────────────────────────────────────────

export type ApprovalCommand =
  | {
      kind: "APPROVE"
      approvalId: string
      requestHash: string
      contractRevision: number
      operatorId: string
      sessionId: string
      workspaceId: string
    }
  | {
      kind: "DENY"
      approvalId: string
      operatorId: string
      sessionId: string
      workspaceId: string
    }
  | {
      kind: "REVOKE"
      approvalId: string
      operatorId: string
      sessionId: string
      workspaceId: string
    }
  | {
      kind: "CLAIM"
      approvalId: string
      executionId: string
      requestHash: string
    }
  | {
      kind: "CONSUME"
      approvalId: string
      executionId: string
      effectReceiptHash: string
    }

export type ApprovalCommandResult = {
  success: boolean
  reason: string
  approval?: ApprovalRecord
  execution?: ApprovalExecutionRecord
}

// ─── Operator Identity ──────────────────────────────────────────────

/**
 * Authenticated operator identity.
 * MUST come from the authenticated local runtime, NOT from the UI panel.
 *
 * Invariant: CommandOperator = AuthenticatedOperator
 */
export type AuthenticatedOperator = {
  operatorId: string
  authenticatedAt: string
  roles: readonly string[]
  workspaceScope: readonly string[]
}

// ─── Approval Lifecycle Service ─────────────────────────────────────

export interface ApprovalLifecycleStore {
  loadApproval(approvalId: string): ApprovalRecord | null
  saveApproval(record: ApprovalRecord): void
  loadExecution(approvalId: string): ApprovalExecutionRecord | null
  saveExecution(record: ApprovalExecutionRecord): void
  appendOutboxEvent(event: ApprovalOutboxEvent): void
  /**
   * Commit approval state, optional execution state, and the authoritative
   * outbox event in one store-level transaction. Implementations must roll
   * back every record when any statement fails.
   */
  commitTransition(transition: ApprovalTransition): void
  loadPendingApprovals(sessionId: string): ApprovalRecord[]
}

/**
 * Pure approval lifecycle processor.
 *
 * All mutations are pure state transitions.
 * The store adapter handles persistence and outbox.
 */
export function processApprovalCommand(
  command: ApprovalCommand,
  store: ApprovalLifecycleStore,
  authenticatedOperator: AuthenticatedOperator,
  now: Date,
): ApprovalCommandResult {
  const nowIso = now.toISOString()

  switch (command.kind) {
    case "APPROVE":
      return handleApprove(command, store, authenticatedOperator, now, nowIso)
    case "DENY":
      return handleDeny(command, store, authenticatedOperator, now, nowIso)
    case "REVOKE":
      return handleRevoke(command, store, authenticatedOperator, now, nowIso)
    case "CLAIM":
      return handleClaim(command, store, now, nowIso)
    case "CONSUME":
      return handleConsume(command, store, now, nowIso)
  }
}

function handleApprove(
  command: Extract<ApprovalCommand, { kind: "APPROVE" }>,
  store: ApprovalLifecycleStore,
  operator: AuthenticatedOperator,
  now: Date,
  nowIso: string,
): ApprovalCommandResult {
  // Existing-record-only invariant: a decision can never fabricate the durable
  // object it is supposed to decide. Approval creation happens only in the
  // PDP/approval-required path with the canonical request persisted first.
  const record = store.loadApproval(command.approvalId)
  if (!record) {
    return { success: false, reason: "approval not found" }
  }

  // Must be PENDING to approve
  if (record.state !== "PENDING") {
    return {
      success: false,
      reason: `approval ${record.approvalId} is ${record.state}, not PENDING — ALREADY_DECIDED`,
    }
  }

  // Verify operator is authorized for this workspace
  if (!operator.workspaceScope.includes(record.workspaceId) && !operator.workspaceScope.includes("*")) {
    return {
      success: false,
      reason: `operator ${operator.operatorId} not authorized for workspace ${record.workspaceId}`,
    }
  }

  // Verify not expired
  if (new Date(record.expiresAt).getTime() < now.getTime()) {
    const expired: ApprovalRecord = {
      ...record,
      version: record.version + 1,
      state: "EXPIRED",
      updatedAt: nowIso,
    }
    store.commitTransition({
      approval: expired,
      event: {
        eventId: transitionEventId("APPROVAL_EXPIRED", command.approvalId, expired.version),
        approvalId: command.approvalId,
        kind: "APPROVAL_EXPIRED",
        timestamp: nowIso,
        detail: { decision: "EXPIRED", operatorId: operator.operatorId },
        status: "PENDING",
      },
    })
    return {
      success: false,
      reason: "approval expired",
      approval: expired,
    }
  }

  // CAS: atomic state transition
  const next: ApprovalRecord = {
    ...record,
    version: record.version + 1,
    state: "APPROVED",
    approvedBy: operator.operatorId,
    updatedAt: nowIso,
  }

  // State and authoritative event commit atomically.
  store.commitTransition({
    approval: next,
    event: {
      eventId: transitionEventId("APPROVAL_DECIDED", command.approvalId, next.version),
      approvalId: command.approvalId,
      kind: "APPROVAL_DECIDED",
      timestamp: nowIso,
      detail: {
        decision: "APPROVED",
        operatorId: operator.operatorId,
        requestHash: command.requestHash,
        contractRevision: command.contractRevision,
      },
      status: "PENDING",
    },
  })

  return {
    success: true,
    reason: "approved",
    approval: next,
  }
}

function handleDeny(
  command: Extract<ApprovalCommand, { kind: "DENY" }>,
  store: ApprovalLifecycleStore,
  operator: AuthenticatedOperator,
  now: Date,
  nowIso: string,
): ApprovalCommandResult {
  const record = store.loadApproval(command.approvalId)

  if (!record) {
    return { success: false, reason: "approval not found" }
  }

  if (record.state !== "PENDING") {
    return {
      success: false,
      reason: `approval ${record.approvalId} is ${record.state}, not PENDING — ALREADY_DECIDED`,
    }
  }

  // Verify operator authorization
  if (!operator.workspaceScope.includes(record.workspaceId) && !operator.workspaceScope.includes("*")) {
    return {
      success: false,
      reason: `operator ${operator.operatorId} not authorized for workspace ${record.workspaceId}`,
    }
  }

  const next: ApprovalRecord = {
    ...record,
    version: record.version + 1,
    state: "DENIED",
    approvedBy: operator.operatorId,
    updatedAt: nowIso,
  }

  store.commitTransition({
    approval: next,
    event: {
      eventId: transitionEventId("APPROVAL_DECIDED", command.approvalId, next.version),
      approvalId: command.approvalId,
      kind: "APPROVAL_DECIDED",
      timestamp: nowIso,
      detail: {
        decision: "DENIED",
        operatorId: operator.operatorId,
      },
      status: "PENDING",
    },
  })

  return {
    success: true,
    reason: "denied",
    approval: next,
  }
}

function handleRevoke(
  command: Extract<ApprovalCommand, { kind: "REVOKE" }>,
  store: ApprovalLifecycleStore,
  operator: AuthenticatedOperator,
  now: Date,
  nowIso: string,
): ApprovalCommandResult {
  const record = store.loadApproval(command.approvalId)

  if (!record) {
    return { success: false, reason: "approval not found" }
  }

  // Revocation is only meaningful while the approval is still pending or
  // approved but not yet claimed. A claimed approval is bound to an execution
  // in progress and must not be revoked mid-flight.
  if (record.state !== "PENDING" && record.state !== "APPROVED") {
    return {
      success: false,
      reason: `approval ${record.approvalId} is ${record.state}, not PENDING or APPROVED`,
    }
  }

  // Verify operator authorization
  if (!operator.workspaceScope.includes(record.workspaceId) && !operator.workspaceScope.includes("*")) {
    return {
      success: false,
      reason: `operator ${operator.operatorId} not authorized for workspace ${record.workspaceId}`,
    }
  }

  const next: ApprovalRecord = {
    ...record,
    version: record.version + 1,
    state: "INVALIDATED",
    revokedBy: operator.operatorId,
    updatedAt: nowIso,
  }

  store.commitTransition({
    approval: next,
    event: {
      eventId: transitionEventId("APPROVAL_REVOKED", command.approvalId, next.version),
      approvalId: command.approvalId,
      kind: "APPROVAL_REVOKED",
      timestamp: nowIso,
      detail: {
        decision: "REVOKED",
        operatorId: operator.operatorId,
        previousState: record.state,
      },
      status: "PENDING",
    },
  })

  return {
    success: true,
    reason: "revoked",
    approval: next,
  }
}

function handleClaim(
  command: Extract<ApprovalCommand, { kind: "CLAIM" }>,
  store: ApprovalLifecycleStore,
  now: Date,
  nowIso: string,
): ApprovalCommandResult {
  const record = store.loadApproval(command.approvalId)

  if (!record) {
    return { success: false, reason: "approval not found" }
  }

  // Must be APPROVED to claim
  if (record.state !== "APPROVED") {
    return {
      success: false,
      reason: `approval is ${record.state}, not APPROVED`,
    }
  }

  // Verify request hash matches (request hasn't changed)
  if (record.requestHash !== command.requestHash) {
    return {
      success: false,
      reason: "request changed after approval — STALE",
    }
  }

  // Verify not expired
  if (new Date(record.expiresAt).getTime() < now.getTime()) {
    const expired: ApprovalRecord = {
      ...record,
      version: record.version + 1,
      state: "EXPIRED",
      updatedAt: nowIso,
    }
    store.commitTransition({
      approval: expired,
      event: {
        eventId: transitionEventId("APPROVAL_EXPIRED", command.approvalId, expired.version),
        approvalId: command.approvalId,
        kind: "APPROVAL_EXPIRED",
        timestamp: nowIso,
        detail: { decision: "EXPIRED" },
        status: "PENDING",
      },
    })
    return { success: false, reason: "approval expired before claim" }
  }

  // CAS: atomic claim transition
  const claimed: ApprovalRecord = {
    ...record,
    version: record.version + 1,
    state: "CLAIMED",
    executionId: command.executionId,
    updatedAt: nowIso,
  }
  const execution: ApprovalExecutionRecord = {
    executionId: command.executionId,
    approvalId: command.approvalId,
    approvalVersion: claimed.version,
    requestHash: command.requestHash,
    state: "CLAIMED",
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  store.commitTransition({
    approval: claimed,
    execution,
    event: {
      eventId: transitionEventId("APPROVAL_CLAIMED", command.approvalId, claimed.version),
      approvalId: command.approvalId,
      kind: "APPROVAL_CLAIMED",
      timestamp: nowIso,
      detail: {
        executionId: command.executionId,
        requestHash: command.requestHash,
      },
      status: "PENDING",
    },
  })

  return {
    success: true,
    reason: "claimed",
    approval: claimed,
    execution,
  }
}

function handleConsume(
  command: Extract<ApprovalCommand, { kind: "CONSUME" }>,
  store: ApprovalLifecycleStore,
  now: Date,
  nowIso: string,
): ApprovalCommandResult {
  const record = store.loadApproval(command.approvalId)

  if (!record) {
    return { success: false, reason: "approval not found" }
  }

  // Must be CLAIMED to consume
  if (record.state !== "CLAIMED") {
    return {
      success: false,
      reason: `approval is ${record.state}, not CLAIMED`,
    }
  }

  // Verify executionId matches
  if (record.executionId !== command.executionId) {
    return {
      success: false,
      reason: "executionId mismatch — wrong execution claiming consumption",
    }
  }

  // CAS: atomic consume transition
  const consumed: ApprovalRecord = {
    ...record,
    version: record.version + 1,
    state: "CONSUMED",
    updatedAt: nowIso,
  }
  // Update execution record
  const execution = store.loadExecution(command.approvalId)
  const updatedExec: ApprovalExecutionRecord | undefined = execution
    ? {
        ...execution,
        state: "SUCCEEDED",
        effectReceiptHash: command.effectReceiptHash,
        updatedAt: nowIso,
      }
    : undefined

  store.commitTransition({
    approval: consumed,
    execution: updatedExec,
    event: {
      eventId: transitionEventId("APPROVAL_CONSUMED", command.approvalId, consumed.version),
      approvalId: command.approvalId,
      kind: "APPROVAL_CONSUMED",
      timestamp: nowIso,
      detail: {
        executionId: command.executionId,
        effectReceiptHash: command.effectReceiptHash,
      },
      status: "PENDING",
    },
  })

  return {
    success: true,
    reason: "consumed",
    approval: consumed,
  }
}

// ─── In-Memory Store (test adapter) ─────────────────────────────────

export class InMemoryApprovalStore implements ApprovalLifecycleStore {
  private approvals = new Map<string, ApprovalRecord>()
  private executions = new Map<string, ApprovalExecutionRecord>()
  private outbox: ApprovalOutboxEvent[] = []

  loadApproval(approvalId: string): ApprovalRecord | null {
    return this.approvals.get(approvalId) ?? null
  }

  saveApproval(record: ApprovalRecord): void {
    this.approvals.set(record.approvalId, { ...record })
  }

  loadExecution(approvalId: string): ApprovalExecutionRecord | null {
    return this.executions.get(approvalId) ?? null
  }

  saveExecution(record: ApprovalExecutionRecord): void {
    this.executions.set(record.approvalId, { ...record })
  }

  appendOutboxEvent(event: ApprovalOutboxEvent): void {
    this.outbox.push({ ...event })
  }

  commitTransition(transition: ApprovalTransition): void {
    this.approvals.set(transition.approval.approvalId, { ...transition.approval })
    if (transition.execution) {
      this.executions.set(transition.execution.approvalId, { ...transition.execution })
    }
    this.outbox.push({ ...transition.event })
  }

  loadPendingApprovals(sessionId: string): ApprovalRecord[] {
    return [...this.approvals.values()].filter(
      r => r.sessionId === sessionId && r.state === "PENDING",
    )
  }

  getOutboxEvents(): ApprovalOutboxEvent[] {
    return [...this.outbox]
  }

  getOutboxStats(): { pending: number; claimed: number; delivered: number; poisoned: number } {
    return {
      pending: this.outbox.filter(e => e.status === "PENDING").length,
      claimed: this.outbox.filter(e => e.status === "CLAIMED").length,
      delivered: this.outbox.filter(e => e.status === "DELIVERED").length,
      poisoned: this.outbox.filter(e => e.status === "POISONED").length,
    }
  }
}
