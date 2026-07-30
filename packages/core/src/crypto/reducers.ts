/**
 * Phase D-4: Pure State Reducers
 *
 * Deterministic state transitions for distributed authority.
 * No network, no database, no side effects.
 *
 * Each reducer:
 * - Takes current state + verified input
 * - Returns deterministic transition result
 * - Preserves state on rejection (no partial mutations)
 * - Guarantees monotonicity for sequences and epochs
 */

// ─── Transition Result ───────────────────────────────────────────────

export type TransitionStatus = "APPLIED" | "IDEMPOTENT" | "REJECTED"

export type TransitionResult<S, R extends string> = {
  status: TransitionStatus
  state: S
  reason: R
}

// ─── D-4A: Policy Reducer ────────────────────────────────────────────

export type PolicySyncState = {
  issuerId: string
  issuerEpoch: number
  acceptedSequence: number
  acceptedDigest: string
  acceptedAt: string
  expiresAt: string
  status: "CURRENT" | "STALE" | "INVALID" | "UNAVAILABLE"
}

export type VerifiedPolicyInput = {
  kind: "SNAPSHOT" | "DELTA"
  issuerId: string
  issuerEpoch: number
  sequence: number
  digest: string
  previousDigest?: string
  expiresAt: string
  receivedAt: string
}

type PolicyRejectionReason =
  | "INITIALIZATION"
  | "SEQUENCE_ROLLBACK"
  | "EPOCH_ROLLBACK"
  | "ISSUER_MISMATCH"
  | "SEQUENCE_CONFLICT"
  | "CHAIN_MISMATCH"
  | "EXPIRED"

export type PolicyTransitionResult = TransitionResult<PolicySyncState, PolicyRejectionReason>

const INITIAL_POLICY_STATE: PolicySyncState = {
  issuerId: "",
  issuerEpoch: 0,
  acceptedSequence: 0,
  acceptedDigest: "",
  acceptedAt: "",
  expiresAt: "",
  status: "UNAVAILABLE",
}

export function reducePolicyState(
  current: PolicySyncState,
  input: VerifiedPolicyInput,
): PolicyTransitionResult {
  // First input: initialize
  if (current.status === "UNAVAILABLE" && current.acceptedSequence === 0) {
    return {
      status: "APPLIED",
      reason: "INITIALIZATION",
      state: {
        issuerId: input.issuerId,
        issuerEpoch: input.issuerEpoch,
        acceptedSequence: input.sequence,
        acceptedDigest: input.digest,
        acceptedAt: input.receivedAt,
        expiresAt: input.expiresAt,
        status: "CURRENT",
      },
    }
  }

  // Issuer mismatch
  if (input.issuerId !== current.issuerId) {
    return { status: "REJECTED", reason: "ISSUER_MISMATCH", state: current }
  }

  // Epoch rollback
  if (input.issuerEpoch < current.issuerEpoch) {
    return { status: "REJECTED", reason: "EPOCH_ROLLBACK", state: current }
  }

  // Sequence rollback
  if (input.sequence < current.acceptedSequence) {
    return { status: "REJECTED", reason: "SEQUENCE_ROLLBACK", state: current }
  }

  // Same sequence
  if (input.sequence === current.acceptedSequence) {
    if (input.digest === current.acceptedDigest) {
      return { status: "IDEMPOTENT", reason: "INITIALIZATION", state: current }
    }
    return { status: "REJECTED", reason: "SEQUENCE_CONFLICT", state: current }
  }

  // Higher sequence — check chain linkage for snapshots
  if (input.kind === "SNAPSHOT" && input.previousDigest !== undefined) {
    if (input.previousDigest !== current.acceptedDigest) {
      return { status: "REJECTED", reason: "CHAIN_MISMATCH", state: current }
    }
  }

  // Check expiry
  const now = Date.parse(input.receivedAt)
  const expires = Date.parse(input.expiresAt)
  if (now > expires) {
    return { status: "REJECTED", reason: "EXPIRED", state: current }
  }

  // Apply
  return {
    status: "APPLIED",
    reason: "INITIALIZATION",
    state: {
      issuerId: input.issuerId,
      issuerEpoch: input.issuerEpoch,
      acceptedSequence: input.sequence,
      acceptedDigest: input.digest,
      acceptedAt: input.receivedAt,
      expiresAt: input.expiresAt,
      status: "CURRENT",
    },
  }
}

