/**
 * Phase D-6: Transport-Neutral Synchronization Protocol
 *
 * Protocol types, resource limits, codecs, and pure sync state machine.
 * No transport (HTTP/WS/gRPC) — pure state transitions only.
 *
 * TUF-inspired: treats rollback, freeze, and mix-and-match as protocol threats.
 */

// ─── Protocol Version ─────────────────────────────────────────────────

export const SYNC_PROTOCOL_VERSION = 1

// ─── Resource Limits ──────────────────────────────────────────────────

export type SyncLimits = {
  maximumEnvelopeBytes: number
  maximumJsonDepth: number
  maximumObjectFields: number
  maximumArrayItems: number
  maximumStringBytes: number
  maximumDeltaOperations: number
  maximumBatchStatements: number
}

export const DEFAULT_SYNC_LIMITS: SyncLimits = {
  maximumEnvelopeBytes: 64 * 1024,       // 64 KB
  maximumJsonDepth: 16,
  maximumObjectFields: 64,
  maximumArrayItems: 1024,
  maximumStringBytes: 4096,
  maximumDeltaOperations: 256,
  maximumBatchStatements: 128,
}

// ─── Policy Sync Messages ─────────────────────────────────────────────

export type PolicySyncRequest = {
  protocolVersion: 1
  nodeId: string
  trustDomain: string

  acceptedIssuerId?: string
  acceptedIssuerEpoch: number
  acceptedSequence: number
  acceptedDigest?: string

  supportedPolicySchemas: number[]
  maximumResponseBytes: number

  requestId: string
}

export type PolicySyncResponse =
  | {
      kind: "NO_CHANGE"
      requestId: string
      currentSequence: number
      currentDigest: string
    }
  | {
      kind: "SNAPSHOT"
      requestId: string
      envelope: Record<string, unknown>  // SignedPolicyEnvelope
    }
  | {
      kind: "DELTA"
      requestId: string
      envelope: Record<string, unknown>  // SignedPolicyDeltaEnvelope
    }
  | {
      kind: "FULL_SNAPSHOT_REQUIRED"
      requestId: string
      reason: string
    }
  | {
      kind: "QUARANTINE"
      requestId: string
      reason: string
    }

// ─── Policy Delta Types ───────────────────────────────────────────────

export type PolicyDeltaOperation = {
  op: "add" | "remove" | "replace"
  path: string
  value?: unknown
}

export type SignedPolicyDeltaPayload = {
  schemaVersion: 1
  issuerId: string
  issuerEpoch: number
  sequence: number
  basePolicyDigest: string
  resultPolicyDigest: string
  operations: readonly PolicyDeltaOperation[]
  issuedAt: string
  expiresAt: string
}

// ─── Revocation Sync Messages ─────────────────────────────────────────

export type RevocationSyncRequest = {
  nodeId: string
  acceptedIssuerEpoch: number
  acceptedSequence: number
  emergencyEpoch: number
  acceptedDigest?: string
  requestId: string
}

export type RevocationSyncResponse =
  | {
      kind: "NO_CHANGE"
      requestId: string
      currentSequence: number
      currentDigest: string
    }
  | {
      kind: "STATEMENT"
      requestId: string
      envelope: Record<string, unknown>  // SignedRevocationEnvelope
    }
  | {
      kind: "BATCH"
      requestId: string
      envelopes: readonly Record<string, unknown>[]
    }
  | {
      kind: "QUARANTINE"
      requestId: string
      reason: string
    }

// ─── Sync State Machine ───────────────────────────────────────────────

export type SyncPhase =
  | "IDLE"
  | "REQUESTING"
  | "RECEIVING"
  | "VERIFYING"
  | "REDUCING"
  | "PERSISTING"
  | "ACKNOWLEDGING"
  | "COMPLETED"
  | "REJECTED"
  | "QUARANTINED"

