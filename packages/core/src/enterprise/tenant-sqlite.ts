/**
 * F1: SQLite tenant store. Every table carries tenant_id; every query filters
 * by it, so cross-tenant reads return nothing by construction.
 */

import { Database } from "bun:sqlite"
import type {
  Organization,
  TenantId,
  TenantScopedRecord,
  TenantStore,
} from "./tenant"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenant_organizations (
  tenant_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_records (
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, kind, id)
);

CREATE INDEX IF NOT EXISTS tenant_records_kind ON tenant_records (tenant_id, kind);
`

export class SqliteTenantStore implements TenantStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putOrganization(org: Organization): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_organizations (tenant_id, id, name, created_at)
         VALUES ($tenantId, $id, $name, $createdAt)`,
      )
      .run({
        $tenantId: org.tenantId,
        $id: org.id,
        $name: org.name,
        $createdAt: org.createdAt,
      })
  }

  getOrganization(tenantId: TenantId): Organization | undefined {
    const row = this.db
      .query(`SELECT * FROM tenant_organizations WHERE tenant_id = $tenantId`)
      .get({ $tenantId: tenantId }) as
      | { tenant_id: string; id: string; name: string; created_at: string }
      | null
    return row
      ? { tenantId: row.tenant_id, id: row.id, name: row.name, createdAt: row.created_at }
      : undefined
  }

  putRecord(record: TenantScopedRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_records (tenant_id, kind, id, record_json)
         VALUES ($tenantId, $kind, $id, $recordJson)`,
      )
      .run({
        $tenantId: record.tenantId,
        $kind: record.kind,
        $id: record.id,
        $recordJson: JSON.stringify(record),
      })
  }

  listRecords(tenantId: TenantId, kind: TenantScopedRecord["kind"]): TenantScopedRecord[] {
    const rows = this.db
      .query(
        `SELECT * FROM tenant_records
         WHERE tenant_id = $tenantId AND kind = $kind
         ORDER BY id ASC`,
      )
      .all({ $tenantId: tenantId, $kind: kind }) as unknown as Array<{ record_json: string }>
    return rows.map((row) => JSON.parse(row.record_json) as TenantScopedRecord)
  }

  getRecord(
    tenantId: TenantId,
    kind: TenantScopedRecord["kind"],
    id: string,
  ): TenantScopedRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM tenant_records
         WHERE tenant_id = $tenantId AND kind = $kind AND id = $id`,
      )
      .get({ $tenantId: tenantId, $kind: kind, $id: id }) as
      | { record_json: string }
      | null
    return row ? (JSON.parse(row.record_json) as TenantScopedRecord) : undefined
  }

  deleteTenant(tenantId: TenantId): { removedOrganizations: number; removedRecords: number } {
    const orgs = this.db
      .query(`DELETE FROM tenant_organizations WHERE tenant_id = $tenantId`)
      .run({ $tenantId: tenantId })
    const records = this.db
      .query(`DELETE FROM tenant_records WHERE tenant_id = $tenantId`)
      .run({ $tenantId: tenantId })
    return {
      removedOrganizations: Number(orgs.changes),
      removedRecords: Number(records.changes),
    }
  }
}
