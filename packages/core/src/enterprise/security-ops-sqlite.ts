/**
 * F9: SQLite security-ops store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type {
  IncidentTimelineEvent,
  SecurityAlert,
  SecurityOpsStore,
} from "./security-ops"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS security_alerts (
  tenant_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_id TEXT,
  detail TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, alert_id)
);

CREATE TABLE IF NOT EXISTS incident_timeline (
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  PRIMARY KEY (tenant_id, incident_id, at, event)
);
`

export class SqliteSecurityOpsStore implements SecurityOpsStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putAlert(alert: SecurityAlert): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO security_alerts (
          tenant_id, alert_id, severity, kind, subject_id, detail, at
        ) VALUES ($tenantId, $alertId, $severity, $kind, $subjectId, $detail, $at)`,
      )
      .run({
        $tenantId: alert.tenantId,
        $alertId: alert.alertId,
        $severity: alert.severity,
        $kind: alert.kind,
        $subjectId: alert.subjectId ?? null,
        $detail: alert.detail,
        $at: alert.at,
      })
  }

  alerts(tenantId: string, severity?: SecurityAlert["severity"]): SecurityAlert[] {
    const rows = (severity
      ? this.db
          .query(
            `SELECT * FROM security_alerts
             WHERE tenant_id = $tenantId AND severity = $severity
             ORDER BY at ASC`,
          )
          .all({ $tenantId: tenantId, $severity: severity })
      : this.db
          .query(`SELECT * FROM security_alerts WHERE tenant_id = $tenantId ORDER BY at ASC`)
          .all({ $tenantId: tenantId })) as unknown as Array<{
      alert_id: string
      severity: string
      kind: string
      subject_id: string | null
      detail: string
      at: string
    }>
    return rows.map((row) => ({
      tenantId,
      alertId: row.alert_id,
      severity: row.severity as SecurityAlert["severity"],
      kind: row.kind,
      subjectId: row.subject_id ?? undefined,
      detail: row.detail,
      at: row.at,
    }))
  }

  appendTimeline(event: IncidentTimelineEvent): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO incident_timeline (
          tenant_id, incident_id, at, actor, event
        ) VALUES ($tenantId, $incidentId, $at, $actor, $event)`,
      )
      .run({
        $tenantId: event.tenantId,
        $incidentId: event.incidentId,
        $at: event.at,
        $actor: event.actor,
        $event: event.event,
      })
  }

  timeline(tenantId: string, incidentId: string): IncidentTimelineEvent[] {
    const rows = this.db
      .query(
        `SELECT * FROM incident_timeline
         WHERE tenant_id = $tenantId AND incident_id = $incidentId
         ORDER BY at ASC`,
      )
      .all({ $tenantId: tenantId, $incidentId: incidentId }) as unknown as Array<{
      incident_id: string
      at: string
      actor: string
      event: string
    }>
    return rows.map((row) => ({
      tenantId,
      incidentId: row.incident_id,
      at: row.at,
      actor: row.actor,
      event: row.event,
    }))
  }

  allTimeline(tenantId: string): IncidentTimelineEvent[] {
    const rows = this.db
      .query(
        `SELECT * FROM incident_timeline WHERE tenant_id = $tenantId ORDER BY at ASC`,
      )
      .all({ $tenantId: tenantId }) as unknown as Array<{
      incident_id: string
      at: string
      actor: string
      event: string
    }>
    return rows.map((row) => ({
      tenantId,
      incidentId: row.incident_id,
      at: row.at,
      actor: row.actor,
      event: row.event,
    }))
  }
}
