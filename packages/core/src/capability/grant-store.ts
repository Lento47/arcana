/**
 * Phase C: Session-aware Policy Context Provider
 *
 * Fail-closed provider backed by persisted capability grants.
 * No grants → DENY. Missing storage → DENY. Unknown tool → DENY.
 *
 * The store interface returns Effects so the SQLite implementation
 * can compose directly with the Effect runtime — no nested
 * Effect.runPromise bridges.
 */

import { Effect } from "effect"
import type { PolicyContext, WorkspaceTrust, ApprovedRequestScope } from "./pdp"
import type { PolicyContextProvider } from "./pep"
import type { CapabilityGrant, IntentBinding, CapabilityStatus } from "./types"
import type { ScopedApproval, ScopedApprovalDecision } from "./scoped-approval"
import { POLICY_VERSION } from "./types"

// ─── Approved Scope Snapshot ──────────────────────────────────────────

/**
 * Serializable snapshot of an approved scope.
 * Pre-computed at snapshot time — the PDP receives this as pure data,
 * never calls a store.
 */
export interface ApprovedScopeSnapshot {
  readonly requestHash: string
  readonly approvalId: string
  readonly capabilityId?: string
  readonly principalId: string
  readonly sessionId: string
  readonly expiresAt: string
  readonly maxUses: number
  readonly status: ScopedApprovalDecision
}

// ─── Capability Grant Store (Effect-native) ──────────────────────────

export interface CapabilityGrantStoreError {
  readonly _tag: "CapabilityGrantStoreError"
  readonly cause: unknown
}

export function CapabilityGrantStoreError(cause: unknown): CapabilityGrantStoreError {
  return { _tag: "CapabilityGrantStoreError", cause }
}

/**
 * Abstract store interface for persisted capability grants.
 * All methods return Effects so implementations compose with the
 * Effect runtime without bridging.
 */
export interface CapabilityGrantStore {
  getGrantsForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError>

