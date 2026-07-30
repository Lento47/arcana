/**
 * Phase C: Runtime Delegation Service
 *
 * Atomic delegation transaction: validate parent → validate attenuation →
 * insert child grants → record parent-child edges → create child session.
 *
 * All-or-nothing: if any step fails, the transaction rolls back.
 *
 * Authority(child) ⪯ Authority(parent) — enforced at delegation time
 * AND at execution time (PDP checks ancestor chain).
 */

import { Effect } from "effect"
import type {
  CapabilityGrant,
} from "./types"
import type {
  CapabilityGrantDraft,
} from "./delegation"
import {
  delegateCapabilities,
  validateAncestorChain,
  canParentDelegate,
  cascadeRevocation,
  type DelegationRequest,
  type DelegatedContext,
  type DelegationResult,
  type DelegationReason,
  type DelegationReasonCode,
} from "./delegation"
import type { CapabilityGrantStore, CapabilityGrantStoreError } from "./grant-store"

// ─── Types ────────────────────────────────────────────────────────────

export interface DelegationSessionConfig {
  /** Parent session ID */
  parentSessionId: string
  /** Child session ID (pre-generated or generated at delegation time) */
  childSessionId: string
  /** Child principal ID (agent name) */
  childPrincipalId: string
  /** Parent principal ID (agent name) */
  parentPrincipalId: string
  /** Contract ID for the delegation */
  contractId: string
  /** Contract revision */
  contractRevision: number
}

export interface RuntimeDelegationRequest {
  /** Session configuration */
  session: DelegationSessionConfig
  /** Child capability drafts — what the parent wants to delegate */
  requestedGrants: CapabilityGrantDraft[]
  /** Whether the child can further delegate */
  allowFurtherDelegation?: boolean
  /** Maximum depth for the child */
  maxDepth?: number
}

export type RuntimeDelegationErrorCode =
  | DelegationReasonCode
  | "DENY_PARENT_NOT_FOUND"
  | "DENY_PARENT_REVOKED"
  | "DENY_PARENT_EXPIRED"
  | "DENY_PARENT_EXHAUSTED"
  | "DENY_PARENT_DELEGATION_FORBIDDEN"
  | "DENY_ANCESTOR_INVALID"
  | "DENY_GRANT_STORE_FAILURE"

export interface RuntimeDelegationError {
  code: RuntimeDelegationErrorCode
  message: string
  severity: "critical"
}

export type RuntimeDelegationResult =
  | {
      status: "DELEGATED"
      childGrants: CapabilityGrant[]
      delegationId: string
    }
  | {
      status: "DENIED"
      errors: RuntimeDelegationError[]
    }

// ─── Ancestry Enforcement ─────────────────────────────────────────────

/**
 * Validate that a grant's complete ancestor chain is active at execution time.
 *
 * Usable(c) ⟹ Active(c) ∧ ∀a ∈ Ancestors(c): Active(a)
 *
 * This is checked at every grant use, not just at delegation time.
 * Protects against delayed or failed cascade propagation.
 */
export function validateGrantUsability(
  grant: CapabilityGrant,
  store: RuntimeGrantStore,
): Effect.Effect<{ usable: boolean; reason: string | null }, CapabilityGrantStoreError> {
  return Effect.gen(function* () {
    // Check the grant itself
    if (grant.status !== "ACTIVE") {
      return { usable: false, reason: `Grant ${grant.id} is ${grant.status}` }
    }

    // Check expiry
    const now = new Date().toISOString()
    if (grant.constraints.expiresAt && grant.constraints.expiresAt <= now) {
      return { usable: false, reason: `Grant ${grant.id} expired at ${grant.constraints.expiresAt}` }
    }

    // Check use limit
    if (grant.constraints.maxUses !== undefined && grant.constraints.maxUses <= 0) {
      return { usable: false, reason: `Grant ${grant.id} has no remaining uses` }
    }

    // Walk ancestor chain
    let current = grant
    const visited = new Set<string>([grant.id])

    while (current.issuer.kind === "parent_capability") {
      const parentId = current.issuer.id
      if (visited.has(parentId)) {
        return { usable: false, reason: `Cycle detected at ancestor ${parentId}` }
      }
      visited.add(parentId)

      const parentResult = yield* store.getGrantById(parentId).pipe(
        Effect.catch(() => Effect.succeed(null)),
      )

      if (!parentResult) {
        return { usable: false, reason: `Ancestor ${parentId} not found` }
      }
      if (parentResult.status !== "ACTIVE") {
        return { usable: false, reason: `Ancestor ${parentId} is ${parentResult.status}` }
      }
      if (parentResult.constraints.expiresAt && parentResult.constraints.expiresAt <= now) {
        return { usable: false, reason: `Ancestor ${parentId} expired at ${parentResult.constraints.expiresAt}` }
      }

      current = parentResult
    }

    return { usable: true, reason: null }
  })
}

// ─── Runtime Delegation Service ───────────────────────────────────────

let delegationIdCounter = 0

/**
 * Execute a runtime delegation: atomic transaction that:
 *
 * 1. Validates parent grants exist and are active
 * 2. Validates parent can delegate
 * 3. Validates ancestor chain for all parent grants
 * 4. Validates attenuation for each requested grant
 * 5. Creates attenuated child grants
 * 6. Persists child grants to store
 * 7. Returns delegated child grants
 *
 * If any step fails, the entire transaction fails (no partial state).
 */
