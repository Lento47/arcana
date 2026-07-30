/**
 * Phase D-5S: SQLite Durable Node Security State Store
 *
 * Restart-persistent storage for node security state.
 * Survives process crashes, machine restarts, duplicate delivery,
 * out-of-order delivery, and transaction interruption.
 *
 * Uses Bun's built-in bun:sqlite (no external dependency).
 */

import { Database } from "bun:sqlite"
import {
  type DurableNodeSecurityState,
  type TransitionEvent,
  type DurableNodeSecurityStateStore,
  MonotonicViolationError,
  createInitialDurableState,
} from "./durable-state"
import {
  type PolicySyncState,
  type VerifiedPolicyInput,
  type RevocationSyncState,
  type VerifiedRevocationInput,
  type NodeRuntimeState,
  type NodeRuntimeEvent,
  type Enforcement,
  type IdentityStatus,
  reducePolicyState,
  reduceRevocationState,
  reduceNodeRuntimeState,
} from "./reducers"

// ─── Schema ───────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS node_security_state (
  node_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,

  identity_status TEXT NOT NULL DEFAULT 'UNREGISTERED',
  enforcement_mode TEXT NOT NULL DEFAULT 'QUARANTINED',
  node_key_epoch INTEGER NOT NULL DEFAULT 0,
  node_certificate_fingerprint TEXT NOT NULL DEFAULT '',

  policy_issuer_id TEXT NOT NULL DEFAULT '',
  policy_issuer_epoch INTEGER NOT NULL DEFAULT 0,
  policy_sequence INTEGER NOT NULL DEFAULT 0,
  policy_digest TEXT NOT NULL DEFAULT '',
  policy_expires_at TEXT NOT NULL DEFAULT '',

  revocation_issuer_epoch INTEGER NOT NULL DEFAULT 0,
  revocation_sequence INTEGER NOT NULL DEFAULT 0,
  emergency_epoch INTEGER NOT NULL DEFAULT 0,
  revocation_digest TEXT NOT NULL DEFAULT '',

  boot_id TEXT NOT NULL DEFAULT '',
  offline_since_wallclock TEXT,
  maximum_offline_lease_ms INTEGER,

  last_local_proof_sequence INTEGER NOT NULL DEFAULT 0,
  last_acknowledged_proof_sequence INTEGER NOT NULL DEFAULT 0,

  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS node_security_outbox (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  kind TEXT NOT NULL,
  previous_version INTEGER NOT NULL,
  next_version INTEGER NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  claimed_by TEXT,
  claim_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS received_sync_messages (
  message_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  result TEXT
);

CREATE TABLE IF NOT EXISTS accepted_policy_artifacts (
  node_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  issuer_epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  digest TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (node_id, issuer_id, issuer_epoch, sequence)
);

CREATE TABLE IF NOT EXISTS accepted_revocation_artifacts (
  node_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  issuer_epoch INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (node_id, issuer_id, issuer_epoch, sequence)
);
`

// ─── State Derivation ─────────────────────────────────────────────────

function rowToState(row: any, trustDomain: string): DurableNodeSecurityState {
  return {
    nodeId: row.node_id,
    trustDomain,
    identityStatus: row.identity_status,
    nodeKeyEpoch: row.node_key_epoch,
    nodeCertificateFingerprint: row.node_certificate_fingerprint,
    acceptedPolicyIssuerId: row.policy_issuer_id,
    acceptedPolicyIssuerEpoch: row.policy_issuer_epoch,
    acceptedPolicySequence: row.policy_sequence,
    acceptedPolicyDigest: row.policy_digest,
    policyExpiresAt: row.policy_expires_at,
    acceptedRevocationSequence: row.revocation_sequence,
    emergencyRevocationEpoch: row.emergency_epoch,
    revocationDigest: row.revocation_digest,
    enforcementMode: row.enforcement_mode,
    lastProofSequence: row.last_local_proof_sequence,
    lastAcknowledgedProofSequence: row.last_acknowledged_proof_sequence,
    version: row.version,
  }
}

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

// ─── Event ID Generator ──────────────────────────────────────────────

let eventCounter = 0
function nextEventId(): string {
  eventCounter++
  return `evt-${Date.now()}-${eventCounter}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── SQLite Store ─────────────────────────────────────────────────────

export class SqliteDurableStateStore implements DurableNodeSecurityStateStore {
  private db: Database
  private trustDomain: string
  private nodeId: string

  constructor(dbPath: string, nodeId: string, trustDomain: string) {
    this.db = new Database(dbPath)
    this.nodeId = nodeId
    this.trustDomain = trustDomain

    // Configure for power-loss durability
    this.db.run("PRAGMA journal_mode=WAL")
    this.db.run("PRAGMA synchronous=FULL")
    this.db.run("PRAGMA foreign_keys=ON")
    this.db.run("PRAGMA busy_timeout=5000")

    // Verify critical pragmas were accepted
    this.verifyPragmas()

    // Create schema
    this.db.run(SCHEMA_SQL)

    // Verify schema integrity
    this.verifySchemaIntegrity()
  }

  /**
   * Verify critical pragmas are set correctly.
   * synchronous=FULL (value 2) ensures WAL transactions survive power loss.
   */
  private verifyPragmas(): void {
    const journalMode = this.db.query("PRAGMA journal_mode").get() as any
    const synchronous = this.db.query("PRAGMA synchronous").get() as any

    if (!journalMode || (journalMode.journal_mode && journalMode.journal_mode !== "wal")) {
      // journal_mode returns the new mode, not always a column
      const jm = journalMode?.journal_mode ?? journalMode?.[Object.keys(journalMode ?? {})[0]]
      if (jm !== "wal") {
        throw new Error(`SQLite configuration error: journal_mode=${jm}, expected wal`)
      }
    }

    // synchronous=FULL is value 2
    const syncVal = synchronous?.synchronous ?? synchronous?.[Object.keys(synchronous ?? {})[0]]
    if (syncVal !== 2) {
      throw new Error(`SQLite configuration error: synchronous=${syncVal}, expected 2 (FULL)`)
    }
  }

  /**
   * Verify schema integrity at startup.
   * Checks mandatory tables exist and latest state invariants hold.
   */
  private verifySchemaIntegrity(): void {
    // Check mandatory tables exist
    const tables = this.db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?, ?, ?, ?)"
    ).all("node_security_state", "node_security_outbox", "received_sync_messages", "accepted_policy_artifacts", "accepted_revocation_artifacts") as any[]

    if (tables.length < 5) {
      throw new Error(`SQLite schema incomplete: found ${tables.length}/5 mandatory tables`)
    }

    // If state exists, verify invariants
    const state = this.db.query("SELECT * FROM node_security_state WHERE node_id = ?").get(this.nodeId) as any
    if (state) {
      // REVOKED identity must have QUARANTINED enforcement
      if (state.identity_status === "REVOKED" && state.enforcement_mode !== "QUARANTINED") {
        throw new Error(`SQLite integrity violation: REVOKED identity with ${state.enforcement_mode} enforcement`)
      }
      // Policy sequence cannot be negative
      if (state.policy_sequence < 0) {
        throw new Error(`SQLite integrity violation: negative policy sequence ${state.policy_sequence}`)
      }
      // Revocation sequence cannot be negative
      if (state.revocation_sequence < 0) {
        throw new Error(`SQLite integrity violation: negative revocation sequence ${state.revocation_sequence}`)
      }
    }
  }

  /**
   * Run integrity check and return result.
   * Returns true if database is healthy, false if corruption detected.
   */
  checkIntegrity(): { healthy: boolean; reason?: string } {
    try {
      const result = this.db.query("PRAGMA integrity_check").get() as any
      const val = result?.integrity_check ?? result?.[Object.keys(result ?? {})[0]]
      if (val === "ok") {
        return { healthy: true }
      }
      return { healthy: false, reason: `integrity_check returned: ${val}` }
    } catch (e) {
      return { healthy: false, reason: `integrity_check threw: ${e}` }
    }
  }

  close(): void {
    this.db.close()
  }

  async load(): Promise<DurableNodeSecurityState | null> {
    const row = this.db.query("SELECT * FROM node_security_state WHERE node_id = ?").get(this.nodeId) as any
    if (!row) return null
    return rowToState(row, this.trustDomain)
  }

  async initializeNode(nodeId: string, trustDomain: string): Promise<DurableNodeSecurityState> {
    const existing = await this.load()
    if (existing) return existing

    const initial = createInitialDurableState(nodeId, trustDomain)
    this.db.run(
      `INSERT INTO node_security_state (node_id, version, identity_status, enforcement_mode)
       VALUES (?, 0, 'UNREGISTERED', 'QUARANTINED')`,
      [nodeId],
    )
    return initial
  }

  async applyPolicy(input: VerifiedPolicyInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    return this.transactionalUpdate((current) => {
      const derivedPolicy = derivePolicyState(current)
      const result = reducePolicyState(derivedPolicy, input)

      if (result.status === "REJECTED") {
        throw new Error(`policy rejected: ${result.reason}`)
      }

      const next: DurableNodeSecurityState = {
        ...current,
        acceptedPolicyIssuerId: result.state.issuerId,
        acceptedPolicyIssuerEpoch: result.state.issuerEpoch,
        acceptedPolicySequence: result.state.acceptedSequence,
        acceptedPolicyDigest: result.state.acceptedDigest,
        policyExpiresAt: result.state.expiresAt,
        version: current.version + 1,
      }

      return {
        next,
        eventKind: result.status === "IDEMPOTENT" ? "POLICY_IDEMPOTENT" : "POLICY_APPLIED",
        eventDetail: {
          sequence: input.sequence,
          digest: input.digest,
          issuerEpoch: input.issuerEpoch,
          reducerStatus: result.status,
        },
        artifactTable: "accepted_policy_artifacts",
        artifactData: {
          node_id: current.nodeId,
          issuer_id: input.issuerId,
          issuer_epoch: input.issuerEpoch,
          sequence: input.sequence,
          digest: input.digest,
          envelope_json: JSON.stringify(input),
          accepted_at: new Date().toISOString(),
        },
      }
    })
  }

  async applyRevocation(input: VerifiedRevocationInput): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    return this.transactionalUpdate((current) => {
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

      return {
        next,
        eventKind: result.status === "IDEMPOTENT" ? "REVOCATION_IDEMPOTENT" : "REVOCATION_APPLIED",
        eventDetail: {
          sequence: input.sequence,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          reducerStatus: result.status,
        },
        artifactTable: "accepted_revocation_artifacts",
        artifactData: {
          node_id: current.nodeId,
          issuer_id: input.issuerId,
          issuer_epoch: input.issuerEpoch,
          sequence: input.sequence,
          subject_type: input.subjectType,
          subject_id: input.subjectId,
          envelope_json: JSON.stringify(input),
          accepted_at: new Date().toISOString(),
        },
      }
    })
  }

  async applyNodeEvent(event: NodeRuntimeEvent): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    return this.transactionalUpdate((current) => {
      const derivedNode = deriveNodeRuntimeState(current)
      const result = reduceNodeRuntimeState(derivedNode, event)

      const next: DurableNodeSecurityState = {
        ...current,
        identityStatus: result.identity,
        enforcementMode: result.enforcement,
        version: current.version + 1,
      }

      return {
        next,
        eventKind: `NODE_${event.kind}`,
        eventDetail: {
          eventKind: event.kind,
          previousEnforcement: current.enforcementMode,
          nextEnforcement: result.enforcement,
          previousIdentity: current.identityStatus,
          nextIdentity: result.identity,
        },
      }
    })
  }

  async updateIdentity(identityStatus: IdentityStatus, nodeKeyEpoch?: number): Promise<{ state: DurableNodeSecurityState; event: TransitionEvent }> {
    return this.transactionalUpdate((current) => {
      const next: DurableNodeSecurityState = {
        ...current,
        identityStatus,
        nodeKeyEpoch: nodeKeyEpoch ?? current.nodeKeyEpoch,
        enforcementMode: identityStatus === "REVOKED" ? "QUARANTINED" : current.enforcementMode,
        version: current.version + 1,
      }

      return {
        next,
        eventKind: "IDENTITY_UPDATED",
        eventDetail: {
          previousIdentity: current.identityStatus,
          nextIdentity: identityStatus,
          nodeKeyEpoch: next.nodeKeyEpoch,
        },
      }
    })
  }

  async getEvents(limit?: number): Promise<TransitionEvent[]> {
    const sql = limit
      ? "SELECT * FROM node_security_outbox WHERE node_id = ? ORDER BY next_version DESC LIMIT ?"
      : "SELECT * FROM node_security_outbox WHERE node_id = ? ORDER BY next_version ASC"
    const rows = limit
      ? this.db.query(sql).all(this.nodeId, limit) as any[]
      : this.db.query(sql).all(this.nodeId) as any[]
    return limit ? rows.map(rowToEvent).reverse() : rows.map(rowToEvent)
  }

  async getEventsSince(version: number): Promise<TransitionEvent[]> {
    const rows = this.db.query(
      "SELECT * FROM node_security_outbox WHERE node_id = ? AND previous_version >= ? ORDER BY next_version"
    ).all(this.nodeId, version) as any[]
    return rows.map(rowToEvent)
  }

  async getUndispatchedEvents(): Promise<TransitionEvent[]> {
    const rows = this.db.query(
      "SELECT * FROM node_security_outbox WHERE node_id = ? AND status = 'PENDING' ORDER BY next_version"
    ).all(this.nodeId) as any[]
    return rows.map(rowToEvent)
  }

  async markEventDispatched(eventId: string): Promise<void> {
    this.db.run(
      "UPDATE node_security_outbox SET status = 'DELIVERED', delivered_at = ? WHERE id = ?",
      [new Date().toISOString(), eventId],
    )
  }

  /**
   * Claim an outbox event for dispatch.
   * Returns the claimed event, or null if no PENDING events.
   * Claim lease expires after `leaseMs` (default 30s).
   */
  async claimEvent(dispatcherId: string, leaseMs: number = 30000): Promise<TransitionEvent | null> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + leaseMs).toISOString()

    const row = this.db.query(
      `SELECT * FROM node_security_outbox
       WHERE node_id = ? AND status = 'PENDING'
       ORDER BY next_version LIMIT 1`
    ).get(this.nodeId) as any

    if (!row) return null

    this.db.run(
      `UPDATE node_security_outbox
       SET status = 'CLAIMED', claimed_by = ?, claim_expires_at = ?, attempts = attempts + 1
       WHERE id = ?`,
      [dispatcherId, expiresAt, row.id],
    )

    return rowToEvent(row)
  }

  /**
   * Release a claimed event back to PENDING (e.g. dispatcher crash recovery).
   */
  async releaseClaim(eventId: string): Promise<void> {
    this.db.run(
      "UPDATE node_security_outbox SET status = 'PENDING', claimed_by = NULL, claim_expires_at = NULL WHERE id = ? AND status = 'CLAIMED'",
      [eventId],
    )
  }

  /**
   * Mark an event as POISONED (permanent failure).
   */
  async poisonEvent(eventId: string, error: string): Promise<void> {
    this.db.run(
      "UPDATE node_security_outbox SET status = 'POISONED', last_error = ? WHERE id = ?",
      [error, eventId],
    )
  }

  /**
   * Recover expired claims (dispatcher crashed).
   * Resets CLAIMED events whose claim_expires_at has passed.
   */
  async recoverExpiredClaims(): Promise<number> {
    const now = new Date().toISOString()
    const result = this.db.run(
      "UPDATE node_security_outbox SET status = 'PENDING', claimed_by = NULL, claim_expires_at = NULL WHERE node_id = ? AND status = 'CLAIMED' AND claim_expires_at < ?",
      [this.nodeId, now],
    )
    return result.changes
  }

  /**
   * Get outbox statistics.
   */
  getOutboxStats(): { pending: number; claimed: number; delivered: number; poisoned: number } {
    const pending = (this.db.query("SELECT COUNT(*) as c FROM node_security_outbox WHERE node_id = ? AND status = 'PENDING'").get(this.nodeId) as any).c
    const claimed = (this.db.query("SELECT COUNT(*) as c FROM node_security_outbox WHERE node_id = ? AND status = 'CLAIMED'").get(this.nodeId) as any).c
    const delivered = (this.db.query("SELECT COUNT(*) as c FROM node_security_outbox WHERE node_id = ? AND status = 'DELIVERED'").get(this.nodeId) as any).c
    const poisoned = (this.db.query("SELECT COUNT(*) as c FROM node_security_outbox WHERE node_id = ? AND status = 'POISONED'").get(this.nodeId) as any).c
    return { pending, claimed, delivered, poisoned }
  }

  // ─── Transactional Update ─────────────────────────────────────────

  private transactionalUpdate(
    compute: (current: DurableNodeSecurityState) => {
      next: DurableNodeSecurityState
      eventKind: string
      eventDetail: Record<string, unknown>
      artifactTable?: string
      artifactData?: Record<string, unknown>
    },
  ): { state: DurableNodeSecurityState; event: TransitionEvent } {
    const txn = this.db.transaction(() => {
      // Load current state with version check
      const row = this.db.query("SELECT * FROM node_security_state WHERE node_id = ?").get(this.nodeId) as any
      if (!row) {
        throw new Error("no state loaded — initialize node first")
      }
      const current = rowToState(row, this.trustDomain)

      // Compute next state via pure reducer
      const { next, eventKind, eventDetail, artifactTable, artifactData } = compute(current)

      // Verify monotonic invariants BEFORE persisting
      verifyMonotonicInvariants(current, next)

      // Persist next state
      this.db.run(
        `UPDATE node_security_state SET
          version = ?,
          identity_status = ?,
          enforcement_mode = ?,
          node_key_epoch = ?,
          node_certificate_fingerprint = ?,
          policy_issuer_id = ?,
          policy_issuer_epoch = ?,
          policy_sequence = ?,
          policy_digest = ?,
          policy_expires_at = ?,
          revocation_issuer_epoch = ?,
          revocation_sequence = ?,
          emergency_epoch = ?,
          revocation_digest = ?,
          last_local_proof_sequence = ?,
          last_acknowledged_proof_sequence = ?,
          updated_at = ?
        WHERE node_id = ? AND version = ?`,
        [
          next.version,
          next.identityStatus,
          next.enforcementMode,
          next.nodeKeyEpoch,
          next.nodeCertificateFingerprint,
          next.acceptedPolicyIssuerId,
          next.acceptedPolicyIssuerEpoch,
          next.acceptedPolicySequence,
          next.acceptedPolicyDigest,
          next.policyExpiresAt,
          next.acceptedPolicyIssuerEpoch,
          next.acceptedRevocationSequence,
          next.emergencyRevocationEpoch,
          next.revocationDigest,
          next.lastProofSequence,
          next.lastAcknowledgedProofSequence,
          new Date().toISOString(),
          this.nodeId,
          current.version,
        ],
      )

      // Insert outbox event
      const eventId = nextEventId()
      const event: TransitionEvent = {
        id: eventId,
        nodeId: this.nodeId,
        timestamp: new Date().toISOString(),
        kind: eventKind,
        previousVersion: current.version,
        nextVersion: next.version,
        detail: eventDetail,
      }

      this.db.run(
        `INSERT INTO node_security_outbox (id, node_id, aggregate_version, timestamp, kind, previous_version, next_version, detail, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [event.id, event.nodeId, next.version, event.timestamp, event.kind, event.previousVersion, event.nextVersion, JSON.stringify(event.detail)],
      )

      // Persist artifact if provided
      if (artifactTable && artifactData) {
        const cols = Object.keys(artifactData)
        const placeholders = cols.map(() => "?").join(", ")
        const vals = Object.values(artifactData)
        this.db.run(
          `INSERT OR IGNORE INTO ${artifactTable} (${cols.join(", ")}) VALUES (${placeholders})`,
          vals,
        )
      }

      return { state: { ...next }, event }
    })

    return txn()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function rowToEvent(row: any): TransitionEvent {
  return {
    id: row.id,
    nodeId: row.node_id,
    timestamp: row.timestamp,
    kind: row.kind,
    previousVersion: row.previous_version,
    nextVersion: row.next_version,
    detail: JSON.parse(row.detail),
  }
}