export type SyncState = {
  phase: SyncPhase
  nodeId: string
  trustDomain: string

  // Policy sync state
  policySync: {
    acceptedIssuerEpoch: number
    acceptedSequence: number
    acceptedDigest: string
    lastRequestId: string | null
    lastResponseKind: string | null
    consecutiveFailures: number
  }

  // Revocation sync state
  revocationSync: {
    acceptedIssuerEpoch: number
    acceptedSequence: number
    emergencyEpoch: number
    acceptedDigest: string
    lastRequestId: string | null
    lastResponseKind: string | null
    consecutiveFailures: number
  }

  // Quarantine
  quarantineReason: string | null
}

export type SyncEvent =
  | { kind: "POLICY_SYNC_REQUESTED"; requestId: string }
  | { kind: "POLICY_SYNC_RECEIVED"; responseKind: string; requestId: string }
  | { kind: "POLICY_VERIFIED"; sequence: number; digest: string }
  | { kind: "POLICY_REDUCED"; status: "APPLIED" | "IDEMPOTENT" | "REJECTED" }
  | { kind: "POLICY_PERSISTED"; sequence: number }
  | { kind: "POLICY_REJECTED"; reason: string }
  | { kind: "REVOCATION_SYNC_REQUESTED"; requestId: string }
  | { kind: "REVOCATION_SYNC_RECEIVED"; responseKind: string; requestId: string }
  | { kind: "REVOCATION_VERIFIED"; sequence: number }
  | { kind: "REVOCATION_REDUCED"; status: "APPLIED" | "IDEMPOTENT" | "REJECTED" }
  | { kind: "REVOCATION_PERSISTED"; sequence: number }
  | { kind: "REVOCATION_REJECTED"; reason: string }
  | { kind: "QUARANTINED"; reason: string }
  | { kind: "SYNC_COMPLETED" }
  | { kind: "SYNC_FAILED"; reason: string }

// ─── Pure Sync State Machine ──────────────────────────────────────────

export function reduceSyncState(state: SyncState, event: SyncEvent): SyncState {
  // Quarantine is terminal
  if (state.phase === "QUARANTINED") return state

  switch (event.kind) {
    case "POLICY_SYNC_REQUESTED":
      return {
        ...state,
        phase: "REQUESTING",
        policySync: {
          ...state.policySync,
          lastRequestId: event.requestId,
        },
      }

    case "POLICY_SYNC_RECEIVED":
      return {
        ...state,
        phase: "RECEIVING",
        policySync: {
          ...state.policySync,
          lastResponseKind: event.responseKind,
        },
      }

    case "POLICY_VERIFIED":
      return {
        ...state,
        phase: "REDUCING",
      }

    case "POLICY_REDUCED":
      if (event.status === "REJECTED") {
        return {
          ...state,
          phase: "REJECTED",
          policySync: {
            ...state.policySync,
            consecutiveFailures: state.policySync.consecutiveFailures + 1,
          },
        }
      }
      return {
        ...state,
        phase: "PERSISTING",
      }

    case "POLICY_PERSISTED":
      return {
        ...state,
        phase: "ACKNOWLEDGING",
        policySync: {
          ...state.policySync,
          acceptedSequence: event.sequence,
          consecutiveFailures: 0,
        },
      }

    case "POLICY_REJECTED":
      return {
        ...state,
        phase: "REJECTED",
        policySync: {
          ...state.policySync,
          consecutiveFailures: state.policySync.consecutiveFailures + 1,
        },
      }

    case "REVOCATION_SYNC_REQUESTED":
      return {
        ...state,
        phase: "REQUESTING",
        revocationSync: {
          ...state.revocationSync,
          lastRequestId: event.requestId,
        },
      }

    case "REVOCATION_SYNC_RECEIVED":
      return {
        ...state,
        phase: "RECEIVING",
        revocationSync: {
          ...state.revocationSync,
          lastResponseKind: event.responseKind,
        },
      }

    case "REVOCATION_VERIFIED":
      return { ...state, phase: "REDUCING" }

    case "REVOCATION_REDUCED":
      if (event.status === "REJECTED") {
        return {
          ...state,
          phase: "REJECTED",
          revocationSync: {
            ...state.revocationSync,
            consecutiveFailures: state.revocationSync.consecutiveFailures + 1,
          },
        }
      }
      return { ...state, phase: "PERSISTING" }

    case "REVOCATION_PERSISTED":
      return {
        ...state,
        phase: "ACKNOWLEDGING",
        revocationSync: {
          ...state.revocationSync,
          acceptedSequence: event.sequence,
          consecutiveFailures: 0,
        },
      }

    case "REVOCATION_REJECTED":
      return {
        ...state,
        phase: "REJECTED",
        revocationSync: {
          ...state.revocationSync,
          consecutiveFailures: state.revocationSync.consecutiveFailures + 1,
        },
      }

    case "QUARANTINED":
      return {
        ...state,
        phase: "QUARANTINED",
        quarantineReason: event.reason,
      }

    case "SYNC_COMPLETED":
      return { ...state, phase: "COMPLETED" }

    case "SYNC_FAILED":
      return {
        ...state,
        phase: "REJECTED",
        policySync: {
          ...state.policySync,
          consecutiveFailures: state.policySync.consecutiveFailures + 1,
        },
      }
  }
}