// ─── D-4B: Revocation Reducer ────────────────────────────────────────

export type RevocationSyncState = {
  issuerId: string
  issuerEpoch: number
  acceptedSequence: number
  emergencyEpoch: number
  revokedGrantIds: ReadonlySet<string>
  revokedNodeIds: ReadonlySet<string>
  revokedPolicyIds: ReadonlySet<string>
  revokedIssuerEpochs: ReadonlyMap<string, number>
  status: "CURRENT" | "STALE" | "INVALID" | "UNAVAILABLE"
}

export type VerifiedRevocationInput = {
  issuerId: string
  issuerEpoch: number
  sequence: number
  subjectType: "GRANT" | "NODE" | "ISSUER_KEY" | "POLICY"
  subjectId: string
  receivedAt: string
}

type RevocationRejectionReason =
  | "INITIALIZATION"
  | "SEQUENCE_ROLLBACK"
  | "EPOCH_ROLLBACK"
  | "ISSUER_MISMATCH"
  | "SEQUENCE_CONFLICT"

export type RevocationTransitionResult = TransitionResult<RevocationSyncState, RevocationRejectionReason>

export function reduceRevocationState(
  current: RevocationSyncState,
  input: VerifiedRevocationInput,
): RevocationTransitionResult {
  // Issuer mismatch
  if (input.issuerId !== current.issuerId && current.status !== "UNAVAILABLE") {
    return { status: "REJECTED", reason: "ISSUER_MISMATCH", state: current }
  }

  // First input: initialize
  if (current.status === "UNAVAILABLE" && current.acceptedSequence === 0) {
    return {
      status: "APPLIED",
      reason: "INITIALIZATION",
      state: applyRevocation(current, input),
    }
  }

  // Epoch rollback (but emergency epoch can escalate)
  if (input.issuerEpoch < current.issuerEpoch) {
    return { status: "REJECTED", reason: "EPOCH_ROLLBACK", state: current }
  }

  // Sequence rollback
  if (input.sequence < current.acceptedSequence) {
    return { status: "REJECTED", reason: "SEQUENCE_ROLLBACK", state: current }
  }

  // Same sequence — idempotent if same statement, conflict if different
  if (input.sequence === current.acceptedSequence) {
    // Check idempotency: same subject already revoked
    if (isAlreadyRevoked(current, input)) {
      return { status: "IDEMPOTENT", reason: "INITIALIZATION", state: current }
    }
    return { status: "REJECTED", reason: "SEQUENCE_CONFLICT", state: current }
  }

  // Higher sequence — apply
  return {
    status: "APPLIED",
    reason: "INITIALIZATION",
    state: applyRevocation(current, input),
  }
}

function isAlreadyRevoked(state: RevocationSyncState, input: VerifiedRevocationInput): boolean {
  switch (input.subjectType) {
    case "GRANT": return state.revokedGrantIds.has(input.subjectId)
    case "NODE": return state.revokedNodeIds.has(input.subjectId)
    case "POLICY": return state.revokedPolicyIds.has(input.subjectId)
    case "ISSUER_KEY": return state.revokedIssuerEpochs.has(input.subjectId)
  }
}

