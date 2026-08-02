/**
 * F11: SQLite admin-event store (tenant-scoped).
 *
 * Stores canonical admin events for webhook replay, ticketing, and SIEM
 * export. Events are immutable; replays are deterministic because the
 * payload is stored verbatim.
 */

import { Database } from "bun:sqlite"
import { serializeAdminEvent, type AdminEvent } from "./admin-events"

export type AdminEventRecord = AdminEvent & { recordedAt: string }

export interface AdminEventStore {
  put(event: AdminEventRecord): void
  list(
    tenantId: string,
    opts: { kind?: AdminEvent["kind"]; since?: string },
  ): AdminEventRecord[]
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_events (
  tenant_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_key)
);

CREATE INDEX IF NOT EXISTS admin_events_kind_at
  ON admin_events (tenant_id, kind, recorded_at);
`

function eventKey(event: AdminEvent): string {
  const id =
    event.kind === "approval.pending"
      ? event.approvalId
      : event.kind === "node.revoked"
        ? event.nodeId
        : event.kind === "policy.promoted"
          ? event.policyId
          : event.alertId
  return `${event.kind}:${id}:${event.at}`
}

export class SqliteAdminEventStore implements AdminEventStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  put(event: AdminEventRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO admin_events (
          tenant_id, event_key, kind, payload_json, recorded_at
        ) VALUES ($tenantId, $eventKey, $kind, $payloadJson, $recordedAt)`,
      )
      .run({
        $tenantId: event.tenantId,
        $eventKey: eventKey(event),
        $kind: event.kind,
        $payloadJson: serializeAdminEvent(event),
        $recordedAt: event.recordedAt,
      })
  }

  list(
    tenantId: string,
    opts: { kind?: AdminEvent["kind"]; since?: string },
  ): AdminEventRecord[] {
    const conditions: string[] = ["tenant_id = $tenantId"]
    const params: Record<string, string> = { $tenantId: tenantId }
    if (opts.kind) {
      conditions.push("kind = $kind")
      params.$kind = opts.kind
    }
    if (opts.since) {
      conditions.push("recorded_at >= $since")
      params.$since = opts.since
    }
    const rows = this.db
      .query(
        `SELECT * FROM admin_events WHERE ${conditions.join(" AND ")}
         ORDER BY recorded_at ASC`,
      )
      .all(params) as unknown as Array<{
      payload_json: string
      recorded_at: string
    }>
    return rows.map((row) => ({
      ...(JSON.parse(row.payload_json) as AdminEvent),
      recordedAt: row.recorded_at,
    }))
  }
}