// ─── Initial Sync State ───────────────────────────────────────────────

export function createInitialSyncState(nodeId: string, trustDomain: string): SyncState {
  return {
    phase: "IDLE",
    nodeId,
    trustDomain,
    policySync: {
      acceptedIssuerEpoch: 0,
      acceptedSequence: 0,
      acceptedDigest: "",
      lastRequestId: null,
      lastResponseKind: null,
      consecutiveFailures: 0,
    },
    revocationSync: {
      acceptedIssuerEpoch: 0,
      acceptedSequence: 0,
      emergencyEpoch: 0,
      acceptedDigest: "",
      lastRequestId: null,
      lastResponseKind: null,
      consecutiveFailures: 0,
    },
    quarantineReason: null,
  }
}

// ─── Request Validation ───────────────────────────────────────────────

export function validateSyncRequest(
  request: PolicySyncRequest,
  limits: SyncLimits = DEFAULT_SYNC_LIMITS,
): { valid: true } | { valid: false; reason: string } {
  if (request.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    return { valid: false, reason: `unsupported protocol version: ${request.protocolVersion}` }
  }
  if (request.maximumResponseBytes > limits.maximumEnvelopeBytes * 4) {
    return { valid: false, reason: `maximumResponseBytes exceeds limit: ${request.maximumResponseBytes}` }
  }
  if (request.nodeId.length === 0) {
    return { valid: false, reason: "empty nodeId" }
  }
  if (request.trustDomain.length === 0) {
    return { valid: false, reason: "empty trustDomain" }
  }
  if (!request.requestId || request.requestId.length === 0) {
    return { valid: false, reason: "empty requestId" }
  }
  return { valid: true }
}

// ─── Delta Validation ─────────────────────────────────────────────────

export function validateDeltaOperations(
  operations: readonly PolicyDeltaOperation[],
  limits: SyncLimits = DEFAULT_SYNC_LIMITS,
): { valid: true } | { valid: false; reason: string } {
  if (operations.length > limits.maximumDeltaOperations) {
    return { valid: false, reason: `delta operations exceed limit: ${operations.length} > ${limits.maximumDeltaOperations}` }
  }
  for (const op of operations) {
    if (!["add", "remove", "replace"].includes(op.op)) {
      return { valid: false, reason: `invalid delta operation: ${op.op}` }
    }
    if (!op.path || op.path.length === 0) {
      return { valid: false, reason: "empty delta path" }
    }
    if (op.op !== "remove" && op.value === undefined) {
      return { valid: false, reason: `delta ${op.op} requires value` }
    }
  }
  return { valid: true }
}
