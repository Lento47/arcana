/**
 * TUI-2I: SQLite-backed Approval Lifecycle Store
 *
 * Durable approval + execution + outbox in one transactional store.
 * Uses the same SQLite patterns as D-5H (WAL, synchronous=FULL, foreign keys).
 */

import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import type {
  ApprovalRecord,
  ApprovalExecutionRecord,
  ApprovalOutboxEvent,
  ApprovalLifecycleStore,
  ApprovalTransition,
} from "./approval-lifecycle"
import { ApprovalStaleTransitionError } from "./approval-lifecycle"
import type { ApprovalState } from "./approval-lifecycle"
import type { AuthorizationRequest, RiskClass } from "../capability/types"
import type { ApprovalRequestSnapshot, CanonicalJson, StoredSnapshotContent } from "./approval-request-snapshot"
import { canonicalJson, verifyApprovalRequestSnapshot, type SnapshotVerification } from "./approval-request-snapshot"

// ─── Schema ─────────────────────────────────────────────────────────

export const APPROVAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS approval_records (
  approval_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  contract_revision INTEGER NOT NULL,
  principal_id TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'PENDING',
  approved_by TEXT,
  execution_id TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_executions (
  approval_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  approval_version INTEGER NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'CLAIMED',
  effect_receipt_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_outbox (
  event_id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit PR-2: immutable reviewable request snapshot, written atomically with
-- the approval record and never mutated after creation. request_json carries
-- the full AuthorizationRequest so the runtime can recompute its canonical
-- hash and verify it against approval_records.request_hash (fail closed).
CREATE TABLE IF NOT EXISTS approval_request_snapshots (
  approval_id TEXT PRIMARY KEY,
  request_json TEXT NOT NULL,
  args_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

/**
 * Shared additive migrations for approval_records. Both stores that open the
 * table (SqliteApprovalStore and SqliteScopedApprovalStore) apply the same
 * list idempotently so the schema converges regardless of which store runs
 * first.
 */
export const APPROVAL_RECORD_MIGRATIONS = [
  `ALTER TABLE approval_records ADD COLUMN actions_json TEXT`,
  `ALTER TABLE approval_records ADD COLUMN resource_json TEXT`,
  `ALTER TABLE approval_records ADD COLUMN uses_consumed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE approval_records ADD COLUMN claim_execution_id TEXT`,
  `ALTER TABLE approval_records ADD COLUMN lease_expires_at TEXT`,
  `ALTER TABLE approval_records ADD COLUMN decided_at TEXT`,
  // Phase D advisory routing metadata.
  `ALTER TABLE approval_records ADD COLUMN route TEXT`,
  `ALTER TABLE approval_records ADD COLUMN routing_policy_version TEXT`,
  `ALTER TABLE approval_records ADD COLUMN local_fallback_allowed INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE approval_records ADD COLUMN risk_class TEXT`,
  `ALTER TABLE approval_records ADD COLUMN revoked_by TEXT`,
]

export type ApprovalTransitionStep = "begin" | "approval" | "execution" | "outbox" | "commit"

export type ApprovalTransitionHooks = {
  /**
   * Test seam called at every transaction boundary inside commitTransition.
   * Throwing from a hook simulates a crash or SQLite failure at that point;
   * production callers leave it unset.
   */
  onStep?: (step: ApprovalTransitionStep) => void
}

// ─── SQLite Store ───────────────────────────────────────────────────

export class SqliteApprovalStore implements ApprovalLifecycleStore {
  private db: Database
  private readonly hooks: ApprovalTransitionHooks

  constructor(dbPath: string, hooks: ApprovalTransitionHooks = {}) {
    this.hooks = hooks
    this.db = new Database(dbPath)

    // Same durability configuration as D-5H
    this.db.run("PRAGMA journal_mode=WAL")
    this.db.run("PRAGMA synchronous=FULL")
    this.db.run("PRAGMA foreign_keys=ON")
    this.db.run("PRAGMA busy_timeout=5000")

    this.verifyPragmas()
    this.db.run(APPROVAL_SCHEMA)
    this.migrate()
  }

  private verifyPragmas(): void {
    const syncResult = this.db.query("PRAGMA synchronous").get() as any
    const val = syncResult?.synchronous ?? syncResult?.[Object.keys(syncResult ?? {})[0]]
    if (val !== 2) {
      throw new Error(`SQLite configuration error: synchronous=${val}, expected 2 (FULL)`)
    }
  }

  private migrate(): void {
    const cols = new Set<string>()
    const rows = this.db.query("PRAGMA table_info(approval_records)").all() as { name: string }[]
    for (const r of rows) cols.add(r.name)
    for (const migration of APPROVAL_RECORD_MIGRATIONS) {
      const colName = migration.match(/ADD COLUMN (\w+)/)?.[1]
      if (colName && !cols.has(colName)) {
        this.db.run(migration)
        cols.add(colName)
      }
    }
  }

  loadApproval(approvalId: string): ApprovalRecord | null {
    const row = this.db.query("SELECT * FROM approval_records WHERE approval_id = ?").get(approvalId) as any
    if (!row) return null
    return rowToApproval(row)
  }

  saveApproval(record: ApprovalRecord): void {
    this.upsertApproval(record)
  }

  // ─── Approval Request Snapshot (audit PR-2) ──────────────────────
  // The immutable reviewable request is stored alongside the approval record
  // (side table, same DB file). It is written once at approval creation and
  // never mutated; reads are fail-closed verified.

  /**
   * Persist the immutable request snapshot for an approval. Written atomically
   * with approval creation by the scoped store's putApprovalWithSnapshot;
   * this method is the idempotent row-level upsert both stores share.
   */
  saveApprovalSnapshot(input: {
    approvalId: string
    request: AuthorizationRequest
    args: unknown
    snapshot: ApprovalRequestSnapshot
  }): void {
    const snapshotJson = canonicalJson(input.snapshot)
    const snapshotHash = createHash("sha256").update(snapshotJson, "utf-8").digest("hex")
    this.db.run(
      `INSERT INTO approval_request_snapshots (approval_id, request_json, args_json, snapshot_json, snapshot_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(approval_id) DO UPDATE SET
         request_json = excluded.request_json,
         args_json = excluded.args_json,
         snapshot_json = excluded.snapshot_json,
         snapshot_hash = excluded.snapshot_hash`,
      [
        input.approvalId,
        canonicalJson(input.request),
        canonicalJson(input.args),
        snapshotJson,
        snapshotHash,
        new Date().toISOString(),
      ],
    )
  }

  /** Load the raw stored snapshot content for an approval, or null. */
  loadStoredSnapshot(approvalId: string): StoredSnapshotContent | null {
    const row = this.db
      .query("SELECT request_json, args_json, snapshot_json, snapshot_hash FROM approval_request_snapshots WHERE approval_id = ?")
      .get(approvalId) as
      | { request_json: string; args_json: string; snapshot_json: string; snapshot_hash: string }
      | undefined
    if (!row) return null
    return {
      request: JSON.parse(row.request_json) as AuthorizationRequest,
      args: JSON.parse(row.args_json) as unknown,
      snapshotJson: row.snapshot_json as CanonicalJson,
      snapshotHash: row.snapshot_hash,
    }
  }

  /**
   * Fail-closed read: recompute the canonical hash of the stored request and
   * verify it matches the approval record's requestHash, then verify the
   * stored projection is the exact projection of that immutable request.
   * Missing or changed snapshots FAIL CLOSED — never a silently stale
   * snapshot.
   */
  getVerifiedSnapshot(approvalId: string, record: ApprovalRecord): SnapshotVerification {
    const content = this.loadStoredSnapshot(approvalId)
    if (!content) return { status: "missing" }
    const riskClass = (record.riskClass ?? "MODERATE") as RiskClass
    return verifyApprovalRequestSnapshot({
      approvalId,
      content,
      expectedRequestHash: record.requestHash,
      contractRevision: record.contractRevision,
      riskClass,
    })
  }

  private upsertApproval(record: ApprovalRecord): void {
    this.db.run(
      `INSERT INTO approval_records (approval_id, version, session_id, workspace_id, request_hash, contract_revision, principal_id, state, approved_by, revoked_by, execution_id, route, routing_policy_version, local_fallback_allowed, risk_class, expires_at, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(approval_id) DO UPDATE SET
         version = excluded.version,
         principal_id = excluded.principal_id,
         state = excluded.state,
         approved_by = excluded.approved_by,
         revoked_by = excluded.revoked_by,
         execution_id = excluded.execution_id,
         route = excluded.route,
         routing_policy_version = excluded.routing_policy_version,
         local_fallback_allowed = excluded.local_fallback_allowed,
         risk_class = excluded.risk_class,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      [
        record.approvalId, record.version, record.sessionId, record.workspaceId,
        record.requestHash, record.contractRevision, record.principalId ?? "",
        record.state,
        record.approvedBy ?? null, record.revokedBy ?? null, record.executionId ?? null,
        record.route ?? null, record.routingPolicyVersion ?? null,
        record.localFallbackAllowed === false ? 0 : 1, record.riskClass ?? null,
        record.expiresAt, record.updatedAt, record.createdAt,
      ],
    )
  }

  loadExecution(approvalId: string): ApprovalExecutionRecord | null {
    const row = this.db.query("SELECT * FROM approval_executions WHERE approval_id = ?").get(approvalId) as any
    if (!row) return null
    return rowToExecution(row)
  }

  saveExecution(record: ApprovalExecutionRecord): void {
    this.upsertExecution(record)
  }

  private upsertExecution(record: ApprovalExecutionRecord): void {
    this.db.run(
      `INSERT INTO approval_executions (approval_id, execution_id, approval_version, request_hash, state, effect_receipt_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(approval_id) DO UPDATE SET
         execution_id = excluded.execution_id,
         approval_version = excluded.approval_version,
         state = excluded.state,
         effect_receipt_hash = excluded.effect_receipt_hash,
         updated_at = excluded.updated_at`,
      [
        record.approvalId, record.executionId, record.approvalVersion,
        record.requestHash, record.state,
        record.effectReceiptHash ?? null,
        record.createdAt, record.updatedAt,
      ],
    )
  }

  appendOutboxEvent(event: ApprovalOutboxEvent): void {
    this.insertOutboxEvent(event)
  }

  private insertOutboxEvent(event: ApprovalOutboxEvent): void {
    // Deterministic identity: a retried transition resolves to the same event
    // id, so the insert is idempotent instead of throwing on the primary key.
    const exists = this.db.query("SELECT * FROM approval_outbox WHERE event_id = ?").get(event.eventId) as
      | { approval_id: string; kind: string; timestamp: string; detail: string }
      | undefined
    if (exists) {
      // An existing outbox event with the same id must carry the canonical
      // content. If two transitions produced the same deterministic id but
      // DIFFERENT content, that is a genuine conflict that must fail loudly —
      // never a silent no-op. (With the CAS guard above, a concurrent decision
      // already bumps the version, so a second transition with the same id is
      // an identical replay and passes; a different one is a hard error.)
      if (
        exists.approval_id !== event.approvalId
        || exists.kind !== event.kind
        || exists.timestamp !== event.timestamp
        || exists.detail !== JSON.stringify(event.detail)
      ) {
        throw new Error(
          `outbox event conflict: event_id ${event.eventId} already exists with different content`,
        )
      }
      return
    }
    this.db.run(
      `INSERT INTO approval_outbox (event_id, approval_id, kind, timestamp, detail, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [event.eventId, event.approvalId, event.kind, event.timestamp, JSON.stringify(event.detail), event.status],
    )
  }

  /**
   * Commit approval state, optional execution state, and the authoritative
   * outbox event in ONE SQLite transaction. Any statement failure rolls back
   * the whole transition, so the database never exposes a state transition
   * without its corresponding event.
   *
   * The approval upsert is a compare-and-swap (CAS): it only updates the
   * persisted row when it is still at the expected version and state. A
   * concurrent decision that already committed bumps the version, so this
   * transition's CAS misses and commitTransition throws a deterministic
   * stale/already-decided refusal (ApprovalStaleTransitionError) instead of
   * silently overwriting the authoritative event.
   */
  commitTransition(transition: ApprovalTransition): void {
    const { approval, execution, event, expected } = transition
    this.hooks.onStep?.("begin")
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const changed = this.casUpdateApproval(approval, expected)
      if (changed !== 1) {
        throw new ApprovalStaleTransitionError(expected.version, expected.state)
      }
      this.hooks.onStep?.("approval")
      this.hooks.onStep?.("execution")
      if (execution) this.upsertExecution(execution)
      this.hooks.onStep?.("outbox")
      this.insertOutboxEvent(event)
      this.hooks.onStep?.("commit")
      this.db.exec("COMMIT")
    } catch (error) {
      try {
        this.db.exec("ROLLBACK")
      } catch {
        // The transaction may already have been rolled back by SQLite.
      }
      throw error
    }
  }

  /**
   * Compare-and-swap upsert of the approval record. Returns the number of rows
   * "won" (1 = the caller's transition is authoritative).
   *
   * Two cases return 1:
   *   1. The persisted row is still at `expected.version`/`expected.state` and
   *      is updated to the transition's target — a genuine win.
   *   2. The persisted row ALREADY carries the transition's target version and
   *      state — an identical replay of a transition that already committed.
   *      This is idempotent success, NOT a silent overwrite, because the
   *      transition's content is identical to what is already durable.
   *
   * Any other persisted state (a concurrent decision bumped the version to a
   * DIFFERENT target) returns 0 rows: the caller must refuse deterministically
   * (ApprovalStaleTransitionError), never overwrite the authoritative event.
   */
  private casUpdateApproval(
    record: ApprovalRecord,
    expected: { version: number; state: ApprovalState },
  ): number {
    const current = this.db
      .query("SELECT version, state FROM approval_records WHERE approval_id = ?")
      .get(record.approvalId) as { version: number; state: string } | undefined
    // Missing row: nothing to update (distinct refusal handled by caller).
    if (!current) return 0
    // Idempotent replay: the exact target version+state is already durable.
    if (current.version === record.version && current.state === record.state) return 1
    // Otherwise enforce the CAS: only win if the row is still at the expected
    // (pre-transition) version and state.
    const result = this.db.run(
      `UPDATE approval_records SET
         version = ?,
         principal_id = ?,
         state = ?,
         approved_by = ?,
         revoked_by = ?,
         execution_id = ?,
         route = ?,
         routing_policy_version = ?,
         local_fallback_allowed = ?,
         risk_class = ?,
         expires_at = ?,
         updated_at = ?
       WHERE approval_id = ?
         AND version = ?
         AND state = ?`,
      [
        record.version,
        record.principalId ?? "",
        record.state,
        record.approvedBy ?? null,
        record.revokedBy ?? null,
        record.executionId ?? null,
        record.route ?? null,
        record.routingPolicyVersion ?? null,
        record.localFallbackAllowed === false ? 0 : 1,
        record.riskClass ?? null,
        record.expiresAt,
        record.updatedAt,
        record.approvalId,
        expected.version,
        expected.state,
      ],
    )
    return result.changes
  }

  loadPendingApprovals(sessionId: string): ApprovalRecord[] {
    const rows = this.db.query(
      "SELECT * FROM approval_records WHERE session_id = ? AND state = 'PENDING' ORDER BY created_at"
    ).all(sessionId) as any[]
    return rows.map(rowToApproval)
  }

  /**
   * Load the most recent approval bound to an exact request hash.
   * Used by the scoped-approval adapter for request-scoped lookups.
   */
  loadApprovalByRequestHash(requestHash: string): ApprovalRecord | null {
    const row = this.db.query(
      "SELECT * FROM approval_records WHERE request_hash = ? ORDER BY created_at DESC LIMIT 1"
    ).get(requestHash) as any
    if (!row) return null
    return rowToApproval(row)
  }

  /** Load every approval record (snapshot pre-computation for the PDP). */
  loadAllApprovals(): ApprovalRecord[] {
    const rows = this.db.query("SELECT * FROM approval_records ORDER BY created_at").all() as any[]
    return rows.map(rowToApproval)
  }

  // ─── Outbox Management ──────────────────────────────────────────

  getOutboxStats(): { pending: number; claimed: number; delivered: number; poisoned: number } {
    const pending = (this.db.query("SELECT COUNT(*) as c FROM approval_outbox WHERE status = 'PENDING'").get() as any).c
    const claimed = (this.db.query("SELECT COUNT(*) as c FROM approval_outbox WHERE status = 'CLAIMED'").get() as any).c
    const delivered = (this.db.query("SELECT COUNT(*) as c FROM approval_outbox WHERE status = 'DELIVERED'").get() as any).c
    const poisoned = (this.db.query("SELECT COUNT(*) as c FROM approval_outbox WHERE status = 'POISONED'").get() as any).c
    return { pending, claimed, delivered, poisoned }
  }

  getPendingOutbox(): ApprovalOutboxEvent[] {
    const rows = this.db.query("SELECT * FROM approval_outbox WHERE status = 'PENDING' ORDER BY created_at").all() as any[]
    return rows.map(rowToOutboxEvent)
  }

  markOutboxDelivered(eventId: string): void {
    this.db.run("UPDATE approval_outbox SET status = 'DELIVERED' WHERE event_id = ?", [eventId])
  }

  // ─── Lifecycle Queries ──────────────────────────────────────────

  getApprovalByExecutionId(executionId: string): ApprovalRecord | null {
    const row = this.db.query("SELECT * FROM approval_records WHERE execution_id = ?").get(executionId) as any
    if (!row) return null
    return rowToApproval(row)
  }

  getRecoveryRequired(): ApprovalExecutionRecord[] {
    const rows = this.db.query(
      "SELECT * FROM approval_executions WHERE state = 'RECOVERY_REQUIRED'"
    ).all() as any[]
    return rows.map(rowToExecution)
  }

  close(): void {
    this.db.close()
  }
}

// ─── Row Mappers ────────────────────────────────────────────────────

function rowToApproval(row: any): ApprovalRecord {
  return {
    approvalId: row.approval_id,
    version: row.version,
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    requestHash: row.request_hash,
    contractRevision: row.contract_revision,
    principalId: row.principal_id || undefined,
    state: row.state,
    approvedBy: row.approved_by ?? undefined,
    revokedBy: row.revoked_by ?? undefined,
    executionId: row.execution_id ?? undefined,
    route: row.route ?? undefined,
    routingPolicyVersion: row.routing_policy_version ?? undefined,
    localFallbackAllowed:
      row.local_fallback_allowed === undefined ? undefined : row.local_fallback_allowed === 1,
    riskClass: row.risk_class ?? undefined,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

function rowToExecution(row: any): ApprovalExecutionRecord {
  return {
    approvalId: row.approval_id,
    executionId: row.execution_id,
    approvalVersion: row.approval_version,
    requestHash: row.request_hash,
    state: row.state,
    effectReceiptHash: row.effect_receipt_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToOutboxEvent(row: any): ApprovalOutboxEvent {
  return {
    eventId: row.event_id,
    approvalId: row.approval_id,
    kind: row.kind,
    timestamp: row.timestamp,
    detail: JSON.parse(row.detail),
    status: row.status,
  }
}
