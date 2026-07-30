/**
 * Phase D-5: Durable Node Security State Store
 *
 * Wraps pure D-4 reducers in transactional persistence with:
 * - Optimistic concurrency control (version-based CAS)
 * - Monotonic field constraints enforced at store level
 * - Transition event outbox for audit trail
 * - Atomic state + event writes
 *
 * No network, no external database — pure in-memory for Phase D.
 * SQLite-backed durable variant comes with D-6 protocol sync.
 */

import {
  type PolicySyncState,
  type VerifiedPolicyInput,
  type RevocationSyncState,
  type VerifiedRevocationInput,
  type NodeRuntimeState,
  type NodeRuntimeEvent,
  type Enforcement,
  type IdentityStatus,
  type PolicyStatus,
  type RevocationStatus,
  reducePolicyState,
  reduceRevocationState,
  reduceNodeRuntimeState,
  INITIAL_POLICY_STATE,
  INITIAL_NODE_STATE,
} from "./reducers"

// ─── Durable State ────────────────────────────────────────────────────

export type DurableNodeSecurityState = {
  nodeId: string
  trustDomain: string

  identityStatus: IdentityStatus
  nodeKeyEpoch: number
  nodeCertificateFingerprint: string

  acceptedPolicyIssuerId: string
  acceptedPolicyIssuerEpoch: number
  acceptedPolicySequence: number
  acceptedPolicyDigest: string
  policyExpiresAt: string

  acceptedRevocationSequence: number
  emergencyRevocationEpoch: number
  revocationDigest: string

  enforcementMode: Enforcement
  lastProofSequence: number
  lastAcknowledgedProofSequence: number

  version: number
}

// ─── Transition Event ─────────────────────────────────────────────────

export type TransitionEvent = {
  id: string
  nodeId: string
  timestamp: string
  kind: string
  previousVersion: number
  nextVersion: number
  detail: Record<string, unknown>
}

// ─── Errors ───────────────────────────────────────────────────────────

export class MonotonicViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MonotonicViolationError"
  }
}

export class ConcurrencyError extends Error {
  constructor(expected: number, actual: number) {
    super(`version mismatch: expected ${expected}, got ${actual}`)
    this.name = "ConcurrencyError"
  }
}

// ─── Store Interface ──────────────────────────────────────────────────

export interface DurableNodeSecurityStateStore {
  load(): Promise<DurableNodeSecurityState | null>
  applyPolicy(input: VerifiedPolicyInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }>
  applyRevocation(input: VerifiedRevocationInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }>
  applyNodeEvent(event: NodeRuntimeEvent): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }>
  updateIdentity(identityStatus: IdentityStatus, nodeKeyEpoch?: number): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }>
  getEvents(limit?: number): Promise<TransitionEvent[]>
  getEventsSince(version: number): Promise<TransitionEvent[]>
}

// ─── Monotonic Invariants ─────────────────────────────────────────────

function verifyMonotonicInvariants(
  previous: DurableNodeSecurityState,
  next: DurableNodeSecurityState,
): void {
  if (next.acceptedPolicySequence < previous.acceptedPolicySequence) {
    throw new MonotonicViolationError("policy sequence decreased")
  }
  if (next.acceptedPolicyIssuerEpoch < previous.acceptedPolicyIssuerEpoch) {
    throw new MonotonicViolationError("policy issuer epoch decreased")
  }
  if (next.acceptedRevocationSequence < previous.acceptedRevocationSequence) {
    throw new MonotonicViolationError("revocation sequence decreased")
  }
  if (next.emergencyRevocationEpoch < previous.emergencyRevocationEpoch) {
    throw new MonotonicViolationError("emergency epoch decreased")
  }
  if (next.version !== previous.version + 1) {
    throw new MonotonicViolationError(`version did not increment by 1: ${previous.version} → ${next.version}`)
  }
  if (next.identityStatus === "REVOKED" && next.enforcementMode !== "QUARANTINED") {
    throw new MonotonicViolationError("REVOKED identity without QUARANTINED enforcement")
  }
}

