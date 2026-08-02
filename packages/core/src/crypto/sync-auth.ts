/**
 * Phase D-6B: Authenticated Synchronization Control
 *
 * Sync-control responses (NO_CHANGE, QUARANTINE, etc.) are security-sensitive.
 * A forged NO_CHANGE could freeze a node on stale state.
 *
 * This module defines:
 * - Sync request/response context types
 * - Dedicated domain separators for sync control
 * - Replay protection state
 * - Durable acknowledgement invariants
 */

// ─── Domain Separators ────────────────────────────────────────────────

export const SYNC_REQUEST_DOMAIN = "arcana:sync-request:v1" as const
export const SYNC_RESPONSE_DOMAIN = "arcana:sync-response:v1" as const
export const SYNC_ACK_DOMAIN = "arcana:sync-ack:v1" as const

// ─── Sync Request Context ─────────────────────────────────────────────

export type SyncRequestContext = {
  protocolVersion: 1
  requestId: string
  clientNonce: string

  trustDomain: string
  nodeId: string
  nodeCertificateFingerprint: string
  nodeKeyEpoch: number

  acceptedPolicySequence: number
  acceptedPolicyDigest?: string

  acceptedRevocationSequence: number
  acceptedRevocationDigest?: string
  acceptedEmergencyEpoch: number

  issuedAt: string
  expiresAt: string
}

// ─── Sync Response Context ────────────────────────────────────────────

export type SyncResponseKind =
  | "NO_CHANGE"
  | "POLICY_SNAPSHOT"
  | "POLICY_DELTA"
  | "REVOCATION_SNAPSHOT"
  | "REVOCATION_DELTA"
  | "FULL_SNAPSHOT_REQUIRED"
  | "QUARANTINE"
  | "RETRY_LATER"

export type SyncResponseContext = {
  protocolVersion: 1
  requestId: string
  clientNonce: string
  serverNonce: string

  nodeId: string
  serverIdentity: string

  responseKind: SyncResponseKind

  policySequence?: number
  policyDigest?: string

  revocationSequence?: number
  revocationDigest?: string
  emergencyEpoch?: number

  /** Signed policy/revocation envelope for SNAPSHOT/DELTA responses. */
  envelope?: Record<string, unknown>

  /** Signed policy delta payload for POLICY_DELTA responses. */
  delta?: Record<string, unknown>

  /** Signed revocation statement envelopes for REVOCATION_DELTA responses. */
  envelopes?: readonly Record<string, unknown>[]

  issuedAt: string
  expiresAt: string
}

// ─── Replay Protection ───────────────────────────────────────────────

/**
 * Persisted replay record. Survives process restart.
 * Stored in SQLite: sync_replay_records table.
 */
export type SyncReplayRecord = {
  serverIdentity: string
  requestId: string
  clientNonce: string
  responseDigest: string
  expiresAt: string
  receivedAt: string
}

export type ReplayCheckResult =
  | { status: "OK" }
  | { status: "IDEMPOTENT"; reason: string }
  | { status: "REPLAY_REJECTED"; reason: string }
  | { status: "SECURITY_CONFLICT"; reason: string }

/**
 * Check if a sync response is a replay, idempotent retry, or fresh.
 */
export function checkReplay(
  response: SyncResponseContext,
  responseDigest: string,
  existingRecords: SyncReplayRecord[],
  now: Date,
): ReplayCheckResult {
  const nowMs = now.getTime()

  // Find existing record for this requestId
  const existing = existingRecords.find(r => r.requestId === response.requestId)

  if (!existing) {
    // No existing record — this is a fresh response
    return { status: "OK" }
  }

  // Same request ID + same response digest = idempotent retry
  if (existing.responseDigest === responseDigest) {
    return { status: "IDEMPOTENT", reason: "same requestId + same responseDigest" }
  }

  // Same request ID + different response = security conflict
  return {
    status: "SECURITY_CONFLICT",
    reason: `requestId ${response.requestId} already recorded with different response digest`,
  }
}

/**
 * Validate a sync response context.
 */
export function validateSyncResponse(
  response: SyncResponseContext,
  expectedNodeId: string,
  expectedRequestId: string,
  expectedClientNonce: string,
  now: Date,
): { valid: true } | { valid: false; reason: string } {
  // Request ID must match
  if (response.requestId !== expectedRequestId) {
    return { valid: false, reason: `requestId mismatch: ${response.requestId} != ${expectedRequestId}` }
  }

  // Client nonce must match
  if (response.clientNonce !== expectedClientNonce) {
    return { valid: false, reason: `clientNonce mismatch: ${response.clientNonce} != ${expectedClientNonce}` }
  }

  // Node ID must match
  if (response.nodeId !== expectedNodeId) {
    return { valid: false, reason: `nodeId mismatch: ${response.nodeId} != ${expectedNodeId}` }
  }

  // Must have server identity
  if (!response.serverIdentity || response.serverIdentity.length === 0) {
    return { valid: false, reason: "empty serverIdentity" }
  }

  // Must have server nonce
  if (!response.serverNonce || response.serverNonce.length === 0) {
    return { valid: false, reason: "empty serverNonce" }
  }

  // Check expiry
  const expiresAt = new Date(response.expiresAt).getTime()
  const nowMs = now.getTime()

  if (nowMs > expiresAt) {
    return { valid: false, reason: `response expired at ${response.expiresAt}` }
  }

  // Check issuedAt is not in the future (allow 5min clock skew)
  const issuedAt = new Date(response.issuedAt).getTime()
  if (issuedAt > nowMs + 5 * 60 * 1000) {
    return { valid: false, reason: `response issuedAt ${response.issuedAt} is in the future` }
  }

  return { valid: true }
}

// ─── Durable Acknowledgement ──────────────────────────────────────────

/**
 * An acknowledgement can only be sent after ALL of these are committed:
 * - State transition
 * - Accepted artifact
 * - Outbox event
 * - Replay record
 *
 * Invariant: AcceptedAck ⇒ StateDurable ∧ ArtifactDurable ∧ EventIntentDurable ∧ ReplayRecordDurable
 */
export type SyncAcknowledgement = {
  requestId: string
  serverNonce: string
  clientNonce: string
  nodeId: string

  acceptedAt: string
  stateVersion: number
  artifactDigest: string
  outboxEventId: string

  status: "ACCEPTED" | "REJECTED" | "IDEMPOTENT"
  reason?: string
}

// ─── Replay Table Schema ──────────────────────────────────────────────

export const SYNC_REPLAY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sync_replay_records (
  server_identity TEXT NOT NULL,
  request_id TEXT NOT NULL,
  client_nonce TEXT NOT NULL,
  response_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (server_identity, request_id)
);
`
