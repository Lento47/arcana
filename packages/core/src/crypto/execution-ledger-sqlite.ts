/**
 * D-6: SQLite distributed execution ledger.
 */

import { Database } from "bun:sqlite"
import type { ExecutionLedger, ExecutionLedgerRecord } from "./execution-ledger"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS distributed_executions (
  execution_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  effect_outcome_json TEXT,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS distributed_executions_status
  ON distributed_executions (status);
`

type ExecutionRow = {
  execution_id: string
  node_id: string
  session_id: string
  request_hash: string
  grant_id: string
  nonce: string
  status: string
  effect_outcome_json: string | null
  first_seen_at: string
  updated_at: string
}

function mapRow(row: ExecutionRow): ExecutionLedgerRecord {
  return {
    key: {
      executionId: row.execution_id,
      nodeId: row.node_id,
      sessionId: row.session_id,
      requestHash: row.request_hash,
      grantId: row.grant_id,
      nonce: row.nonce,
    },
    status: row.status as ExecutionLedgerRecord["status"],
    effectOutcomeJson: row.effect_outcome_json ?? undefined,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
  }
}

export class SqliteExecutionLedger implements ExecutionLedger {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  get(executionId: string): ExecutionLedgerRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM distributed_executions WHERE execution_id = $executionId`)
      .get({ $executionId: executionId }) as ExecutionRow | null
    return row ? mapRow(row) : undefined
  }

  claim(record: ExecutionLedgerRecord): "CLAIMED" | "EXISTING" {
    const result = this.db
      .query(
        `INSERT OR IGNORE INTO distributed_executions (
          execution_id, node_id, session_id, request_hash, grant_id, nonce,
          status, effect_outcome_json, first_seen_at, updated_at
        ) VALUES (
          $executionId, $nodeId, $sessionId, $requestHash, $grantId, $nonce,
          $status, NULL, $firstSeenAt, $updatedAt
        )`,
      )
      .run({
        $executionId: record.key.executionId,
        $nodeId: record.key.nodeId,
        $sessionId: record.key.sessionId,
        $requestHash: record.key.requestHash,
        $grantId: record.key.grantId,
        $nonce: record.key.nonce,
        $status: record.status,
        $firstSeenAt: record.firstSeenAt,
        $updatedAt: record.updatedAt,
      })
    return result.changes > 0 ? "CLAIMED" : "EXISTING"
  }

  updateStatus(executionId: string, status: string, updatedAt: Date): void {
    this.db
      .query(
        `UPDATE distributed_executions SET status = $status, updated_at = $updatedAt
         WHERE execution_id = $executionId`,
      )
      .run({
        $status: status,
        $updatedAt: updatedAt.toISOString(),
        $executionId: executionId,
      })
  }

  attachOutcome(executionId: string, outcomeJson: string, updatedAt: Date): void {
    this.db
      .query(
        `UPDATE distributed_executions SET effect_outcome_json = $outcomeJson, updated_at = $updatedAt
         WHERE execution_id = $executionId`,
      )
      .run({
        $outcomeJson: outcomeJson,
        $updatedAt: updatedAt.toISOString(),
        $executionId: executionId,
      })
  }
}
