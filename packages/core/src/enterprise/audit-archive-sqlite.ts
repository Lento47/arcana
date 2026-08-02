/**
 * F6: SQLite audit archive store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { ArchiveRecord, AuditArchiveStore } from "./audit-archive"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_archive (
  tenant_id TEXT NOT NULL,
  archive_id TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  proof_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  retention_until TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0,
  custody_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (tenant_id, archive_id)
);
`

export class SqliteAuditArchiveStore implements AuditArchiveStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(record: ArchiveRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO audit_archive (
          tenant_id, archive_id, proof_id, proof_json, fingerprint, source,
          ingested_at, retention_until, legal_hold, custody_json
        ) VALUES (
          $tenantId, $archiveId, $proofId, $proofJson, $fingerprint, $source,
          $ingestedAt, $retentionUntil, $legalHold, $custodyJson
        )`,
      )
      .run({
        $tenantId: record.tenantId,
        $archiveId: record.archiveId,
        $proofId: record.proofId,
        $proofJson: record.proofJson,
        $fingerprint: record.fingerprint,
        $source: record.source,
        $ingestedAt: record.ingestedAt,
        $retentionUntil: record.retentionUntil,
        $legalHold: record.legalHold ? 1 : 0,
        $custodyJson: JSON.stringify(record.custody),
      })
  }

  get(tenantId: string, archiveId: string): ArchiveRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM audit_archive WHERE tenant_id = $tenantId AND archive_id = $archiveId`)
      .get({ $tenantId: tenantId, $archiveId: archiveId }) as ArchiveRow | null
    return row ? mapRow(row) : undefined
  }

  search(tenantId: string, query: { proofId?: string; source?: string }): ArchiveRecord[] {
    const conditions: string[] = ["tenant_id = $tenantId"]
    const params: Record<string, string> = { $tenantId: tenantId }
    if (query.proofId) {
      conditions.push("proof_id = $proofId")
      params.$proofId = query.proofId
    }
    if (query.source) {
      conditions.push("source = $source")
      params.$source = query.source
    }
    const rows = this.db
      .query(`SELECT * FROM audit_archive WHERE ${conditions.join(" AND ")} ORDER BY ingested_at ASC`)
      .all(params) as unknown as ArchiveRow[]
    return rows.map(mapRow)
  }

  update(record: ArchiveRecord): void {
    this.put(record)
  }

  delete(tenantId: string, archiveId: string): void {
    this.db
      .query(`DELETE FROM audit_archive WHERE tenant_id = $tenantId AND archive_id = $archiveId`)
      .run({ $tenantId: tenantId, $archiveId: archiveId })
  }
}

type ArchiveRow = {
  tenant_id: string
  archive_id: string
  proof_id: string
  proof_json: string
  fingerprint: string
  source: string
  ingested_at: string
  retention_until: string
  legal_hold: number
  custody_json: string
}

function mapRow(row: ArchiveRow): ArchiveRecord {
  return {
    tenantId: row.tenant_id,
    archiveId: row.archive_id,
    proofId: row.proof_id,
    proofJson: row.proof_json,
    fingerprint: row.fingerprint,
    source: row.source,
    ingestedAt: row.ingested_at,
    retentionUntil: row.retention_until,
    legalHold: row.legal_hold === 1,
    custody: JSON.parse(row.custody_json) as ArchiveRecord["custody"],
  }
}
