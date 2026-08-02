/**
 * D-4: SQLite policy bundle store.
 */

import { Database } from "bun:sqlite"
import type { PolicyBundleRecord, PolicyBundleStore } from "./policy-bundle-store"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS policy_bundles (
  sequence INTEGER PRIMARY KEY,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  digest TEXT NOT NULL,
  previous_digest TEXT,
  record_json TEXT NOT NULL,
  status TEXT NOT NULL,
  activation_time TEXT NOT NULL,
  last_known_good INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_bundles_status ON policy_bundles (status, last_known_good);
`

type PolicyBundleRow = {
  sequence: number
  policy_id: string
  policy_version: string
  digest: string
  previous_digest: string | null
  record_json: string
  status: string
  activation_time: string
  last_known_good: number
  published_at: string
}

function mapRow(row: PolicyBundleRow): PolicyBundleRecord {
  return JSON.parse(row.record_json) as PolicyBundleRecord
}

export class SqlitePolicyBundleStore implements PolicyBundleStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(record: PolicyBundleRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO policy_bundles (
          sequence, policy_id, policy_version, digest, previous_digest,
          record_json, status, activation_time, last_known_good, published_at
        ) VALUES (
          $sequence, $policyId, $policyVersion, $digest, $previousDigest,
          $recordJson, $status, $activationTime, $lastKnownGood, $publishedAt
        )`,
      )
      .run({
        $sequence: record.sequence,
        $policyId: record.policyId,
        $policyVersion: record.policyVersion,
        $digest: record.digest,
        $previousDigest: record.previousDigest ?? null,
        $recordJson: JSON.stringify(record),
        $status: record.status,
        $activationTime: record.activationTime,
        $lastKnownGood: record.lastKnownGood ? 1 : 0,
        $publishedAt: record.publishedAt,
      })
  }

  update(record: PolicyBundleRecord): void {
    this.put(record)
  }

  getBySequence(sequence: number): PolicyBundleRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM policy_bundles WHERE sequence = $sequence`)
      .get({ $sequence: sequence }) as PolicyBundleRow | null
    return row ? mapRow(row) : undefined
  }

  getByDigest(digest: string): PolicyBundleRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM policy_bundles WHERE digest = $digest`)
      .get({ $digest: digest }) as PolicyBundleRow | null
    return row ? mapRow(row) : undefined
  }

  latestActive(): PolicyBundleRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM policy_bundles WHERE status = 'ACTIVE'
         ORDER BY sequence DESC LIMIT 1`,
      )
      .get() as PolicyBundleRow | null
    return row ? mapRow(row) : undefined
  }

  lastKnownGood(): PolicyBundleRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM policy_bundles WHERE last_known_good = 1
         ORDER BY sequence DESC LIMIT 1`,
      )
      .get() as PolicyBundleRow | null
    return row ? mapRow(row) : undefined
  }

  history(): PolicyBundleRecord[] {
    const rows = this.db
      .query(`SELECT * FROM policy_bundles ORDER BY sequence ASC`)
      .all() as unknown as PolicyBundleRow[]
    return rows.map(mapRow)
  }
}
