/**
 * F4: SQLite upgrade-ring store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { RingNodeAssignment, UpgradeRing, UpgradeRingStore } from "./upgrade-rings"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS upgrade_rings (
  tenant_id TEXT NOT NULL,
  ring_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_version TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, ring_id)
);

CREATE TABLE IF NOT EXISTS ring_node_assignments (
  tenant_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  ring_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, node_id)
);
`

export class SqliteUpgradeRingStore implements UpgradeRingStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putRing(ring: UpgradeRing): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO upgrade_rings (
          tenant_id, ring_id, name, target_version, paused, created_at
        ) VALUES ($tenantId, $ringId, $name, $targetVersion, $paused, $createdAt)`,
      )
      .run({
        $tenantId: ring.tenantId,
        $ringId: ring.ringId,
        $name: ring.name,
        $targetVersion: ring.targetVersion,
        $paused: ring.paused ? 1 : 0,
        $createdAt: ring.createdAt,
      })
  }

  getRing(tenantId: string, ringId: string): UpgradeRing | undefined {
    const row = this.db
      .query(`SELECT * FROM upgrade_rings WHERE tenant_id = $tenantId AND ring_id = $ringId`)
      .get({ $tenantId: tenantId, $ringId: ringId }) as
      | {
          name: string
          target_version: string
          paused: number
          created_at: string
        }
      | null
    return row
      ? {
          tenantId,
          ringId,
          name: row.name,
          targetVersion: row.target_version,
          paused: row.paused === 1,
          createdAt: row.created_at,
        }
      : undefined
  }

  listRings(tenantId: string): UpgradeRing[] {
    const rows = this.db
      .query(`SELECT * FROM upgrade_rings WHERE tenant_id = $tenantId ORDER BY ring_id ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<{
      ring_id: string
      name: string
      target_version: string
      paused: number
      created_at: string
    }>
    return rows.map((row) => ({
      tenantId,
      ringId: row.ring_id,
      name: row.name,
      targetVersion: row.target_version,
      paused: row.paused === 1,
      createdAt: row.created_at,
    }))
  }

  assignNode(assignment: RingNodeAssignment): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO ring_node_assignments (
          tenant_id, node_id, ring_id, assigned_at
        ) VALUES ($tenantId, $nodeId, $ringId, $assignedAt)`,
      )
      .run({
        $tenantId: assignment.tenantId,
        $nodeId: assignment.nodeId,
        $ringId: assignment.ringId,
        $assignedAt: assignment.assignedAt,
      })
  }

  nodeRing(tenantId: string, nodeId: string): RingNodeAssignment | undefined {
    const row = this.db
      .query(
        `SELECT * FROM ring_node_assignments WHERE tenant_id = $tenantId AND node_id = $nodeId`,
      )
      .get({ $tenantId: tenantId, $nodeId: nodeId }) as
      | { ring_id: string; assigned_at: string }
      | null
    return row
      ? {
          tenantId,
          nodeId,
          ringId: row.ring_id,
          assignedAt: row.assigned_at,
        }
      : undefined
  }
}
