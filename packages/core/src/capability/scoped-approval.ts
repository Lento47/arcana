/**
 * Phase C Task 15: Scoped Approvals
 *
 * Approval must not bypass the PDP. It creates a narrowly scoped,
 * single-use, expiring capability for the exact request.
 *
 * Core invariant:
 *   Execute(q) ⟹
 *     approval.requestHash = H(q)
 *     ∧ approval.principal = q.principal
 *     ∧ approval.status = ACTIVE
 *     ∧ approval.usesRemaining > 0
 *     ∧ now < approval.expiresAt
 *
 * Changing any field requires another approval:
 *   Principal, Resource, Arguments, Working directory,
 *   Destination, Secret, Contract, Session, Policy version
 */

import type {
  CapabilityAction,
  CanonicalResource,
  CapabilityGrant,
} from "./types"
import { POLICY_VERSION } from "./types"
import { computeRequestHash } from "./request-hash"
import type { AuthorizationRequest } from "./types"

// ─── Types ────────────────────────────────────────────────────────────

export type ScopedApprovalDecision = "PENDING" | "APPROVED" | "CLAIMED" | "CONSUMED" | "REJECTED" | "EXPIRED" | "RECOVERY_REQUIRED"

export interface ScopedApproval {
  readonly id: string
  readonly requestId: string
  readonly requestHash: string

  readonly principalId: string
  readonly sessionId: string
  readonly contractId?: string
  readonly contractRevision?: number

  readonly decision: ScopedApprovalDecision

  readonly actions: readonly CapabilityAction[]
  readonly resource: CanonicalResource

  readonly capabilityId?: string
  readonly maxUses: 1
  readonly expiresAt: string

  readonly createdEventId: string
  readonly decidedEventId?: string
  readonly claimedEventId?: string
  readonly consumedEventId?: string

  /**
   * Idempotency key for crash recovery.
   * k = H(approvalId ∥ sessionId ∥ requestHash)
   * Used to prevent duplicate execution after crash.
   */
  readonly idempotencyKey?: string
}

/**
 * Execution receipt for crash recovery.
 * Persisted before execution to prevent duplicate effects.
 */
export interface ApprovalExecutionReceipt {
  readonly idempotencyKey: string
  readonly approvalId: string
  readonly requestHash: string
  readonly status: "CLAIMED" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "UNKNOWN_AFTER_CRASH"
  readonly createdAt: string
  readonly completedAt?: string
}

// ─── Store Interface ──────────────────────────────────────────────────

export interface ScopedApprovalStore {
  getApproval(id: string): ScopedApproval | undefined | Promise<ScopedApproval | undefined>
  getApprovalForRequest(requestHash: string): ScopedApproval | undefined | Promise<ScopedApproval | undefined>
  putApproval(approval: ScopedApproval): void | Promise<void>
  updateApproval(id: string, updates: Partial<ScopedApproval>): void | Promise<void>
}

// ─── In-Memory Store ──────────────────────────────────────────────────

export class InMemoryScopedApprovalStore implements ScopedApprovalStore {
  private approvals = new Map<string, ScopedApproval>()

  getApproval(id: string): ScopedApproval | undefined {
    return this.approvals.get(id)
  }

  getApprovalForRequest(requestHash: string): ScopedApproval | undefined {
    for (const a of this.approvals.values()) {
      if (a.requestHash === requestHash) return a
    }
    return undefined
  }

  putApproval(approval: ScopedApproval): void {
    this.approvals.set(approval.id, approval)
  }

  updateApproval(id: string, updates: Partial<ScopedApproval>): void {
    const existing = this.approvals.get(id)
    if (existing) {
      this.approvals.set(id, { ...existing, ...updates } as ScopedApproval)
    }
  }
}

// ─── Approval Creation ────────────────────────────────────────────────

let approvalCounter = 0

/**
 * Create a pending scoped approval for a request that returned REQUIRE_APPROVAL.
 * The approval is PENDING until the user explicitly approves it.
 */
export function createPendingApproval(
  request: AuthorizationRequest,
  eventId: string,
  ttlSeconds: number = 3600,
): ScopedApproval {
  approvalCounter++
  return {
    id: `approval-${Date.now()}-${approvalCounter}`,
    requestId: request.requestId,
    requestHash: computeRequestHash(request),
    principalId: request.principalId,
    sessionId: request.sessionId,
    contractId: request.contractId,
    decision: "PENDING",
    actions: [request.action],
    resource: request.resource,
    maxUses: 1,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    createdEventId: eventId,
  }
}

// ─── Approval Decision ────────────────────────────────────────────────

/**
 * Approve a pending approval. Creates a single-use capability.
 * Returns the updated approval and the capability grant.
 *
 * The approval is bound to the EXACT request hash.
 * Changing any field invalidates the approval.
 */
export function approveRequest(
  approval: ScopedApproval,
  decidedEventId: string,
  ttlSeconds: number = 300,
): { approval: ScopedApproval; capability: CapabilityGrant } {
  const capabilityId = `approval-cap-${approval.id}`

  const updatedApproval: ScopedApproval = {
    ...approval,
    decision: "APPROVED",
    capabilityId,
    decidedEventId,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  }

  const capability: CapabilityGrant = {
    id: capabilityId,
    schemaVersion: "1",
    principal: { kind: "agent", id: approval.principalId },
    issuer: { kind: "approval", id: approval.id },
    actions: [...approval.actions],
    resources: [{ kind: approval.resource.kind, pattern: approval.resource.path ?? approval.resource.host ?? approval.resource.executable ?? approval.resource.secretKind ?? "*" }],
    constraints: {
      sessionId: approval.sessionId,
      contractId: approval.contractId,
      maxUses: 1,
      expiresAt: updatedApproval.expiresAt,
    },
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: decidedEventId,
  }

  return { approval: updatedApproval, capability }
}

