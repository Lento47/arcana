/**
 * D-9: Offline and Partition Policy
 *
 * Implements the policy layer over the D-4C offline state reducer
 * (`reducers.ts`). The reducer owns the state machine
 * (ONLINE → OFFLINE_RESTRICTED → OFFLINE_READ_ONLY → QUARANTINED); this
 * module decides which individual requests and grants remain valid while the
 * node is disconnected.
 *
 * Rules (per docs/architecture/phase-d/offline-enforcement.md):
 * - QUARANTINED: no effects, read-only or otherwise.
 * - OFFLINE_READ_ONLY: read-only, non-consequential actions only, with fresh
 *   policy/revocation leases.
 * - OFFLINE_RESTRICTED: only grants explicitly marked `offlineEnabled`, with
 *   an effective expiry of min(grant expiry, offline lease end, per-grant
 *   override). No new approvals, no CRITICAL/HIGH approval-requiring effects.
 * - Fresh policy and revocation leases are required for any consequential
 *   offline action.
 * - Disconnection never increases authority.
 */

export type RiskClass = "LOW" | "MODERATE" | "HIGH" | "CRITICAL"

export type OfflineLeaseConfig = {
  /** Maximum duration a node can remain offline before QUARANTINED. */
  maxOfflineDurationMs: number
  /** Maximum duration before transitioning from RESTRICTED to READ_ONLY. */
  maxConsequentialOfflineMs: number
  /** Maximum duration before policy must be refreshed. */
  policyLeaseMs: number
  /** Maximum duration before revocation state must be refreshed. */
  revocationLeaseMs: number
  /** Grace period after lease expiry before transition. */
  leaseGraceMs: number
}

export const DEFAULT_OFFLINE_LEASE_CONFIG: OfflineLeaseConfig = {
  maxOfflineDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  maxConsequentialOfflineMs: 60 * 60 * 1000, // 1 hour
  policyLeaseMs: 60 * 60 * 1000, // 1 hour
  revocationLeaseMs: 30 * 60 * 1000, // 30 minutes
  leaseGraceMs: 5 * 60 * 1000, // 5 minutes
}

export const OFFLINE_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

// ─── Inputs ─────────────────────────────────────────────────────────

export type OfflineRequestContext = {
  riskClass: RiskClass
  /** True when the effect mutates state, sends data, executes processes,
   * or otherwise requires authorization beyond a bounded read. */
  consequential: boolean
  /** True when local policy would require an operator approval. */
  approvalRequired: boolean
}

// ─── D-7 request classification ────────────────────────────────────────────

/**
 * Deterministically classify a distributed request for the D-9 offline gate.
 *
 * The D-7 model (`distributed-pep.ts`) exposes a single action today
 * (`filesystem.read`) and its derived grants carry no sensitivity/approval
 * metadata, so this function derives the offline request context from the
 * action id alone:
 *
 *   action id            riskClass    consequential    approvalRequired
 *   "filesystem.read"    LOW          false            false
 *   anything else        CRITICAL     true             true
 *
 * Rationale:
 * - `filesystem.read` is a bounded, read-only, non-consequential effect. It
 *   matches the OFFLINE_READ_ONLY carve-out and the offline policy oracle
 *   (non-consequential reads need no new operator approval).
 * - Every other action id is unknown to the D-7 model. Because the model
 *   cannot prove the effect is bounded, harmless, or pre-approved, the
 *   classification fails closed: CRITICAL + consequential +
 *   approval-required. `evaluateOfflineRequest` then denies such effects in
 *   every offline enforcement mode, and no new approvals can be created
 *   while offline. Unknown actions must never slip through a partition.
 *
 * `grant` is accepted (and must be the grant the PEP matched — the PEP
 * guarantees `grant.action === action.action` before this gate runs) so the
 * derivation has access to grant-level metadata once the model grows. Today
 * the derived grant carries none, so the action id alone is deterministic
 * and sufficient.
 */
export function classifyOfflineRequest(
  action: { action: string },
  _grant: { action: string; resource: string },
): OfflineRequestContext {
  switch (action.action) {
    case "filesystem.read":
      return { riskClass: "LOW", consequential: false, approvalRequired: false }
    default:
      return { riskClass: "CRITICAL", consequential: true, approvalRequired: true }
  }
}

export type OfflineCapableGrant = {
  offlineEnabled: boolean
  expiresAt: string
  /** Per-grant override of the global offline duration cap. */
  offlineMaxDurationMs?: number
}

export type OfflineNodeState = {
  connectivity: "ONLINE" | "OFFLINE"
  enforcement: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
  offlineElapsedMs: number
  policyFreshnessMs: number
  revocationFreshnessMs: number
}

export type OfflineDecision =
  | {
      decision: "ALLOW"
      effectiveExpiresAt: string
      reason: string
    }
  | {
      decision: "DENY"
      reason:
        | "QUARANTINED"
        | "READ_ONLY_MODE"
        | "OFFLINE_GRANT_DISABLED"
        | "GRANT_EXPIRED"
        | "OFFLINE_DURATION_EXCEEDED"
        | "POLICY_LEASE_STALE"
        | "REVOCATION_LEASE_STALE"
        | "APPROVAL_REQUIRED_OFFLINE"
        | "CONSEQUENTIAL_OFFLINE"
      detail: string
    }

