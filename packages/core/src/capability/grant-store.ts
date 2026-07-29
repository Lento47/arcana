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
 * Loads intent bindings from an optional intent binding store.
 * No grants → empty capabilities → PDP returns DENY.
 * Storage failure → empty capabilities → PDP returns DENY.
 * No binding store → intentBindings = undefined → PDP skips intent check (backward compat).
 * Binding store failure → intentBindings = [] → fail closed.
 */
export class SessionPolicyProvider {
  constructor(
    private store: CapabilityGrantStore,
    private binding: SessionPolicyBinding,
    private intentStore?: IntentBindingStoreEffect,
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

        // Load intent bindings if store is provided
        let intentBindings: IntentBinding[] | undefined = undefined
        if (this.intentStore) {
          const bindings = yield* this.intentStore
            .getActiveBindingsForSession(this.binding.sessionId)
            .pipe(Effect.catch(() => Effect.succeed<readonly IntentBinding[]>([])))
          intentBindings = [...bindings]
        }

        return {
          now: new Date().toISOString(),
          policyVersion: POLICY_VERSION,
          capabilities: grants,
          explicitDenyRules: [],
          approvalRules: [],
          workspaceTrust: this.binding.workspaceTrust,
          intentBindings,
        } satisfies PolicyContext
      },
    )
  }
}