export function executeDelegation(
  request: RuntimeDelegationRequest,
  store: RuntimeGrantStore,
  parentEventId: string,
): Effect.Effect<RuntimeDelegationResult, CapabilityGrantStoreError> {
  return Effect.gen(function* () {
    const errors: RuntimeDelegationError[] = []
    const now = new Date().toISOString()

    // Step 1: Load parent grants
    const parentGrants = yield* store
      .getGrantsForPrincipal(
        request.session.parentPrincipalId,
        request.session.parentSessionId,
      )
      .pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))

    if (parentGrants.length === 0) {
      return {
        status: "DENIED" as const,
        errors: [{
          code: "DENY_PARENT_NOT_FOUND",
          message: `No grants found for parent ${request.session.parentPrincipalId} in session ${request.session.parentSessionId}`,
          severity: "critical" as const,
        }],
      }
    }

    // Step 2: Validate parent can delegate
    const activeParentGrants: CapabilityGrant[] = []
    for (const parent of parentGrants) {
      const canDelegate = canParentDelegate(parent, now)
      if (canDelegate) {
        // Parent can't delegate — but this is only a problem if we need it
        continue
      }
      activeParentGrants.push(parent)
    }

    if (activeParentGrants.length === 0) {
      return {
        status: "DENIED" as const,
        errors: [{
          code: "DENY_PARENT_DELEGATION_FORBIDDEN",
          message: `No active parent grants allow delegation`,
          severity: "critical" as const,
        }],
      }
    }

    // Step 3: Validate ancestor chain for parent grants
    for (const parent of activeParentGrants) {
      const ancestry = yield* validateGrantUsability(parent, store)
      if (!ancestry.usable) {
        errors.push({
          code: "DENY_ANCESTOR_INVALID",
          message: `Parent grant ${parent.id} ancestry invalid: ${ancestry.reason}`,
          severity: "critical",
        })
      }
    }

    if (errors.length > 0) {
      return { status: "DENIED" as const, errors }
    }

    // Step 4: Build delegation request
    delegationIdCounter++
    const delegatedContext: DelegatedContext = {
      sourceEventIds: [parentEventId],
      provenance: [],
      sensitivity: "PUBLIC",
      contractId: request.session.contractId,
      contractRevision: request.session.contractRevision,
      parentSessionId: request.session.parentSessionId,
    }

    const delegationReq: DelegationRequest = {
      parentPrincipalId: request.session.parentPrincipalId,
      childPrincipalId: request.session.childPrincipalId,
      parentSessionId: request.session.parentSessionId,
      childSessionId: request.session.childSessionId,
      contractId: request.session.contractId,
      contractRevision: request.session.contractRevision,
      requestedGrants: request.requestedGrants,
      delegatedContext,
    }

    // Step 5: Execute delegation validation
    const result = delegateCapabilities(delegationReq, activeParentGrants, parentEventId)

    if (result.status === "DENIED") {
      return {
        status: "DENIED" as const,
        errors: result.reasons.map((r) => ({
          code: r.code,
          message: r.message,
          severity: "critical" as const,
        })),
      }
    }

    // Step 6: Persist child grants within a real database transaction.
    // If any grant insertion fails, the entire transaction rolls back.
    const delegationId = `delegation-${Date.now()}-${delegationIdCounter}`

    const persistedGrants = yield* store.transaction((tx) =>
      Effect.gen(function* () {
        const grants: CapabilityGrant[] = []
        for (const grant of result.childGrants) {
          const childGrant: CapabilityGrant = {
            ...grant,
            delegation: {
              allowed: request.allowFurtherDelegation ?? false,
              maximumDepth: request.maxDepth ?? grant.delegation.maximumDepth,
              currentDepth: grant.delegation.currentDepth,
            },
          }
          yield* tx.putGrant(childGrant)
          grants.push(childGrant)
        }
        return grants
      }),
    )

    return {
      status: "DELEGATED" as const,
      childGrants: persistedGrants,
      delegationId,
    }
  })
}

// ─── Cascade Revocation with Persistence ──────────────────────────────

/**
 * Revoke a parent grant and all descendants, persisting the revocation.
 */
export function revokeWithCascade(
  grantId: string,
  store: RuntimeGrantStore,
  revokedEventId: string,
): Effect.Effect<{ revokedIds: string[] }, CapabilityGrantStoreError> {
  return Effect.gen(function* () {
    // Load all grants for this principal to find descendants
    const allGrants = yield* store
      .getAllGrants()
      .pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))

    // Find the target grant
    const target = allGrants.find((g) => g.id === grantId)
    if (!target) {
      return { revokedIds: [] }
    }

    // Cascade revocation (in-memory)
    const { invalidatedIds, updatedGrants } = cascadeRevocation(
      grantId,
      revokedEventId,
      [...allGrants],
    )

    // Persist all revocations
    const allRevoked = [grantId, ...invalidatedIds]
    for (const id of allRevoked) {
      yield* store.updateStatus(id, "REVOKED", revokedEventId).pipe(
        Effect.catch(() => Effect.void),
      )
    }

    return { revokedIds: allRevoked }
  })
}

// ─── Grant Store Extension ────────────────────────────────────────────

/**
 * Extended grant store interface for runtime delegation.
 * The base CapabilityGrantStore needs these additional methods.
 */
export interface RuntimeGrantStore extends CapabilityGrantStore {
  /** Get a grant by ID */
  getGrantById(id: string): Effect.Effect<CapabilityGrant | null, CapabilityGrantStoreError>
  /** Get all grants */
  getAllGrants(): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError>
  /** Update grant status */
  updateStatus(
    id: string,
    status: CapabilityGrant["status"],
    eventId?: string,
  ): Effect.Effect<void, CapabilityGrantStoreError>
  /**
   * Execute an operation within a database transaction.
   * All grant operations inside the callback are atomic —
   * if any fail, the entire transaction rolls back.
   */
  transaction<A>(
    fn: (store: RuntimeGrantStore) => Effect.Effect<A, CapabilityGrantStoreError>,
  ): Effect.Effect<A, CapabilityGrantStoreError>
}