// ─── Approval Consumption ─────────────────────────────────────────────

/**
 * Compute idempotency key for crash recovery.
 * k = H(approvalId ∥ sessionId ∥ requestHash)
 */
export function computeIdempotencyKey(
  approvalId: string,
  sessionId: string,
  requestHash: string,
): string {
  // Simple hash for now — in production, use a cryptographic hash
  return `${approvalId}:${sessionId}:${requestHash}`
}

/**
 * Atomically claim an approved approval before execution.
 * Changes APPROVED → CLAIMED. Only one claim can succeed.
 *
 * Returns null if the approval cannot be claimed (already claimed,
 * expired, etc.)
 */
export function claimApproval(
  approval: ScopedApproval,
  claimedEventId: string,
  now: string,
): ScopedApproval | null {
  // Must be APPROVED
  if (approval.decision !== "APPROVED") return null

  // Must not be expired
  if (approval.expiresAt <= now) return null

  // Must have uses remaining
  if (approval.maxUses <= 0) return null

  const idempotencyKey = computeIdempotencyKey(
    approval.id,
    approval.sessionId,
    approval.requestHash,
  )

  return {
    ...approval,
    decision: "CLAIMED",
    claimedEventId,
    idempotencyKey,
  }
}

/**
 * Consume a claimed approval after successful execution.
 * Changes CLAIMED → CONSUMED.
 *
 * Returns null if the approval cannot be consumed (not claimed, expired, etc.)
 */
export function consumeApproval(
  approval: ScopedApproval,
  consumedEventId: string,
  now: string,
): ScopedApproval | null {
  // Must be CLAIMED (not just APPROVED)
  if (approval.decision !== "CLAIMED") return null

  // Must not be expired
  if (approval.expiresAt <= now) return null

  // Must have uses remaining
  if (approval.maxUses <= 0) return null

  return {
    ...approval,
    decision: "CONSUMED",
    maxUses: 0,
    consumedEventId,
  }
}

/**
 * Mark a claimed approval as requiring recovery after a crash.
 * Changes CLAIMED → RECOVERY_REQUIRED.
 */
export function markRecoveryRequired(
  approval: ScopedApproval,
): ScopedApproval | null {
  if (approval.decision !== "CLAIMED") return null
  return {
    ...approval,
    decision: "RECOVERY_REQUIRED",
  }
}

/**
 * Check if an approval can be retried after recovery.
 * Only RECOVERY_REQUIRED approvals with valid expiry can be retried.
 */
export function canRetryAfterRecovery(
  approval: ScopedApproval,
  now: string,
): boolean {
  if (approval.decision !== "RECOVERY_REQUIRED") return false
  if (approval.expiresAt <= now) return false
  return true
}

// ─── Approval Validation ──────────────────────────────────────────────

export interface ApprovalValidationResult {
  readonly valid: boolean
  readonly reason: string | null
}

/**
 * Validate that an approval matches the current request exactly.
 * ANY mismatch invalidates the approval.
 */
export function validateApprovalMatch(
  approval: ScopedApproval,
  request: AuthorizationRequest,
  now: string,
): ApprovalValidationResult {
  // Must be APPROVED
  if (approval.decision !== "APPROVED") {
    return { valid: false, reason: `Approval is ${approval.decision}, not APPROVED` }
  }

  // Must not be expired
  if (approval.expiresAt <= now) {
    return { valid: false, reason: `Approval expired at ${approval.expiresAt}` }
  }

  // Must have uses remaining
  if (approval.maxUses <= 0) {
    return { valid: false, reason: "Approval has no uses remaining" }
  }

  // Exact request hash match
  const currentHash = computeRequestHash(request)
  if (approval.requestHash !== currentHash) {
    return { valid: false, reason: "DENY_REQUEST_HASH_MISMATCH" }
  }

  // Principal match
  if (approval.principalId !== request.principalId) {
    return { valid: false, reason: "Principal mismatch" }
  }

  // Session match
  if (approval.sessionId !== request.sessionId) {
    return { valid: false, reason: "Session mismatch" }
  }

  // Contract match
  if (approval.contractId !== request.contractId) {
    return { valid: false, reason: "Contract mismatch" }
  }

  // Action match
  if (!approval.actions.includes(request.action)) {
    return { valid: false, reason: "Action mismatch" }
  }

  // Resource match
  if (approval.resource.kind !== request.resource.kind) {
    return { valid: false, reason: "Resource kind mismatch" }
  }

  return { valid: true, reason: null }
}

// ─── PDP Integration ──────────────────────────────────────────────────

/**
 * Check if a request has a valid approved scope.
 * Used by the PDP to convert REQUIRE_APPROVAL to ALLOW when an approved scope exists.
 */
export function checkApprovedScope(
  request: AuthorizationRequest,
  store: ScopedApprovalStore,
  now: string,
): { hasApproval: boolean; approval?: ScopedApproval; reason?: string } {
  const requestHash = computeRequestHash(request)
  const approval = store.getApprovalForRequest(requestHash)

  if (!approval) {
    return { hasApproval: false, reason: "No approval found for this request" }
  }

  const validation = validateApprovalMatch(approval, request, now)
  if (!validation.valid) {
    return { hasApproval: false, reason: validation.reason ?? "Approval invalid" }
  }

  return { hasApproval: true, approval }
}