// ─── Lease arithmetic ───────────────────────────────────────────────

export function offlineRemainingMs(
  nodeState: Pick<OfflineNodeState, "offlineElapsedMs">,
  grant: OfflineCapableGrant,
  config: OfflineLeaseConfig = DEFAULT_OFFLINE_LEASE_CONFIG,
): number {
  const cap = grant.offlineMaxDurationMs ?? config.maxOfflineDurationMs
  return Math.max(0, cap - nodeState.offlineElapsedMs)
}

export function computeEffectiveOfflineExpiry(
  grant: OfflineCapableGrant,
  nodeState: Pick<OfflineNodeState, "offlineElapsedMs">,
  now: Date,
  config: OfflineLeaseConfig = DEFAULT_OFFLINE_LEASE_CONFIG,
): string {
  const grantExpiry = new Date(grant.expiresAt).getTime()
  const leaseEnd = now.getTime() + offlineRemainingMs(nodeState, grant, config)
  return new Date(Math.min(grantExpiry, leaseEnd)).toISOString()
}

// ─── Policy evaluation ──────────────────────────────────────────────

export function evaluateOfflineRequest(
  request: OfflineRequestContext,
  grant: OfflineCapableGrant,
  nodeState: OfflineNodeState,
  now: Date,
  config: OfflineLeaseConfig = DEFAULT_OFFLINE_LEASE_CONFIG,
): OfflineDecision {
  if (nodeState.connectivity === "ONLINE" && nodeState.enforcement === "ONLINE") {
    const grantExpiry = new Date(grant.expiresAt).getTime()
    if (grantExpiry <= now.getTime()) {
      return { decision: "DENY", reason: "GRANT_EXPIRED", detail: `grant expired at ${grant.expiresAt}` }
    }
    return {
      decision: "ALLOW",
      effectiveExpiresAt: grant.expiresAt,
      reason: "online",
    }
  }

  if (nodeState.enforcement === "QUARANTINED") {
    return { decision: "DENY", reason: "QUARANTINED", detail: "node is quarantined; no effects permitted" }
  }

  // Offline leases use monotonic elapsed time; grant wall-clock expiry is
  // still enforced with the documented 5-minute skew tolerance.
  const grantExpiryMs = new Date(grant.expiresAt).getTime()
  if (grantExpiryMs <= now.getTime() + OFFLINE_CLOCK_SKEW_TOLERANCE_MS) {
    return { decision: "DENY", reason: "GRANT_EXPIRED", detail: `grant expired at ${grant.expiresAt}` }
  }

  if (nodeState.enforcement === "OFFLINE_READ_ONLY") {
    if (request.consequential) {
      return {
        decision: "DENY",
        reason: "READ_ONLY_MODE",
        detail: "node is OFFLINE_READ_ONLY; consequential effects denied",
      }
    }
    if (!freshPolicy(nodeState) || !freshRevocation(nodeState)) {
      return {
        decision: "DENY",
        reason: freshPolicy(nodeState) ? "REVOCATION_LEASE_STALE" : "POLICY_LEASE_STALE",
        detail: "read-only offline access requires fresh policy and revocation leases",
      }
    }
    return {
      decision: "ALLOW",
      effectiveExpiresAt: computeEffectiveOfflineExpiry(grant, nodeState, now, config),
      reason: "read-only offline",
    }
  }

  // OFFLINE_RESTRICTED (or a degraded ONLINE state).
  if (!grant.offlineEnabled) {
    return {
      decision: "DENY",
      reason: "OFFLINE_GRANT_DISABLED",
      detail: "grant is not offlineEnabled",
    }
  }

  if (request.approvalRequired) {
    return {
      decision: "DENY",
      reason: "APPROVAL_REQUIRED_OFFLINE",
      detail: "new approvals cannot be granted while offline",
    }
  }

  if (request.consequential && nodeState.offlineElapsedMs >= config.maxConsequentialOfflineMs) {
    return {
      decision: "DENY",
      reason: "CONSEQUENTIAL_OFFLINE",
      detail: `consequential offline window expired after ${config.maxConsequentialOfflineMs} ms`,
    }
  }

  const remaining = offlineRemainingMs(nodeState, grant, config)
  if (remaining <= 0) {
    return {
      decision: "DENY",
      reason: "OFFLINE_DURATION_EXCEEDED",
      detail: `offline duration cap exhausted (elapsed ${nodeState.offlineElapsedMs} ms)`,
    }
  }

  if (request.consequential && (!freshPolicy(nodeState) || !freshRevocation(nodeState))) {
    return {
      decision: "DENY",
      reason: freshPolicy(nodeState) ? "REVOCATION_LEASE_STALE" : "POLICY_LEASE_STALE",
      detail: "consequential offline effects require fresh policy and revocation leases",
    }
  }

  return {
    decision: "ALLOW",
    effectiveExpiresAt: computeEffectiveOfflineExpiry(grant, nodeState, now, config),
    reason: "offline-restricted grant",
  }
}

function freshPolicy(nodeState: OfflineNodeState): boolean {
  // The reducer models freshness as a positive flag (1 = fresh, 0 = stale);
  // leaseGraceMs belongs to the state-machine transition, not this check.
  return nodeState.policyFreshnessMs > 0
}

function freshRevocation(nodeState: OfflineNodeState): boolean {
  return nodeState.revocationFreshnessMs > 0
}
