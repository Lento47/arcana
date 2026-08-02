/**
 * F4: SQLite fleet store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { FleetNodeRecord, FleetStore } from "./fleet"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fleet_nodes (
  tenant_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  version TEXT NOT NULL,
  upgrade_ring INTEGER NOT NULL,
  node_key_epoch INTEGER NOT NULL,
  enforcement_mode TEXT NOT NULL,
  policy_sequence INTEGER NOT NULL,
  policy_digest TEXT NOT NULL,
  revocation_sequence INTEGER NOT NULL,
  revocation_digest TEXT NOT NULL,
  proof_backlog INTEGER NOT NULL,
  last_seen_at TEXT,
  last_sync_at TEXT,
  registered_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (tenant_id, node_id)
);
`

export class SqliteFleetStore implements FleetStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putNode(record: FleetNodeRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO fleet_nodes (
          tenant_id, node_id, organization_id, environment, version, upgrade_ring,
          node_key_epoch, enforcement_mode, policy_sequence, policy_digest,
          revocation_sequence, revocation_digest, proof_backlog,
          last_seen_at, last_sync_at, registered_at, revoked_at
        ) VALUES (
          $tenantId, $nodeId, $organizationId, $environment, $version, $upgradeRing,
          $nodeKeyEpoch, $enforcementMode, $policySequence, $policyDigest,
          $revocationSequence, $revocationDigest, $proofBacklog,
          $lastSeenAt, $lastSyncAt, $registeredAt, $revokedAt
        )`,
      )
      .run({
        $tenantId: record.tenantId,
        $nodeId: record.nodeId,
        $organizationId: record.organizationId,
        $environment: record.environment,
        $version: record.version,
        $upgradeRing: record.upgradeRing,
        $nodeKeyEpoch: record.nodeKeyEpoch,
        $enforcementMode: record.enforcementMode,
        $policySequence: record.policySequence,
        $policyDigest: record.policyDigest,
        $revocationSequence: record.revocationSequence,
        $revocationDigest: record.revocationDigest,
        $proofBacklog: record.proofBacklog,
        $lastSeenAt: record.lastSeenAt ?? null,
        $lastSyncAt: record.lastSyncAt ?? null,
        $registeredAt: record.registeredAt,
        $revokedAt: record.revokedAt ?? null,
      })
  }

  getNode(tenantId: string, nodeId: string): FleetNodeRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM fleet_nodes WHERE tenant_id = $tenantId AND node_id = $nodeId`)
      .get({ $tenantId: tenantId, $nodeId: nodeId }) as FleetRow | null
    return row ? mapRow(row) : undefined
  }

  listNodes(tenantId: string): FleetNodeRecord[] {
    const rows = this.db
      .query(`SELECT * FROM fleet_nodes WHERE tenant_id = $tenantId ORDER BY node_id ASC`)
      .all({ $tenantId: tenantId }) as unknown as FleetRow[]
    return rows.map(mapRow)
  }

  updateHeartbeat(
    tenantId: string,
    nodeId: string,
    heartbeat: Partial<
      Pick<
        FleetNodeRecord,
        | "lastSeenAt"
        | "lastSyncAt"
        | "policySequence"
        | "policyDigest"
        | "revocationSequence"
        | "revocationDigest"
        | "proofBacklog"
        | "enforcementMode"
      >
    >,
  ): void {
    const fields: string[] = []
    const params: Record<string, string | number> = { $tenantId: tenantId, $nodeId: nodeId }
    for (const [key, value] of Object.entries(heartbeat)) {
      if (value === undefined) continue
      const column = key === "lastSeenAt" ? "last_seen_at"
        : key === "lastSyncAt" ? "last_sync_at"
        : key === "policySequence" ? "policy_sequence"
        : key === "policyDigest" ? "policy_digest"
        : key === "revocationSequence" ? "revocation_sequence"
        : key === "revocationDigest" ? "revocation_digest"
        : key === "proofBacklog" ? "proof_backlog"
        : "enforcement_mode"
      fields.push(`${column} = $${key}`)
      params[`$${key}`] = value as string | number
    }
    if (fields.length === 0) return
    this.db
      .query(
        `UPDATE fleet_nodes SET ${fields.join(", ")}
         WHERE tenant_id = $tenantId AND node_id = $nodeId`,
      )
      .run(params)
  }

  setRevoked(tenantId: string, nodeId: string, revokedAt: string): void {
    this.db
      .query(
        `UPDATE fleet_nodes SET revoked_at = $revokedAt
         WHERE tenant_id = $tenantId AND node_id = $nodeId`,
      )
      .run({ $tenantId: tenantId, $nodeId: nodeId, $revokedAt: revokedAt })
  }
}

type FleetRow = {
  tenant_id: string
  node_id: string
  organization_id: string
  environment: string
  version: string
  upgrade_ring: number
  node_key_epoch: number
  enforcement_mode: string
  policy_sequence: number
  policy_digest: string
  revocation_sequence: number
  revocation_digest: string
  proof_backlog: number
  last_seen_at: string | null
  last_sync_at: string | null
  registered_at: string
  revoked_at: string | null
}

function mapRow(row: FleetRow): FleetNodeRecord {
  return {
    tenantId: row.tenant_id,
    nodeId: row.node_id,
    organizationId: row.organization_id,
    environment: row.environment,
    version: row.version,
    upgradeRing: row.upgrade_ring,
    nodeKeyEpoch: row.node_key_epoch,
    enforcementMode: row.enforcement_mode as FleetNodeRecord["enforcementMode"],
    policySequence: row.policy_sequence,
    policyDigest: row.policy_digest,
    revocationSequence: row.revocation_sequence,
    revocationDigest: row.revocation_digest,
    proofBacklog: row.proof_backlog,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    registeredAt: row.registered_at,
    revokedAt: row.revoked_at ?? undefined,
  }
}
