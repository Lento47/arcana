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
 *     ∧ approval.usesConsumed < approval.maxUses
 *     ∧ now < approval.expiresAt
 *
 * Changing any field requires another approval:
 *   Principal, Resource, Arguments, Working directory,
 *   Destination, Secret, Contract, Session, Policy version
 */

import { Effect } from "effect"
import type {
  CapabilityAction,
  CanonicalResource,
  CapabilityGrant,
} from "./types"
import type { ApprovalRoute } from "../crypto/approval-routing"
import type { RiskClass } from "./types"
import { POLICY_VERSION } from "./types"
import { computeRequestHash } from "./request-hash"
import type { AuthorizationRequest } from "./types"
import type { ApprovalRequestSnapshot } from "../crypto/approval-request-snapshot"

// ─── Types ────────────────────────────────────────────────────────────

export type ScopedApprovalDecision = "PENDING" | "APPROVED" | "CLAIMED" | "CONSUMED" | "REJECTED" | "EXPIRED" | "RECOVERY_REQUIRED"

export interface ScopedApproval {
  readonly id: string
  readonly requestId: string
  readonly requestHash: string

  readonly principalId: string
  readonly sessionId: string
  /** Session that spawned this approval's session (subagent delegation). */
  readonly parentSessionId?: string
  readonly contractId?: string
  readonly contractRevision?: number

  readonly decision: ScopedApprovalDecision

  readonly actions: readonly CapabilityAction[]
  readonly resource: CanonicalResource

  readonly capabilityId?: string
  readonly maxUses: 1
  readonly usesConsumed: 0 | 1
  readonly expiresAt: string

  readonly createdEventId: string
  readonly decidedEventId?: string
  readonly claimedEventId?: string
  readonly consumedEventId?: string

  /**
   * Idempotency key for crash recovery.
   * k = H(approvalId ∥ executionId ∥ sessionId ∥ requestHash)
   * Used to prevent duplicate execution after crash.
   */
  readonly idempotencyKey?: string

  /**
   * Execution ID that claimed this approval.
   * Binds the claim to exactly one execution attempt.
   * UsableClaim(a,e,q) ⟺ a.status=CLAIMED ∧ a.claimExecutionId=e.id
   */
  readonly claimExecutionId?: string

  /**
   * Lease expiration for the claim.
   * If the claim is not consumed before this time, it becomes RECOVERY_REQUIRED.
   */
  readonly leaseExpiresAt?: string

  /**
   * Advisory routing metadata (Phase D). The routing decision only selects
   * the operator surface; it never affects the PDP/PEP.
   */
  readonly route?: ApprovalRoute
  readonly routingPolicyVersion?: string
  readonly localFallbackAllowed?: boolean
  readonly riskClass?: RiskClass
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

// ─── Store Error ──────────────────────────────────────────────────────

export class ScopedApprovalStoreError {
  readonly _tag = "ScopedApprovalStoreError" as const
  constructor(readonly operation: string, readonly cause: unknown) {}
}

// ─── Store Interface (Effect-native) ──────────────────────────────────

export interface ScopedApprovalStore {
  readonly getApproval: (id: string) => Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError>
  readonly getApprovalForRequest: (requestHash: string) => Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError>
  readonly putApproval: (approval: ScopedApproval) => Effect.Effect<void, ScopedApprovalStoreError>
  /**
   * Write the approval row and its immutable request snapshot atomically
   * (audit PR-2). Optional on the interface so legacy/alternate implementers
   * can keep writing approval rows without a snapshot; production stores that
   * back the operator surface implement it. Callers MUST feature-detect.
   */
  readonly putApprovalWithSnapshot?: (
    approval: ScopedApproval,
    snapshot: { request: AuthorizationRequest; args: unknown; snapshot: ApprovalRequestSnapshot },
  ) => Effect.Effect<void, ScopedApprovalStoreError>
  readonly updateApproval: (id: string, updates: Partial<ScopedApproval>) => Effect.Effect<void, ScopedApprovalStoreError>
  /** Return all approvals for snapshot-time pre-computation. */
  readonly allApprovals: () => Effect.Effect<readonly ScopedApproval[], ScopedApprovalStoreError>
  /**
   * Atomically claim an APPROVED approval, binding it to a specific execution.
   * Returns the claimed approval, or null if the claim failed
   * (already claimed/consumed/expired/wrong state).
   *
   * The atomicity guarantee: exactly one caller can successfully claim
   * a given approval. For InMemory, this is single-threaded atomicity.
   * For SQLite, this uses UPDATE ... WHERE status = 'APPROVED'.
   */
  readonly atomicClaim: (
    id: string,
    executionId: string,
    claimedEventId: string,
    now: string,
    leaseSeconds?: number,
  ) => Effect.Effect<ScopedApproval | null, ScopedApprovalStoreError>
}

// ─── In-Memory Store ──────────────────────────────────────────────────

export class InMemoryScopedApprovalStore implements ScopedApprovalStore {
  private approvals = new Map<string, ScopedApproval>()
  private snapshots = new Map<
    string,
    { request: AuthorizationRequest; args: unknown; snapshot: ApprovalRequestSnapshot }
  >()

  /** Read the raw stored snapshot payload (test/observer seam). */
  getStoredSnapshot(approvalId: string) {
    return this.snapshots.get(approvalId)
  }

  getApproval(id: string): Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError> {
    return Effect.succeed(this.approvals.get(id))
  }