function applyRevocation(current: RevocationSyncState, input: VerifiedRevocationInput): RevocationSyncState {
  const newGrantIds = new Set(current.revokedGrantIds)
  const newNodeIds = new Set(current.revokedNodeIds)
  const newPolicyIds = new Set(current.revokedPolicyIds)
  const newIssuerEpochs = new Map(current.revokedIssuerEpochs)

  switch (input.subjectType) {
    case "GRANT": newGrantIds.add(input.subjectId); break
    case "NODE": newNodeIds.add(input.subjectId); break
    case "POLICY": newPolicyIds.add(input.subjectId); break
    case "ISSUER_KEY": {
      const existing = newIssuerEpochs.get(input.subjectId) ?? 0
      newIssuerEpochs.set(input.subjectId, Math.max(existing, input.issuerEpoch))
      break
    }
  }

  const newEmergencyEpoch = input.subjectType === "ISSUER_KEY"
    ? Math.max(current.emergencyEpoch, input.issuerEpoch)
    : current.emergencyEpoch

  return {
    issuerId: input.issuerId,
    issuerEpoch: Math.max(current.issuerEpoch, input.issuerEpoch),
    acceptedSequence: input.sequence,
    emergencyEpoch: newEmergencyEpoch,
    revokedGrantIds: newGrantIds,
    revokedNodeIds: newNodeIds,
    revokedPolicyIds: newPolicyIds,
    revokedIssuerEpochs: newIssuerEpochs,
    status: "CURRENT",
  }
}

// ─── D-4C: Offline Authority Reducer ─────────────────────────────────

export type Connectivity = "ONLINE" | "OFFLINE"
export type Enforcement = "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"

export type OfflineRuntimeState = {
  connectivity: Connectivity
  enforcement: Enforcement
  policyFreshnessMs: number
  revocationFreshnessMs: number
  offlineElapsedMs: number
}

export type OfflineRuntimeEvent =
  | { kind: "CONNECTION_LOST" }
  | { kind: "MONOTONIC_TIME_ELAPSED"; milliseconds: number }
  | { kind: "POLICY_EXPIRED" }
  | { kind: "REVOCATION_LEASE_EXPIRED" }
  | { kind: "IDENTITY_REVOKED" }
  | { kind: "FULL_SYNC_COMPLETED" }

export function reduceOfflineState(
  current: OfflineRuntimeState,
  event: OfflineRuntimeEvent,
): OfflineRuntimeState {
  switch (event.kind) {
    case "CONNECTION_LOST":
      return {
        ...current,
        connectivity: "OFFLINE",
        enforcement: current.enforcement === "ONLINE" ? "OFFLINE_RESTRICTED" : current.enforcement,
      }

    case "MONOTONIC_TIME_ELAPSED": {
      const newElapsed = current.offlineElapsedMs + event.milliseconds
      const newEnforcement = escalateOfflineEnforcement(current.enforcement, newElapsed)
      return {
        ...current,
        offlineElapsedMs: newElapsed,
        enforcement: newEnforcement,
      }
    }

    case "POLICY_EXPIRED":
      return {
        ...current,
        policyFreshnessMs: 0,
        enforcement: escalateOfflineEnforcement(current.enforcement, current.offlineElapsedMs),
      }

    case "REVOCATION_LEASE_EXPIRED":
      return {
        ...current,
        revocationFreshnessMs: 0,
        enforcement: escalateOfflineEnforcement(current.enforcement, current.offlineElapsedMs),
      }

    case "IDENTITY_REVOKED":
      return { ...current, enforcement: "QUARANTINED" }

    case "FULL_SYNC_COMPLETED":
      return {
        connectivity: "ONLINE",
        enforcement: "ONLINE",
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
        offlineElapsedMs: 0,
      }
  }
}

/**
 * Offline enforcement escalation: authority can only decrease while disconnected.
 * ONLINE → OFFLINE_RESTRICTED → OFFLINE_READ_ONLY → QUARANTINED
 * Never reverses while offline.
 */
function escalateOfflineEnforcement(current: Enforcement, offlineMs: number): Enforcement {
  if (current === "QUARANTINED") return "QUARANTINED"
  if (offlineMs > 3_600_000) return "QUARANTINED"
  if (offlineMs > 600_000) return "OFFLINE_READ_ONLY"
  return current
}

// ─── D-4D: Composite Node Runtime Reducer ────────────────────────────

export type IdentityStatus = "UNREGISTERED" | "PENDING" | "TRUSTED" | "SUSPENDED" | "REVOKED"
export type PolicyStatus = "CURRENT" | "STALE" | "INVALID" | "UNAVAILABLE"
export type RevocationStatus = "CURRENT" | "STALE" | "INVALID" | "UNAVAILABLE"

