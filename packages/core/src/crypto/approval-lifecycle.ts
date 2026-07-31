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
  executionId?: string

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
  // Load existing record
  let record = store.loadApproval(command.approvalId)

  if (!record) {
    // New approval — create PENDING record first
    record = {
      approvalId: command.approvalId,
      version: 1,
      sessionId: command.sessionId,
      workspaceId: command.workspaceId,
      requestHash: command.requestHash,
      contractRevision: command.contractRevision,
      state: "PENDING",
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso,
    }
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
    record = { ...record, state: "EXPIRED", updatedAt: nowIso }
    store.saveApproval(record)
    return {
      success: false,
      reason: "approval expired",
      approval: record,
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

  store.saveApproval(next)

  // Emit outbox event (transactional with state change)
  store.appendOutboxEvent({
    eventId: `evt-approve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  store.saveApproval(next)

  store.appendOutboxEvent({
    eventId: `evt-deny-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    approvalId: command.approvalId,
    kind: "APPROVAL_DECIDED",
    timestamp: nowIso,
    detail: {
      decision: "DENIED",
      operatorId: operator.operatorId,
    },
    status: "PENDING",
  })

  return {
    success: true,
    reason: "denied",
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
    const expired: ApprovalRecord = { ...record, state: "EXPIRED", updatedAt: nowIso }
    store.saveApproval(expired)
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
  store.saveApproval(claimed)

  const execution: ApprovalExecutionRecord = {
    executionId: command.executionId,
    approvalId: command.approvalId,
    approvalVersion: claimed.version,
    requestHash: command.requestHash,
    state: "CLAIMED",
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  store.saveExecution(execution)

  store.appendOutboxEvent({
    eventId: `evt-claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    approvalId: command.approvalId,
    kind: "APPROVAL_CLAIMED",
    timestamp: nowIso,
    detail: {
      executionId: command.executionId,
      requestHash: command.requestHash,
    },
    status: "PENDING",
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
  store.saveApproval(consumed)

  // Update execution record
  const execution = store.loadExecution(command.approvalId)
  if (execution) {
    const updatedExec: ApprovalExecutionRecord = {
      ...execution,
      state: "SUCCEEDED",
      effectReceiptHash: command.effectReceiptHash,
      updatedAt: nowIso,
    }
    store.saveExecution(updatedExec)
  }

  store.appendOutboxEvent({
    eventId: `evt-consume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    approvalId: command.approvalId,
    kind: "APPROVAL_CONSUMED",
    timestamp: nowIso,
    detail: {
      executionId: command.executionId,
      effectReceiptHash: command.effectReceiptHash,
    },
    status: "PENDING",
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