  getApprovalForRequest(requestHash: string): Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError> {
    for (const a of this.approvals.values()) {
      if (a.requestHash === requestHash) return Effect.succeed(a)
    }
    return Effect.succeed(undefined)
  }

  putApproval(approval: ScopedApproval): Effect.Effect<void, ScopedApprovalStoreError> {
    this.approvals.set(approval.id, approval)
    return Effect.void
  }

  putApprovalWithSnapshot(
    approval: ScopedApproval,
    snapshot: { request: AuthorizationRequest; args: unknown; snapshot: ApprovalRequestSnapshot },
  ): Effect.Effect<void, ScopedApprovalStoreError> {
    this.approvals.set(approval.id, approval)
    this.snapshots.set(approval.id, snapshot)
    return Effect.void
  }

  updateApproval(id: string, updates: Partial<ScopedApproval>): Effect.Effect<void, ScopedApprovalStoreError> {
    const existing = this.approvals.get(id)
    if (existing) {
      this.approvals.set(id, { ...existing, ...updates } as ScopedApproval)
    }
    return Effect.void
  }

  allApprovals(): Effect.Effect<readonly ScopedApproval[], ScopedApprovalStoreError> {
    return Effect.succeed([...this.approvals.values()])
  }

  atomicClaim(
    id: string,
    executionId: string,
    claimedEventId: string,
    now: string,
    leaseSeconds: number = 300,
  ): Effect.Effect<ScopedApproval | null, ScopedApprovalStoreError> {
    // Single-threaded atomicity: read-check-write in one synchronous block
    const existing = this.approvals.get(id)
    if (!existing) return Effect.succeed(null)
    if (existing.decision !== "APPROVED") return Effect.succeed(null)
    if (existing.expiresAt <= now) return Effect.succeed(null)
    if (existing.usesConsumed >= 1) return Effect.succeed(null)

    const claimed = claimApproval(existing, claimedEventId, executionId, now, leaseSeconds)
    if (!claimed) return Effect.succeed(null)

    this.approvals.set(id, claimed)
    return Effect.succeed(claimed)
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
    usesConsumed: 0,
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
 * k = H(approvalId ∥ executionId ∥ sessionId ∥ requestHash)
 */
export function computeIdempotencyKey(
  approvalId: string,
  executionId: string,
  sessionId: string,
  requestHash: string,
): string {
  return `${approvalId}:${executionId}:${sessionId}:${requestHash}`
}

/**
 * Atomically claim an approved approval before execution.
 * Changes APPROVED → CLAIMED. Only one claim can succeed.
 *
 * The claim is bound to exactly one execution via executionId.
 * Returns null if the approval cannot be claimed (already claimed,
 * expired, etc.)
 */
export function claimApproval(
  approval: ScopedApproval,
  claimedEventId: string,
  executionId: string,
  now: string,
  leaseSeconds: number = 300,
): ScopedApproval | null {
  // Compile-time invariant: maxUses must be exactly 1
  if (approval.maxUses !== 1) return null

  // Must be APPROVED
  if (approval.decision !== "APPROVED") return null

  // Must not be expired
  if (approval.expiresAt <= now) return null

  // Must not already be consumed
  if (approval.usesConsumed >= 1) return null

  const idempotencyKey = computeIdempotencyKey(
    approval.id,
    executionId,
    approval.sessionId,
    approval.requestHash,
  )

  return {
    ...approval,
    decision: "CLAIMED",
    claimedEventId,
    claimExecutionId: executionId,
    leaseExpiresAt: new Date(Date.parse(now) + leaseSeconds * 1000).toISOString(),
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
  // Compile-time invariant: single-use only
  if (approval.maxUses !== 1) return null

  // Must be CLAIMED (not just APPROVED)
  if (approval.decision !== "CLAIMED") return null

  // Must not be expired
  if (approval.expiresAt <= now) return null

  // Must not already be consumed
  if (approval.usesConsumed >= 1) return null

  return {
    ...approval,
    decision: "CONSUMED",
    usesConsumed: 1,
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
  if (approval.usesConsumed >= 1) {
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
 *
 * Now Effect-returning. The snapshot builder resolves this eagerly.
 */
export function checkApprovedScope(
  request: AuthorizationRequest,
  store: ScopedApprovalStore,
  now: string,
): Effect.Effect<{ hasApproval: boolean; approval?: ScopedApproval; reason?: string }, ScopedApprovalStoreError> {
  return Effect.gen(function* () {
    const requestHash = computeRequestHash(request)
    const result = yield* store.getApprovalForRequest(requestHash)

    if (!result) {
      return { hasApproval: false, reason: "No approval found for this request" }
    }

    const approval = result
    const validation = validateApprovalMatch(approval, request, now)
    if (!validation.valid) {
      return { hasApproval: false, reason: validation.reason ?? "Approval invalid" }
    }

    return { hasApproval: true, approval }
  })
}

/**
 * Synchronous version of checkApprovedScope for backward compatibility.
 * Only works with synchronous stores (e.g. InMemoryScopedApprovalStore).
 */
export function checkApprovedScopeSync(
  request: AuthorizationRequest,
  store: ScopedApprovalStore,
  now: string,
): { hasApproval: boolean; approval?: ScopedApproval; reason?: string } | undefined {
  // For synchronous stores, we can run synchronously
  const program = checkApprovedScope(request, store, now)
  // This is intentionally synchronous for in-memory stores
  let result: { hasApproval: boolean; approval?: ScopedApproval; reason?: string } | undefined
  Effect.runFork(program).addObserver((exit) => {
    if (exit._tag === "Success") {
      result = exit.value
    }
  })
  return result
}
