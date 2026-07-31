/**
 * ScopedApprovalStore adapter over the durable approval_records table.
 *
 * Bridges the Phase C PEP (ScopedApprovalStore interface) and the TUI-2
 * durable lifecycle (ApprovalLifecycleStore) onto ONE sqlite table so the
 * operator service and the PEP see the same records.
 *
 * State mapping (ApprovalRecord.state -> ScopedApprovalDecision):
 *   PENDING -> PENDING        APPROVED -> APPROVED
 *   DENIED -> REJECTED        CLAIMED  -> CLAIMED
 *   CONSUMED -> CONSUMED      EXPIRED  -> EXPIRED
 *   INVALIDATED -> RECOVERY_REQUIRED
 *
 * atomicClaim uses UPDATE ... WHERE state='APPROVED' AND uses_consumed=0,
 * which is atomic in SQLite: exactly one caller wins.
 */
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import type {
  ScopedApproval,
  ScopedApprovalStore,
  ScopedApprovalDecision,
} from "../capability/scoped-approval"
import type { ApprovalRecord } from "./approval-lifecycle"
import { ScopedApprovalStoreError } from "../capability/scoped-approval"
import { APPROVAL_SCHEMA } from "./approval-store-sqlite"

const MIGRATIONS = [
  `ALTER TABLE approval_records ADD COLUMN actions_json TEXT`,
  `ALTER TABLE approval_records ADD COLUMN resource_json TEXT`,
  `ALTER TABLE approval_records ADD COLUMN uses_consumed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE approval_records ADD COLUMN claim_execution_id TEXT`,
  `ALTER TABLE approval_records ADD COLUMN lease_expires_at TEXT`,
  `ALTER TABLE approval_records ADD COLUMN decided_at TEXT`,
]

type ApprovalRow = {
  approval_id: string
  version: number
  session_id: string
  workspace_id: string
  request_hash: string
  contract_revision: number | null
  principal_id: string | null
  state: string
  approved_by: string | null
  execution_id: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  actions_json: string | null
  resource_json: string | null
  uses_consumed: number | null
  claim_execution_id: string | null
  lease_expires_at: string | null
  decided_at: string | null
}

function stateToDecision(state: string): ScopedApprovalDecision {
  switch (state) {
    case "PENDING": return "PENDING"
    case "APPROVED": return "APPROVED"
    case "DENIED": return "REJECTED"
    case "REJECTED": return "REJECTED" // PEP updateApproval writes decisions
    case "CLAIMED": return "CLAIMED"
    case "CONSUMED": return "CONSUMED"
    case "EXPIRED": return "EXPIRED"
    case "INVALIDATED": return "RECOVERY_REQUIRED"
    case "RECOVERY_REQUIRED": return "RECOVERY_REQUIRED" // pass-through
    default: return "PENDING"
  }
}

function rowToScoped(row: ApprovalRow): ScopedApproval {
  const usesConsumed = row.uses_consumed === 1 || row.state === "CONSUMED" ? 1 : 0
  return {
    id: row.approval_id,
    requestId: row.approval_id,
    requestHash: row.request_hash,
    principalId: row.principal_id ?? "",
    sessionId: row.session_id,
    contractRevision: row.contract_revision ?? undefined,
    decision: stateToDecision(row.state),
    actions: row.actions_json ? (JSON.parse(row.actions_json) as ScopedApproval["actions"]) : [],
    resource: row.resource_json
      ? (JSON.parse(row.resource_json) as ScopedApproval["resource"])
      : ({ kind: "file" } as ScopedApproval["resource"]),
    maxUses: 1,
    usesConsumed: usesConsumed,
    expiresAt: row.expires_at ?? new Date(0).toISOString(),
    createdEventId: `evt-approval-created:${row.approval_id}`,
    decidedEventId: row.decided_at ? `evt-approval-decided:${row.approval_id}` : undefined,
    claimedEventId: row.claim_execution_id ? `evt-approval-claim:${row.approval_id}` : undefined,
    consumedEventId: row.state === "CONSUMED" ? `evt-approval-consume:${row.approval_id}` : undefined,
    claimExecutionId: row.claim_execution_id ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
  }
}

