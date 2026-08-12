/**
 * F7: SQLite reliability store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { BackupRecord, DrillRecord, ReliabilityStore } from "./reliability"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS reliability_backups (
  tenant_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  digest TEXT NOT NULL,
  restored_at TEXT,
  fingerprint TEXT,
  PRIMARY KEY (tenant_id, backup_id)
);

CREATE TABLE IF NOT EXISTS reliability_drills (
  tenant_id TEXT NOT NULL,
  drill_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  restored_digest TEXT NOT NULL,
  measured_rpo_ms INTEGER NOT NULL,
  measured_rto_ms INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, drill_id)
);
`

export class SqliteReliabilityStore implements ReliabilityStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
    // Migration guard: control-plane databases created before the key
    // backup surface gained the fingerprint column keep working.
    const columns = this.db.query("PRAGMA table_info(reliability_backups)").all() as Array<{
      name: string
    }>
    if (!columns.some((column) => column.name === "fingerprint")) {
      this.db.exec("ALTER TABLE reliability_backups ADD COLUMN fingerprint TEXT")
    }
  }

  putBackup(record: BackupRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO reliability_backups (
          tenant_id, backup_id, kind, created_at, digest, restored_at, fingerprint
        ) VALUES ($tenantId, $backupId, $kind, $createdAt, $digest, $restoredAt, $fingerprint)`,
      )
      .run({
        $tenantId: record.tenantId,
        $backupId: record.backupId,
        $kind: record.kind,
        $createdAt: record.createdAt,
        $digest: record.digest,
        $restoredAt: record.restoredAt ?? null,
        $fingerprint: record.fingerprint ?? null,
      })
  }

  getBackup(tenantId: string, backupId: string): BackupRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM reliability_backups WHERE tenant_id = $tenantId AND backup_id = $backupId`,
      )
      .get({ $tenantId: tenantId, $backupId: backupId }) as
      | {
          backup_id: string
          kind: string
          created_at: string
          digest: string
          restored_at: string | null
          fingerprint: string | null
        }
      | null
    return row
      ? {
          tenantId,
          backupId: row.backup_id,
          kind: row.kind as BackupRecord["kind"],
          createdAt: row.created_at,
          digest: row.digest,
          restoredAt: row.restored_at ?? undefined,
          fingerprint: row.fingerprint ?? undefined,
        }
      : undefined
  }

  recordDrill(drill: DrillRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO reliability_drills (
          tenant_id, drill_id, started_at, finished_at, restored_digest,
          measured_rpo_ms, measured_rto_ms
        ) VALUES (
          $tenantId, $drillId, $startedAt, $finishedAt, $restoredDigest,
          $measuredRpoMs, $measuredRtoMs
        )`,
      )
      .run({
        $tenantId: drill.tenantId,
        $drillId: drill.drillId,
        $startedAt: drill.startedAt,
        $finishedAt: drill.finishedAt,
        $restoredDigest: drill.restoredDigest,
        $measuredRpoMs: drill.measuredRpoMs,
        $measuredRtoMs: drill.measuredRtoMs,
      })
  }

  drills(tenantId: string): DrillRecord[] {
    const rows = this.db
      .query(`SELECT * FROM reliability_drills WHERE tenant_id = $tenantId ORDER BY finished_at ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<{
      drill_id: string
      started_at: string
      finished_at: string
      restored_digest: string
      measured_rpo_ms: number
      measured_rto_ms: number
    }>
    return rows.map((row) => ({
      tenantId,
      drillId: row.drill_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      restoredDigest: row.restored_digest,
      measuredRpoMs: row.measured_rpo_ms,
      measuredRtoMs: row.measured_rto_ms,
    }))
  }
}
