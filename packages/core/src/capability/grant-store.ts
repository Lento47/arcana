/**
 * Phase C Task 7: Session-aware Policy Context Provider
 *
 * Replaces the permissive migration provider with a fail-closed provider
 * backed by persisted capability grants.
 *
 * No grants → DENY. Missing storage → DENY. Unknown tool → DENY.
 */

import type { PolicyContext, PolicyContextProvider, WorkspaceTrust } from "./pdp"
import type { CapabilityGrant } from "./types"
import { POLICY_VERSION } from "./types"

// ─── Capability Grant Store ───────────────────────────────────────────

/**
 * Abstract store interface for persisted capability grants.
 * Implementations backed by SQLite, in-memory, or file.
 */
export interface CapabilityGrantStore {
  /** Load all grants for a principal in a session. */
  getGrantsForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): CapabilityGrant[] | Promise<CapabilityGrant[]>

  /** Load all grants for a workspace. */
  getGrantsForWorkspace(workspaceId: string): CapabilityGrant[] | Promise<CapabilityGrant[]>

  /** Record a grant. */
  putGrant(grant: CapabilityGrant): void | Promise<void>

  /** Revoke a grant by ID. Returns true if found. */
  revokeGrant(grantId: string, revokedEventId: string): boolean | Promise<boolean>

  /** Mark a grant as exhausted. */
  exhaustGrant(grantId: string): boolean | Promise<boolean>
}

// ─── In-Memory Grant Store ────────────────────────────────────────────

export class InMemoryGrantStore implements CapabilityGrantStore {
  private grants = new Map<string, CapabilityGrant>()

  getGrantsForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): CapabilityGrant[] {
    const result: CapabilityGrant[] = []
    for (const g of this.grants.values()) {
      if (g.principal.id === principalId) {
        // Session-bound grants must match
        if (g.constraints.sessionId && g.constraints.sessionId !== sessionId) continue
        // Workspace-bound grants must match
        if (g.constraints.workspaceId && workspaceId && g.constraints.workspaceId !== workspaceId) continue
        result.push(g)
      }
    }
    return result
  }

  getGrantsForWorkspace(workspaceId: string): CapabilityGrant[] {
    const result: CapabilityGrant[] = []
    for (const g of this.grants.values()) {
      if (g.constraints.workspaceId === workspaceId) {
        result.push(g)
      }
    }
    return result
  }

  putGrant(grant: CapabilityGrant): void {
    this.grants.set(grant.id, { ...grant })
  }

  revokeGrant(grantId: string, revokedEventId: string): boolean {
    const g = this.grants.get(grantId)
    if (!g) return false
    this.grants.set(grantId, { ...g, status: "REVOKED", revokedEventId })
    return true
  }

  exhaustGrant(grantId: string): boolean {
    const g = this.grants.get(grantId)
    if (!g) return false
    this.grants.set(grantId, { ...g, status: "EXHAUSTED" })
    return true
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
 * Loads capability grants from a persisted store.
 * No grants → empty capabilities → PDP returns DENY.
 * Storage failure → empty capabilities → PDP returns DENY.
 */
export class SessionPolicyProvider implements PolicyContextProvider {
  constructor(
    private store: CapabilityGrantStore,
    private binding: SessionPolicyBinding,
  ) {}

  async snapshot(): Promise<PolicyContext> {
    let grants: CapabilityGrant[] = []

    try {
      // Load grants for this principal+session
      const principalGrants = await this.store.getGrantsForPrincipal(
        this.binding.principalId,
        this.binding.sessionId,
        this.binding.workspaceId,
      )
      grants.push(...principalGrants)

      // Load workspace-scoped grants if workspace is known
      if (this.binding.workspaceId) {
        const workspaceGrants = await this.store.getGrantsForWorkspace(
          this.binding.workspaceId,
        )
        // Deduplicate by ID
        const existing = new Set(grants.map((g) => g.id))
        for (const g of workspaceGrants) {
          if (!existing.has(g.id)) grants.push(g)
        }
      }
    } catch {
      // Storage failure → fail closed → empty grants → DENY
      grants = []
    }

    return {
      now: new Date().toISOString(),
      policyVersion: POLICY_VERSION,
      capabilities: grants,
      explicitDenyRules: [],
      approvalRules: [],
      workspaceTrust: this.binding.workspaceTrust,
    }
  }
}
