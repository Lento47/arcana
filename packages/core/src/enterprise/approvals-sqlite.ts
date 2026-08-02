/**
 * F5: SQLite central approval store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { CentralApprovalRecord, CentralApprovalStatus, CentralApprovalStore } from "./approvals"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS central_approvals (
  tenant_id TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  approver_id TEXT,
  status TEXT NOT NULL,
  exact_request_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (tenant_id, approval_id)
);
`

export class SqliteCentralApprovalStore implements CentralApprovalStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(record: CentralApprovalRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO central_approvals (
          tenant_id, approval_id, request_hash, requester_id, approver_id, status,
          exact_request_json, created_at, expires_at, decided_at
        ) VALUES (
          $tenantId, $approvalId, $requestHash, $requesterId, $approverId, $status,
          $exactRequestJson, $createdAt, $expiresAt, $decidedAt
        )`,
      )
      .run({
        $tenantId: record.tenantId,
        $approvalId: record.approvalId,
        $requestHash: record.requestHash,
        $requesterId: record.requesterId,
        $approverId: record.approverId ?? null,
        $status: record.status,
        $exactRequestJson: record.exactRequestJson,
        $createdAt: record.createdAt,
        $expiresAt: record.expiresAt,
        $decidedAt: record.decidedAt ?? null,
      })
  }

  get(tenantId: string, approvalId: string): CentralApprovalRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM central_approvals
         WHERE tenant_id = $tenantId AND approval_id = $approvalId`,
      )
      .get({ $tenantId: tenantId, $approvalId: approvalId }) as ApprovalRow | null
    return row ? mapRow(row) : undefined
  }

  list(tenantId: string, status: CentralApprovalStatus): CentralApprovalRecord[] {
    const rows = this.db
      .query(
        `SELECT * FROM central_approvals
         WHERE tenant_id = $tenantId AND status = $status
         ORDER BY created_at ASC`,
      )
      .all({ $tenantId: tenantId, $status: status }) as unknown as ApprovalRow[]
    return rows.map(mapRow)
  }

  updateStatus(tenantId: string, approvalId: string, status: CentralApprovalStatus, decidedAt: string): void {
    this.db
      .query(
        `UPDATE central_approvals SET status = $status, decided_at = $decidedAt
         WHERE tenant_id = $tenantId AND approval_id = $approvalId`,
      )
      .run({ $tenantId: tenantId, $approvalId: approvalId, $status: status, $decidedAt: decidedAt })
  }
}

type ApprovalRow = {
  tenant_id: string
  approval_id: string
  request_hash: string
  requester_id: string
  approver_id: string | null
  status: string
  exact_request_json: string
  created_at: string
  expires_at: string
  decided_at: string | null
}

function mapRow(row: ApprovalRow): CentralApprovalRecord {
  return {
    tenantId: row.tenant_id,
    approvalId: row.approval_id,
    requestHash: row.request_hash,
    requesterId: row.requester_id,
    approverId: row.approver_id ?? undefined,
    status: row.status as CentralApprovalStatus,
    exactRequestJson: row.exact_request_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at ?? undefined,
  }
}
