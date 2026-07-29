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
import type { PolicyContext, PolicyContextProvider, WorkspaceTrust } from "./pdp"
import type { CapabilityGrant, IntentBinding } from "./types"
import { POLICY_VERSION } from "./types"

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
    status: CapabilityGrant["status"],
    eventId?: string,
  ): Effect.Effect<void, CapabilityGrantStoreError>
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
    status: CapabilityGrant["status"],
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

        // Pre-compute approved scopes from the ScopedApprovalStore.
        // The PDP receives a pure lookup function — never calls a store directly.
        let lookupApprovedScope: ((requestHash: string) => import("./pdp").ApprovedRequestScope | undefined) | undefined = undefined
        if (this.scopedApprovalStore) {
          const store = this.scopedApprovalStore
          lookupApprovedScope = (requestHash: string) => {
            const approval = store.getApprovalForRequest(requestHash)
            if (!approval) return undefined
            if (approval.decision !== "APPROVED") return undefined
            if (approval.maxUses <= 0) return undefined
            return {
              requestHash: approval.requestHash,
              approvalId: approval.id,
              capabilityId: approval.capabilityId,
              principalId: approval.principalId,
              sessionId: approval.sessionId,
              expiresAt: approval.expiresAt,
              maxUses: approval.maxUses,
            }
          }
        }

        // Determine if ancestor validation is needed (any delegated grants?)
        const hasDelegatedGrants = grants.some((g) => g.issuer.kind === "parent_capability")

        return {
          now: new Date().toISOString(),
          policyVersion: POLICY_VERSION,
          capabilities: grants,
          explicitDenyRules: [],
          approvalRules: [],
          workspaceTrust: this.binding.workspaceTrust,
          intentBindings,
          lookupApprovedScope,
          validateAncestors: hasDelegatedGrants,
        } satisfies PolicyContext
      },
    )
  }
}