/** Same row, ApprovalRecord shape — the wire/event form the TUI sync store consumes. */
function rowToApprovalRecord(row: ApprovalRow): ApprovalRecord {
  return {
    approvalId: row.approval_id,
    version: row.version,
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    requestHash: row.request_hash,
    contractRevision: row.contract_revision ?? 0,
    principalId: row.principal_id ?? undefined,
    state: (row.state as ApprovalRecord["state"]) ?? "PENDING",
    approvedBy: row.approved_by ?? undefined,
    executionId: row.execution_id ?? undefined,
    expiresAt: row.expires_at ?? new Date(0).toISOString(),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

export class SqliteScopedApprovalStore implements ScopedApprovalStore {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.run("PRAGMA journal_mode=WAL")
    this.db.run("PRAGMA synchronous=FULL")
    this.db.run("PRAGMA busy_timeout=5000")
    // Base table must exist before ALTER migrations (shared schema with
    // SqliteApprovalStore — one source of truth).
    this.db.run(APPROVAL_SCHEMA)
    this.migrate()
  }

  private migrate(): void {
    const cols = new Set<string>()
    const rows = this.db.query("PRAGMA table_info(approval_records)").all() as { name: string }[]
    for (const r of rows) cols.add(r.name)
    for (const migration of MIGRATIONS) {
      const colName = migration.match(/ADD COLUMN (\w+)/)?.[1]
      if (colName && !cols.has(colName)) {
        this.db.run(migration)
        cols.add(colName)
      }
    }
  }

  /** Close the underlying database (Windows file-lock hygiene in tests). */
  close(): void {
    try {
      this.db.close()
    } catch {
      // already closed
    }
  }

  getApproval(id: string): Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const row = this.db.query("SELECT * FROM approval_records WHERE approval_id = ?").get(id) as
          | ApprovalRow
          | undefined
        return row ? rowToScoped(row) : undefined
      },
      catch: (cause) => new ScopedApprovalStoreError("getApproval", cause),
    })
  }

  /** Read a record in wire form (ApprovalRecord) for sync-channel events. */
  getApprovalRecord(id: string): Effect.Effect<ApprovalRecord | undefined, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const row = this.db.query("SELECT * FROM approval_records WHERE approval_id = ?").get(id) as
          | ApprovalRow
          | undefined
        return row ? rowToApprovalRecord(row) : undefined
      },
      catch: (cause) => new ScopedApprovalStoreError("getApprovalRecord", cause),
    })
  }

  getApprovalForRequest(
    requestHash: string,
  ): Effect.Effect<ScopedApproval | undefined, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const row = this.db
          .query("SELECT * FROM approval_records WHERE request_hash = ? ORDER BY created_at DESC LIMIT 1")
          .get(requestHash) as ApprovalRow | undefined
        return row ? rowToScoped(row) : undefined
      },
      catch: (cause) => new ScopedApprovalStoreError("getApprovalForRequest", cause),
    })
  }

  putApproval(approval: ScopedApproval): Effect.Effect<void, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const now = new Date().toISOString()
        this.db.run(
          `INSERT INTO approval_records (
             approval_id, version, session_id, workspace_id, request_hash, contract_revision,
             principal_id, state, expires_at, actions_json, resource_json, uses_consumed,
             claim_execution_id, lease_expires_at, decided_at, updated_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(approval_id) DO UPDATE SET
             version = excluded.version,
             state = excluded.state,
             principal_id = excluded.principal_id,
             expires_at = excluded.expires_at,
             actions_json = excluded.actions_json,
             resource_json = excluded.resource_json,
             uses_consumed = excluded.uses_consumed,
             claim_execution_id = excluded.claim_execution_id,
             lease_expires_at = excluded.lease_expires_at,
             decided_at = excluded.decided_at,
             updated_at = excluded.updated_at`,
          [
            approval.id,
            1,
            approval.sessionId,
            approval.sessionId, // workspace = session-scoped in the engine path
            approval.requestHash,
            approval.contractRevision ?? 0,
            approval.principalId,
            approval.decision,
            approval.expiresAt,
            approval.actions.length ? JSON.stringify(approval.actions) : null,
            approval.resource ? JSON.stringify(approval.resource) : null,
            approval.usesConsumed,
            approval.claimExecutionId ?? null,
            approval.leaseExpiresAt ?? null,
            approval.decidedEventId ? now : null,
            now,
            now,
          ],
        )
      },
      catch: (cause) => new ScopedApprovalStoreError("putApproval", cause),
    })
  }

  updateApproval(id: string, updates: Partial<ScopedApproval>): Effect.Effect<void, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const existing = this.db.query("SELECT * FROM approval_records WHERE approval_id = ?").get(id) as
          | ApprovalRow
          | undefined
        if (!existing) return
        const now = new Date().toISOString()
        const next: ScopedApproval = { ...rowToScoped(existing), ...updates } as ScopedApproval
        this.db.run(
          `UPDATE approval_records SET
             state = ?, uses_consumed = ?, claim_execution_id = ?, lease_expires_at = ?,
             decided_at = ?, updated_at = ?
           WHERE approval_id = ?`,
          [
            next.decision,
            next.decision === "CONSUMED" ? 1 : 0,
            next.claimExecutionId ?? null,
            next.leaseExpiresAt ?? null,
            next.decision === "REJECTED" || next.decision === "CONSUMED" || next.decision === "RECOVERY_REQUIRED"
              ? now
              : existing.decided_at,
            now,
            id,
          ],
        )
      },
      catch: (cause) => new ScopedApprovalStoreError("updateApproval", cause),
    })
  }

  allApprovals(): Effect.Effect<readonly ScopedApproval[], ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const rows = this.db.query("SELECT * FROM approval_records ORDER BY created_at").all() as ApprovalRow[]
        return rows.map(rowToScoped)
      },
      catch: (cause) => new ScopedApprovalStoreError("allApprovals", cause),
    })
  }

  atomicClaim(
    id: string,
    executionId: string,
    _claimedEventId: string,
    now: string,
    leaseSeconds?: number,
  ): Effect.Effect<ScopedApproval | null, ScopedApprovalStoreError> {
    return Effect.try({
      try: () => {
        const lease = leaseSeconds ? new Date(Date.now() + leaseSeconds * 1000).toISOString() : null
        const res = this.db.run(
          `UPDATE approval_records
           SET state = 'CLAIMED', execution_id = ?, claim_execution_id = ?, lease_expires_at = ?, updated_at = ?
           WHERE approval_id = ? AND state = 'APPROVED' AND uses_consumed = 0`,
          [executionId, executionId, lease, now, id],
        )
        if (res.changes !== 1) return null
        const row = this.db.query("SELECT * FROM approval_records WHERE approval_id = ?").get(id) as
          | ApprovalRow
          | undefined
        return row ? rowToScoped(row) : null
      },
      catch: (cause) => new ScopedApprovalStoreError("atomicClaim", cause),
    })
  }
}
