/**
 * D-8B (node side): SQLite proof upload outbox.
 *
 * Durable, restart-safe storage for signed proof batches awaiting
 * control-plane registration. Idempotent by PRIMARY KEY (node_id,
 * batch_root); due-batch selection honors next_attempt_at so a crashed or
 * restarted node resumes exactly where it stopped.
 */

import { Database } from "bun:sqlite"
import type { ProofOutboxPort, ProofOutboxRecord } from "./proof-uploader"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS proof_outbox (
  node_id TEXT NOT NULL,
  batch_root TEXT NOT NULL,
  record_json TEXT NOT NULL,
  state TEXT NOT NULL,
  next_attempt_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (node_id, batch_root)
);

CREATE INDEX IF NOT EXISTS proof_outbox_due
  ON proof_outbox (node_id, state, next_attempt_at);
`

type ProofOutboxRow = {
  node_id: string
  batch_root: string
  record_json: string
  state: string
  next_attempt_at: string | null
  updated_at: string
}

function mapRow(row: ProofOutboxRow): ProofOutboxRecord {
  return JSON.parse(row.record_json) as ProofOutboxRecord
}

export class SqliteProofOutbox implements ProofOutboxPort {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  upsert(record: ProofOutboxRecord): void {
    const now = new Date().toISOString()
    this.db
      .query(
        `INSERT OR REPLACE INTO proof_outbox (
          node_id, batch_root, record_json, state, next_attempt_at, updated_at
        ) VALUES ($nodeId, $batchRoot, $recordJson, $state, $nextAttemptAt, $updatedAt)`,
      )
      .run({
        $nodeId: record.nodeId,
        $batchRoot: record.batchRoot,
        $recordJson: JSON.stringify(record),
        $state: record.state,
        $nextAttemptAt: record.nextAttemptAt ?? null,
        $updatedAt: now,
      })
  }

  get(nodeId: string, batchRoot: string): ProofOutboxRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM proof_outbox WHERE node_id = $nodeId AND batch_root = $batchRoot`,
      )
      .get({ $nodeId: nodeId, $batchRoot: batchRoot }) as ProofOutboxRow | null
    return row ? mapRow(row) : undefined
  }

  pendingDue(nodeId: string, now: Date): ProofOutboxRecord[] {
    const rows = this.db
      .query(
        `SELECT * FROM proof_outbox
         WHERE node_id = $nodeId AND state = 'PENDING_REGISTRATION'
           AND (next_attempt_at IS NULL OR next_attempt_at <= $now)
         ORDER BY rowid ASC`,
      )
      .all({ $nodeId: nodeId, $now: now.toISOString() }) as unknown as ProofOutboxRow[]
    return rows.map(mapRow)
  }

  update(record: ProofOutboxRecord): void {
    this.upsert(record)
  }

  stats(nodeId: string): { pending: number; registered: number; poisoned: number } {
    const rows = this.db
      .query(
        `SELECT state, COUNT(*) AS c FROM proof_outbox
         WHERE node_id = $nodeId GROUP BY state`,
      )
      .all({ $nodeId: nodeId }) as unknown as Array<{ state: string; c: number }>
    const stats = { pending: 0, registered: 0, poisoned: 0 }
    for (const row of rows) {
      if (row.state === "PENDING_REGISTRATION") stats.pending = row.c
      else if (row.state === "REGISTERED") stats.registered = row.c
      else if (row.state === "POISONED") stats.poisoned = row.c
    }
    return stats
  }
}