// ─── State Derivation ─────────────────────────────────────────────────

function derivePolicyState(s: DurableNodeSecurityState): PolicySyncState {
  return {
    issuerId: s.acceptedPolicyIssuerId,
    issuerEpoch: s.acceptedPolicyIssuerEpoch,
    acceptedSequence: s.acceptedPolicySequence,
    acceptedDigest: s.acceptedPolicyDigest,
    acceptedAt: "",
    expiresAt: s.policyExpiresAt,
    status: (s.acceptedPolicySequence === 0) ? "UNAVAILABLE" : (
      s.enforcementMode === "QUARANTINED" ? "INVALID" : "CURRENT"
    ),
  }
}

function deriveRevocationState(s: DurableNodeSecurityState): RevocationSyncState {
  return {
    issuerId: s.acceptedPolicyIssuerId || "",
    issuerEpoch: s.acceptedPolicyIssuerEpoch,
    acceptedSequence: s.acceptedRevocationSequence,
    emergencyEpoch: s.emergencyRevocationEpoch,
    revokedGrantIds: new Set(),
    revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(),
    revokedIssuerEpochs: new Map(),
    status: s.acceptedRevocationSequence > 0 ? "CURRENT" : "UNAVAILABLE",
  }
}

function deriveNodeRuntimeState(s: DurableNodeSecurityState): NodeRuntimeState {
  return {
    identity: s.identityStatus,
    connectivity: s.enforcementMode === "ONLINE" ? "ONLINE" : "OFFLINE",
    enforcement: s.enforcementMode,
    policy: s.acceptedPolicySequence > 0 ? "CURRENT" : "UNAVAILABLE",
    revocation: s.acceptedRevocationSequence > 0 ? "CURRENT" : "UNAVAILABLE",
  }
}

// ─── Event ID Generator ──────────────────────────────────────────────

let eventCounter = 0
function nextEventId(): string {
  eventCounter++
  return `evt-${Date.now()}-${eventCounter}`
}

// ─── In-Memory Store ──────────────────────────────────────────────────

export class InMemoryDurableStateStore implements DurableNodeSecurityStateStore {
  private state: DurableNodeSecurityState | null = null
  private events: TransitionEvent[] = []

  async load(): Promise<DurableNodeSecurityState | null> {
    return this.state ? { ...this.state } : null
  }

  async applyPolicy(input: VerifiedPolicyInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    const current = this.requireState()

    const derivedPolicy = derivePolicyState(current)
    const result = reducePolicyState(derivedPolicy, input)

    if (result.status === "REJECTED") {
      throw new Error(`policy rejected: ${result.reason}`)
    }

    // Update durable fields from reducer result
    const next: DurableNodeSecurityState = {
      ...current,
      acceptedPolicyIssuerId: result.state.issuerId,
      acceptedPolicyIssuerEpoch: result.state.issuerEpoch,
      acceptedPolicySequence: result.state.acceptedSequence,
      acceptedPolicyDigest: result.state.acceptedDigest,
      policyExpiresAt: result.state.expiresAt,
      version: current.version + 1,
    }

    verifyMonotonicInvariants(current, next)

    const event: TransitionEvent = {
      id: nextEventId(),
      nodeId: current.nodeId,
      timestamp: new Date().toISOString(),
      kind: result.status === "IDEMPOTENT" ? "POLICY_IDEMPOTENT" : "POLICY_APPLIED",
      previousVersion: current.version,
      nextVersion: next.version,
      detail: {
        sequence: input.sequence,
        digest: input.digest,
        issuerEpoch: input.issuerEpoch,
        reducerStatus: result.status,
      },
    }

    this.state = next
    this.events.push(event)
    return { state: { ...next }, event }
  }