  getGrantsForWorkspace(
    workspaceId: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError>

  putGrant(
    grant: CapabilityGrant,
  ): Effect.Effect<void, CapabilityGrantStoreError>

  revokeGrant(
    grantId: string,
    revokedEventId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError>

  exhaustGrant(
    grantId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError>

  /** Get a single grant by ID. Returns null if not found. */
  getGrantById(
    grantId: string,
  ): Effect.Effect<CapabilityGrant | null, CapabilityGrantStoreError>

  /** Get all grants (for cascade operations). */
  getAllGrants(): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError>

  /** Update grant status atomically. */
  updateStatus(
    grantId: string,
    status: CapabilityStatus,
    eventId?: string,
  ): Effect.Effect<void, CapabilityGrantStoreError>

  /**
   * Atomically consume one use from a grant.
   * Returns true if the use was consumed, false if the grant has no remaining uses.
   * Uses SQL: UPDATE ... SET uses_consumed = uses_consumed + 1
   *   WHERE id = ? AND status = 'ACTIVE' AND uses_consumed < max_uses AND expires_at > now
   */
  tryConsumeUse(
    grantId: string,
    now: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError>

  /**
   * Record an execution for replay resistance.
   * Returns true if this is a new execution, false if the key already exists.
   */
  recordExecution(
    executionKey: string,
    receipt: import("./types").ExecutionReceipt,
  ): Effect.Effect<boolean, CapabilityGrantStoreError>

  /**
   * Check if an execution key already exists (replay detection).
   */
  hasExecution(
    executionKey: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError>

  /**
   * Activate all PENDING grants for a session (PENDING → ACTIVE).
   * Returns the number of grants activated.
   */
  activateGrantsForSession(
    sessionId: string,
  ): Effect.Effect<number, CapabilityGrantStoreError>

  /**
   * Revoke all PENDING grants for a session (PENDING → REVOKED).
   * Returns the number of grants revoked.
   */
  revokePendingGrantsForSession(
    sessionId: string,
  ): Effect.Effect<number, CapabilityGrantStoreError>

  /**
   * Recover stale PENDING grants that are older than maxAge.
   * PENDING grants older than maxAge are revoked.
   * Returns the number of grants recovered.
   */
  recoverPendingGrants(
    maxAge: string,
  ): Effect.Effect<number, CapabilityGrantStoreError>
}

// ─── In-Memory Grant Store ────────────────────────────────────────────

export class InMemoryGrantStore implements CapabilityGrantStore {
  private grants = new Map<string, CapabilityGrant>()

  getGrantsForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    return Effect.succeed(this._getForPrincipal(principalId, sessionId, workspaceId))
  }

  private _getForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): CapabilityGrant[] {
    const result: CapabilityGrant[] = []
    for (const g of this.grants.values()) {
      if (g.status !== "ACTIVE") continue  // Positive allowlist — only ACTIVE grants are usable
      if (g.principal.id === principalId) {
        if (g.constraints.sessionId && g.constraints.sessionId !== sessionId) continue
        if (g.constraints.workspaceId && workspaceId && g.constraints.workspaceId !== workspaceId) continue
        result.push(g)
      }
    }
    return result
  }

  getGrantsForWorkspace(
    workspaceId: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    const result: CapabilityGrant[] = []
    for (const g of this.grants.values()) {
      if (g.status !== "ACTIVE") continue  // Positive allowlist
      if (g.constraints.workspaceId === workspaceId) {
        result.push(g)
      }
    }
    return Effect.succeed(result)
  }

  putGrant(
    grant: CapabilityGrant,
  ): Effect.Effect<void, CapabilityGrantStoreError> {
    this.grants.set(grant.id, { ...grant })
    return Effect.void
  }

  revokeGrant(
    grantId: string,
    revokedEventId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    const g = this.grants.get(grantId)
    if (!g) return Effect.succeed(false)
    this.grants.set(grantId, { ...g, status: "REVOKED", revokedEventId })
    return Effect.succeed(true)
  }

  exhaustGrant(
    grantId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    const g = this.grants.get(grantId)
    if (!g) return Effect.succeed(false)
    this.grants.set(grantId, { ...g, status: "EXHAUSTED" })
    return Effect.succeed(true)
  }

  getGrantById(
    grantId: string,
  ): Effect.Effect<CapabilityGrant | null, CapabilityGrantStoreError> {
    const g = this.grants.get(grantId)
    return Effect.succeed(g ? { ...g } : null)
  }

  getAllGrants(): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    return Effect.succeed([...this.grants.values()].map((g) => ({ ...g })))
  }

  updateStatus(
    grantId: string,
    status: CapabilityStatus,
    eventId?: string,
  ): Effect.Effect<void, CapabilityGrantStoreError> {
    const g = this.grants.get(grantId)
    if (!g) return Effect.void
    this.grants.set(grantId, {
      ...g,
      status,
      ...(status === "REVOKED" && eventId ? { revokedEventId: eventId } : {}),
    })
    return Effect.void
  }

  private executionReceipts = new Map<string, import("./types").ExecutionReceipt>()

  tryConsumeUse(
    grantId: string,
    now: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    const g = this.grants.get(grantId)
    if (!g) return Effect.succeed(false)
    if (g.status !== "ACTIVE") return Effect.succeed(false)
    if (g.constraints.expiresAt && g.constraints.expiresAt <= now) return Effect.succeed(false)

    const maxUses = g.constraints.maxUses ?? Infinity
    if (maxUses <= 0) return Effect.succeed(false)

    this.grants.set(grantId, {
      ...g,
      constraints: { ...g.constraints, maxUses: g.constraints.maxUses !== undefined ? g.constraints.maxUses - 1 : undefined },
    })
    return Effect.succeed(true)
  }

  recordExecution(
    executionKey: string,
    receipt: import("./types").ExecutionReceipt,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    if (this.executionReceipts.has(executionKey)) return Effect.succeed(false)
    this.executionReceipts.set(executionKey, receipt)
    return Effect.succeed(true)
  }

  hasExecution(
    executionKey: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    return Effect.succeed(this.executionReceipts.has(executionKey))
  }

  activateGrantsForSession(
    sessionId: string,
  ): Effect.Effect<number, CapabilityGrantStoreError> {
    let count = 0
    for (const [id, g] of this.grants) {
      if (g.status === "PENDING" && g.constraints.sessionId === sessionId) {
        this.grants.set(id, { ...g, status: "ACTIVE" })
        count++
      }
    }
    return Effect.succeed(count)
  }

  revokePendingGrantsForSession(
    sessionId: string,
  ): Effect.Effect<number, CapabilityGrantStoreError> {
    let count = 0
    for (const [id, g] of this.grants) {
      if (g.status === "PENDING" && g.constraints.sessionId === sessionId) {
        this.grants.set(id, { ...g, status: "REVOKED" })
        count++
      }
    }
    return Effect.succeed(count)
  }

  recoverPendingGrants(
    maxAge: string,
  ): Effect.Effect<number, CapabilityGrantStoreError> {
    let count = 0
    for (const [id, g] of this.grants) {
      if (g.status === "PENDING" && g.constraints.expiresAt && g.constraints.expiresAt <= maxAge) {
        this.grants.set(id, { ...g, status: "REVOKED" })
        count++
      }
    }
    return Effect.succeed(count)
  }

  transaction<A>(
    fn: (store: import("./runtime-delegation").RuntimeGrantStore) => Effect.Effect<A, CapabilityGrantStoreError>,
  ): Effect.Effect<A, CapabilityGrantStoreError> {
    // In-memory: snapshot → execute → commit or rollback
    const snapshot = new Map(this.grants)
    return fn(this as unknown as import("./runtime-delegation").RuntimeGrantStore).pipe(
      Effect.catch((err) => {
        // Rollback: restore snapshot
        this.grants = snapshot
        return Effect.fail(err)
      }),
    )
  }
}

// ─── Intent Binding Store (Effect-native) ─────────────────────────────

/**
 * Abstract store for intent bindings.
 * The SessionPolicyProvider uses this to supply bindings to the PDP.
 */
export interface IntentBindingStoreEffect {
  getActiveBindingsForSession(
    sessionId: string,
  ): Effect.Effect<readonly IntentBinding[], CapabilityGrantStoreError>
}

/**
 * In-memory intent binding store for tests.
 */
export class InMemoryIntentBindingStoreEffect implements IntentBindingStoreEffect {
  private bindings = new Map<string, IntentBinding>()

  addBinding(binding: IntentBinding): void {
    this.bindings.set(binding.id, binding)
  }

  getActiveBindingsForSession(
    sessionId: string,
  ): Effect.Effect<readonly IntentBinding[], CapabilityGrantStoreError> {
    const result = [...this.bindings.values()].filter(
      (b) => b.sessionId === sessionId && b.status === "ACTIVE",
    )
    return Effect.succeed(result)
  }
}

// ─── Intent Enforcement Mode ──────────────────────────────────────────

/**
 * Intent enforcement mode for production policy providers.
 *
 * REQUIRED: intent binding store must be provided. Missing store → DENY.
 *   This is the production default. A construction path that forgets to
 *   provide the store silently disables intent binding — this is a bug.
 *
 * LEGACY_COMPAT: intent binding store is optional. Missing store → skip.
 *   Security assurance marked PARTIAL. Warning event emitted.
 *   For migration only. Must not be used in production.
 */
export type IntentEnforcementMode = "REQUIRED" | "LEGACY_COMPAT"

// ─── Session-Aware Policy Context Provider ────────────────────────────

export interface SessionPolicyBinding {
  principalId: string
  sessionId: string
  workspaceId?: string
  workspaceTrust: WorkspaceTrust
}

/**
 * Fail-closed policy context provider.
 *
 * Loads capability grants from a persisted store via Effect.
 * Loads intent bindings from an intent binding store.
 *
 * Enforcement modes:
 *   REQUIRED: intentStore must be provided. Missing → intentBindings = [] → DENY.
 *   LEGACY_COMPAT: intentStore is optional. Missing → intentBindings = undefined → skip.
 *
 * No grants → empty capabilities → PDP returns DENY.
 * Storage failure → empty capabilities → PDP returns DENY.
 * Binding store failure → empty bindings → fail closed → DENY.
 */
export class SessionPolicyProvider {
  constructor(
    private store: CapabilityGrantStore,
    private binding: SessionPolicyBinding,
    private intentStore?: IntentBindingStoreEffect,
    private intentMode: IntentEnforcementMode = "REQUIRED",
    private scopedApprovalStore?: import("./scoped-approval").ScopedApprovalStore,
  ) {}

  snapshot(): Effect.Effect<PolicyContext, never, never> {
    return Effect.gen(
      { self: this },
      function* () {
        let grants: CapabilityGrant[] = []

        const principalGrants = yield* this.store
          .getGrantsForPrincipal(
            this.binding.principalId,
            this.binding.sessionId,
            this.binding.workspaceId,
          )
          .pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))
        grants.push(...principalGrants)

        if (this.binding.workspaceId) {
          const workspaceGrants = yield* this.store
            .getGrantsForWorkspace(this.binding.workspaceId)
            .pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))
          const existing = new Set(grants.map((g) => g.id))
          for (const g of workspaceGrants) {
            if (!existing.has(g.id)) grants.push(g)
          }
        }

        // Load intent bindings
        let intentBindings: IntentBinding[] | undefined = undefined

        if (this.intentStore) {
          // Store provided — load bindings, fail closed on error
          const bindings = yield* this.intentStore
            .getActiveBindingsForSession(this.binding.sessionId)
            .pipe(Effect.catch(() => Effect.succeed<readonly IntentBinding[]>([])))
          intentBindings = [...bindings]
        } else if (this.intentMode === "REQUIRED") {
          // REQUIRED mode without store → fail closed: empty bindings
          intentBindings = []
        }
        // LEGACY_COMPAT without store → intentBindings stays undefined → PDP skips

        // Pre-compute approved scopes as serializable data.
        // The PDP receives this array — never calls a store.
        let approvedScopes: import("./pdp").ApprovedRequestScope[] = []
        if (this.scopedApprovalStore) {
          const allApprovalExit = yield* this.scopedApprovalStore.allApprovals().pipe(
            Effect.catch(() => Effect.succeed<readonly ScopedApproval[]>([])),
          )
          for (const approval of allApprovalExit) {
            if (approval.decision !== "APPROVED") continue
            if (approval.usesConsumed >= 1) continue
            if (approval.expiresAt <= new Date().toISOString()) continue
            approvedScopes.push({
              requestHash: approval.requestHash,
              approvalId: approval.id,
              capabilityId: approval.capabilityId,
              principalId: approval.principalId,
              sessionId: approval.sessionId,
              expiresAt: approval.expiresAt,
              maxUses: approval.maxUses,
            })
          }
        }

        // Determine
        const hasDelegatedGrants = grants.some((g) => g.issuer.kind === "parent_capability")

        return {
          now: new Date().toISOString(),
          policyVersion: POLICY_VERSION,
          capabilities: grants,
          explicitDenyRules: [],
          approvalRules: [],
          workspaceTrust: this.binding.workspaceTrust,
          intentBindings,
          approvedScopes,
          validateAncestors: hasDelegatedGrants,
        } satisfies PolicyContext
      },
    )
  }
}
