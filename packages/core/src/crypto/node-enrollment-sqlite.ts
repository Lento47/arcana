/**
 * D-1: SQLite enrollment registry.
 *
 * Durable, restart-safe storage for enrolled node records. Status is indexed
 * for trust-domain key snapshots consumed by the D-8B proof-registration
 * node registry.
 */

import { Database } from "bun:sqlite"
import type { EnrolledNodeRecord, EnrollmentRegistry } from "./node-enrollment"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS node_registry (
  node_id TEXT PRIMARY KEY,
  record_json TEXT NOT NULL,
  status TEXT NOT NULL,
  trust_domain TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS node_registry_domain_status
  ON node_registry (trust_domain, status);
`

type NodeRegistryRow = {
  node_id: string
  record_json: string
  status: string
  trust_domain: string
  updated_at: string
}

export class SqliteEnrollmentRegistry implements EnrollmentRegistry {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  get(nodeId: string): EnrolledNodeRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM node_registry WHERE node_id = $nodeId`)
      .get({ $nodeId: nodeId }) as NodeRegistryRow | null
    return row ? (JSON.parse(row.record_json) as EnrolledNodeRecord) : undefined
  }

  put(record: EnrolledNodeRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO node_registry (
          node_id, record_json, status, trust_domain, updated_at
        ) VALUES ($nodeId, $recordJson, $status, $trustDomain, $updatedAt)`,
      )
      .run({
        $nodeId: record.nodeId,
        $recordJson: JSON.stringify(record),
        $status: record.status,
        $trustDomain: record.trustDomain,
        $updatedAt: new Date().toISOString(),
      })
  }

  remove(nodeId: string): void {
    this.db.query(`DELETE FROM node_registry WHERE node_id = $nodeId`).run({ $nodeId: nodeId })
  }

  list(): EnrolledNodeRecord[] {
    const rows = this.db
      .query(`SELECT * FROM node_registry ORDER BY node_id ASC`)
      .all() as unknown as NodeRegistryRow[]
    return rows.map((row) => JSON.parse(row.record_json) as EnrolledNodeRecord)
  }
}