export type NodeRuntimeState = {
  identity: IdentityStatus
  connectivity: Connectivity
  enforcement: Enforcement
  policy: PolicyStatus
  revocation: RevocationStatus
}

export type NodeRuntimeEvent =
  | { kind: "IDENTITY_REGISTERED" }
  | { kind: "IDENTITY_TRUSTED" }
  | { kind: "IDENTITY_SUSPENDED" }
  | { kind: "IDENTITY_REVOKED" }
  | { kind: "POLICY_CURRENT" }
  | { kind: "POLICY_STALE" }
  | { kind: "POLICY_INVALID" }
  | { kind: "POLICY_UNAVAILABLE" }
  | { kind: "REVOCATION_CURRENT" }
  | { kind: "REVOCATION_STALE" }
  | { kind: "REVOCATION_INVALID" }
  | { kind: "REVOCATION_UNAVAILABLE" }
  | { kind: "CONNECTION_LOST" }
  | { kind: "CONNECTION_RESTORED" }
  | { kind: "FULL_SYNC_COMPLETED" }

const INITIAL_NODE_STATE: NodeRuntimeState = {
  identity: "UNREGISTERED",
  connectivity: "OFFLINE",
  enforcement: "QUARANTINED",
  policy: "UNAVAILABLE",
  revocation: "UNAVAILABLE",
}

export function reduceNodeRuntimeState(
  current: NodeRuntimeState,
  event: NodeRuntimeEvent,
): NodeRuntimeState {
  let next = { ...current }

  // Apply the event to the relevant axis
  switch (event.kind) {
    case "IDENTITY_REGISTERED": next.identity = "PENDING"; break
    case "IDENTITY_TRUSTED": next.identity = "TRUSTED"; break
    case "IDENTITY_SUSPENDED": next.identity = "SUSPENDED"; break
    case "IDENTITY_REVOKED": next.identity = "REVOKED"; break
    case "POLICY_CURRENT": next.policy = "CURRENT"; break
    case "POLICY_STALE": next.policy = "STALE"; break
    case "POLICY_INVALID": next.policy = "INVALID"; break
    case "POLICY_UNAVAILABLE": next.policy = "UNAVAILABLE"; break
    case "REVOCATION_CURRENT": next.revocation = "CURRENT"; break
    case "REVOCATION_STALE": next.revocation = "STALE"; break
    case "REVOCATION_INVALID": next.revocation = "INVALID"; break
    case "REVOCATION_UNAVAILABLE": next.revocation = "UNAVAILABLE"; break
    case "CONNECTION_LOST": next.connectivity = "OFFLINE"; break
    case "CONNECTION_RESTORED": next.connectivity = "ONLINE"; break
    case "FULL_SYNC_COMPLETED":
      next.connectivity = "ONLINE"
      next.policy = "CURRENT"
      next.revocation = "CURRENT"
      break
  }

  // Derive enforcement from hard rules
  next.enforcement = deriveEnforcement(next)
  return next
}

/**
 * Hard enforcement derivation rules:
 * - identity = REVOKED → QUARANTINED
 * - policy = INVALID → QUARANTINED
 * - revocation = INVALID → QUARANTINED
 * - identity ≠ TRUSTED → no consequential effects
 * - connectivity = OFFLINE + not QUARANTINED → OFFLINE_RESTRICTED
 * - otherwise → ONLINE
 */
function deriveEnforcement(state: NodeRuntimeState): Enforcement {
  if (state.identity === "REVOKED") return "QUARANTINED"
  if (state.policy === "INVALID") return "QUARANTINED"
  if (state.revocation === "INVALID") return "QUARANTINED"
  if (state.identity !== "TRUSTED") return "QUARANTINED"
  if (state.policy === "UNAVAILABLE") return "QUARANTINED"
  if (state.revocation === "UNAVAILABLE") return "QUARANTINED"
  if (state.connectivity === "OFFLINE") return "OFFLINE_RESTRICTED"
  return "ONLINE"
}

// ─── Exports ─────────────────────────────────────────────────────────

export { INITIAL_POLICY_STATE, INITIAL_NODE_STATE }
