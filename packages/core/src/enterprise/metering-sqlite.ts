/**
 * F12: SQLite metering store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { MeteringStore, UsageEvent } from "./metering"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS usage_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  units INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS usage_events_feature_at
  ON usage_events (tenant_id, feature, at);
`

export class SqliteMeteringStore implements MeteringStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putUsage(event: UsageEvent): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO usage_events (
          tenant_id, event_id, feature, units, at
        ) VALUES ($tenantId, $eventId, $feature, $units, $at)`,
      )
      .run({
        $tenantId: event.tenantId,
        $eventId: event.eventId,
        $feature: event.feature,
        $units: event.units,
        $at: event.at,
      })
  }

  usage(tenantId: string, feature: string, since: string): number {
    const row = this.db
      .query(
        `SELECT COALESCE(SUM(units), 0) AS total FROM usage_events
         WHERE tenant_id = $tenantId AND feature = $feature AND at >= $since`,
      )
      .get({ $tenantId: tenantId, $feature: feature, $since: since }) as { total: number }
    return row.total
  }

  allUsage(tenantId: string): UsageEvent[] {
    const rows = this.db
      .query(`SELECT * FROM usage_events WHERE tenant_id = $tenantId ORDER BY at ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<{
      event_id: string
      feature: string
      units: number
      at: string
    }>
    return rows.map((row) => ({
      tenantId,
      eventId: row.event_id,
      feature: row.feature,
      units: row.units,
      at: row.at,
    }))
  }
}
