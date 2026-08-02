/**
 * D-5: SQLite revocation statement store.
 */

import { Database } from "bun:sqlite"
import type { RevocationRecord, RevocationStore } from "./revocation-store"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS revocation_statements (
  sequence INTEGER PRIMARY KEY,
  issuer_id TEXT NOT NULL,
  issuer_epoch INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);
`

type RevocationRow = {
  sequence: number
  issuer_id: string
  issuer_epoch: number
  subject_type: string
  subject_id: string
  reason: string
  effective_at: string
  issued_at: string
  record_json: string
  published_at: string
}

function mapRow(row: RevocationRow): RevocationRecord {
  return JSON.parse(row.record_json) as RevocationRecord
}

export class SqliteRevocationStore implements RevocationStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(record: RevocationRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO revocation_statements (
          sequence, issuer_id, issuer_epoch, subject_type, subject_id,
          reason, effective_at, issued_at, record_json, published_at
        ) VALUES (
          $sequence, $issuerId, $issuerEpoch, $subjectType, $subjectId,
          $reason, $effectiveAt, $issuedAt, $recordJson, $publishedAt
        )`,
      )
      .run({
        $sequence: record.sequence,
        $issuerId: record.issuerId,
        $issuerEpoch: record.issuerEpoch,
        $subjectType: record.subjectType,
        $subjectId: record.subjectId,
        $reason: record.reason,
        $effectiveAt: record.effectiveAt,
        $issuedAt: record.issuedAt,
        $recordJson: JSON.stringify(record),
        $publishedAt: record.publishedAt,
      })
  }

  getBySequence(sequence: number): RevocationRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM revocation_statements WHERE sequence = $sequence`)
      .get({ $sequence: sequence }) as RevocationRow | null
    return row ? mapRow(row) : undefined
  }

  last(): RevocationRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM revocation_statements ORDER BY sequence DESC LIMIT 1`)
      .get() as RevocationRow | null
    return row ? mapRow(row) : undefined
  }

  history(): RevocationRecord[] {
    const rows = this.db
      .query(`SELECT * FROM revocation_statements ORDER BY sequence ASC`)
      .all() as unknown as RevocationRow[]
    return rows.map(mapRow)
  }
}
