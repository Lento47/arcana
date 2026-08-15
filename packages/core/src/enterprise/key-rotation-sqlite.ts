/**
 * F7: SQLite key rotation evidence store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { KeyRotationRecord, KeyRotationStore } from "./key-rotation"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS key_rotation_evidence (
  tenant_id TEXT NOT NULL,
  rotation_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  previous_epoch INTEGER NOT NULL,
  next_epoch INTEGER NOT NULL,
  previous_fingerprint TEXT NOT NULL,
  next_fingerprint TEXT NOT NULL,
  rotated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, rotation_id)
);
`

export class SqliteKeyRotationStore implements KeyRotationStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(record: KeyRotationRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO key_rotation_evidence (
          tenant_id, rotation_id, node_id, mode, previous_epoch, next_epoch,
          previous_fingerprint, next_fingerprint, rotated_at
        ) VALUES (
          $tenantId, $rotationId, $nodeId, $mode, $previousEpoch, $nextEpoch,
          $previousFingerprint, $nextFingerprint, $rotatedAt
        )`,
      )
      .run({
        $tenantId: record.tenantId,
        $rotationId: record.rotationId,
        $nodeId: record.nodeId,
        $mode: record.mode,
        $previousEpoch: record.previousEpoch,
        $nextEpoch: record.nextEpoch,
        $previousFingerprint: record.previousFingerprint,
        $nextFingerprint: record.nextFingerprint,
        $rotatedAt: record.rotatedAt,
      })
  }

  get(tenantId: string, rotationId: string): KeyRotationRecord | undefined {
    const row = this.db
      .query(
        `SELECT * FROM key_rotation_evidence
         WHERE tenant_id = $tenantId AND rotation_id = $rotationId`,
      )
      .get({ $tenantId: tenantId, $rotationId: rotationId }) as
      | {
          node_id: string
          mode: string
          previous_epoch: number
          next_epoch: number
          previous_fingerprint: string
          next_fingerprint: string
          rotated_at: string
        }
      | null
    return row
      ? {
          tenantId,
          rotationId,
          nodeId: row.node_id,
          mode: row.mode as KeyRotationRecord["mode"],
          previousEpoch: row.previous_epoch,
          nextEpoch: row.next_epoch,
          previousFingerprint: row.previous_fingerprint,
          nextFingerprint: row.next_fingerprint,
          rotatedAt: row.rotated_at,
        }
      : undefined
  }

  list(tenantId: string): KeyRotationRecord[] {
    const rows = this.db
      .query(
        `SELECT * FROM key_rotation_evidence
         WHERE tenant_id = $tenantId ORDER BY rotated_at ASC`,
      )
      .all({ $tenantId: tenantId }) as unknown as Array<{
      rotation_id: string
      node_id: string
      mode: string
      previous_epoch: number
      next_epoch: number
      previous_fingerprint: string
      next_fingerprint: string
      rotated_at: string
    }>
    return rows.map((row) => ({
      tenantId,
      rotationId: row.rotation_id,
      nodeId: row.node_id,
      mode: row.mode as KeyRotationRecord["mode"],
      previousEpoch: row.previous_epoch,
      nextEpoch: row.next_epoch,
      previousFingerprint: row.previous_fingerprint,
      nextFingerprint: row.next_fingerprint,
      rotatedAt: row.rotated_at,
    }))
  }
}