  async applyRevocation(input: VerifiedRevocationInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    const current = this.requireState()

    const derivedRevocation = deriveRevocationState(current)
    const result = reduceRevocationState(derivedRevocation, input)

    if (result.status === "REJECTED") {
      throw new Error(`revocation rejected: ${result.reason}`)
    }

    const next: DurableNodeSecurityState = {
      ...current,
      acceptedRevocationSequence: result.state.acceptedSequence,
      emergencyRevocationEpoch: result.state.emergencyEpoch,
      version: current.version + 1,
    }

    verifyMonotonicInvariants(current, next)

    const event: TransitionEvent = {
      id: nextEventId(),
      nodeId: current.nodeId,
      timestamp: new Date().toISOString(),
      kind: result.status === "IDEMPOTENT" ? "REVOCATION_IDEMPOTENT" : "REVOCATION_APPLIED",
      previousVersion: current.version,
      nextVersion: next.version,
      detail: {
        sequence: input.sequence,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        reducerStatus: result.status,
      },
    }

    this.state = next
    this.events.push(event)
    return { state: { ...next }, event }
  }

  async applyNodeEvent(event: NodeRuntimeEvent): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    const current = this.requireState()

    const derivedNode = deriveNodeRuntimeState(current)
    const result = reduceNodeRuntimeState(derivedNode, event)

    const next: DurableNodeSecurityState = {
      ...current,
      identityStatus: result.identity,
      enforcementMode: result.enforcement,
      version: current.version + 1,
    }

    verifyMonotonicInvariants(current, next)

    const transitionEvent: TransitionEvent = {
      id: nextEventId(),
      nodeId: current.nodeId,
      timestamp: new Date().toISOString(),
      kind: `NODE_${event.kind}`,
      previousVersion: current.version,
      nextVersion: next.version,
      detail: {
        eventKind: event.kind,
        previousEnforcement: current.enforcementMode,
        nextEnforcement: result.enforcement,
        previousIdentity: current.identityStatus,
        nextIdentity: result.identity,
      },
    }

    this.state = next
    this.events.push(transitionEvent)
    return { state: { ...next }, event: transitionEvent }
  }

  async updateIdentity(identityStatus: IdentityStatus, nodeKeyEpoch?: number): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    const current = this.requireState()

    const next: DurableNodeSecurityState = {
      ...current,
      identityStatus,
      nodeKeyEpoch: nodeKeyEpoch ?? current.nodeKeyEpoch,
      enforcementMode: identityStatus === "REVOKED" ? "QUARANTINED" : current.enforcementMode,
      version: current.version + 1,
    }

    verifyMonotonicInvariants(current, next)

    const event: TransitionEvent = {
      id: nextEventId(),
      nodeId: current.nodeId,
      timestamp: new Date().toISOString(),
      kind: "IDENTITY_UPDATED",
      previousVersion: current.version,
      nextVersion: next.version,
      detail: {
        previousIdentity: current.identityStatus,
        nextIdentity: identityStatus,
        nodeKeyEpoch: next.nodeKeyEpoch,
      },
    }

    this.state = next
    this.events.push(event)
    return { state: { ...next }, event }
  }

  async getEvents(limit?: number): Promise<TransitionEvent[]> {
    const events = [...this.events]
    return limit ? events.slice(-limit) : events
  }

  async getEventsSince(version: number): Promise<TransitionEvent[]> {
    return this.events.filter(e => e.previousVersion >= version)
  }

  private requireState(): DurableNodeSecurityState {
    if (!this.state) {
      throw new Error("no state loaded — initialize with initializeNode first")
    }
    return this.state
  }
}

// ─── Initialization Helper ────────────────────────────────────────────

export function createInitialDurableState(
  nodeId: string,
  trustDomain: string,
): DurableNodeSecurityState {
  return {
    nodeId,
    trustDomain,
    identityStatus: "UNREGISTERED",
    nodeKeyEpoch: 0,
    nodeCertificateFingerprint: "",
    acceptedPolicyIssuerId: "",
    acceptedPolicyIssuerEpoch: 0,
    acceptedPolicySequence: 0,
    acceptedPolicyDigest: "",
    policyExpiresAt: "",
    acceptedRevocationSequence: 0,
    emergencyRevocationEpoch: 0,
    revocationDigest: "",
    enforcementMode: "QUARANTINED",
    lastProofSequence: 0,
    lastAcknowledgedProofSequence: 0,
    version: 0,
  }
}
