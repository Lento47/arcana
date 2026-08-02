/**
 * F5: SQLite escalation store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { EscalationEvent, EscalationPolicy, EscalationStore } from "./escalation"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS escalation_policies (
  tenant_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  max_wait_ms INTEGER NOT NULL,
  fallback_approvers_json TEXT NOT NULL,
  require_break_glass INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS escalation_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  at TEXT NOT NULL,
  reason TEXT NOT NULL,
  suggested_approvers_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);
`

export class SqliteEscalationStore implements EscalationStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putPolicy(policy: EscalationPolicy): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO escalation_policies (
          tenant_id, policy_id, max_wait_ms, fallback_approvers_json, require_break_glass
        ) VALUES ($tenantId, $policyId, $maxWaitMs, $fallbackApproversJson, $requireBreakGlass)`,
      )
      .run({
        $tenantId: policy.tenantId,
        $policyId: policy.policyId,
        $maxWaitMs: policy.maxWaitMs,
        $fallbackApproversJson: JSON.stringify(policy.fallbackApprovers),
        $requireBreakGlass: policy.requireBreakGlass ? 1 : 0,
      })
  }

  getPolicy(tenantId: string): EscalationPolicy | undefined {
    const row = this.db
      .query(`SELECT * FROM escalation_policies WHERE tenant_id = $tenantId`)
      .get({ $tenantId: tenantId }) as
      | {
          policy_id: string
          max_wait_ms: number
          fallback_approvers_json: string
          require_break_glass: number
        }
      | null
    return row
      ? {
          tenantId,
          policyId: row.policy_id,
          maxWaitMs: row.max_wait_ms,
          fallbackApprovers: JSON.parse(row.fallback_approvers_json) as string[],
          requireBreakGlass: row.require_break_glass === 1,
        }
      : undefined
  }

  recordEvent(event: EscalationEvent): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO escalation_events (
          tenant_id, event_id, approval_id, at, reason, suggested_approvers_json
        ) VALUES ($tenantId, $eventId, $approvalId, $at, $reason, $suggestedApproversJson)`,
      )
      .run({
        $tenantId: event.tenantId,
        $eventId: event.eventId,
        $approvalId: event.approvalId,
        $at: event.at,
        $reason: event.reason,
        $suggestedApproversJson: JSON.stringify(event.suggestedApprovers),
      })
  }

  events(tenantId: string): EscalationEvent[] {
    const rows = this.db
      .query(`SELECT * FROM escalation_events WHERE tenant_id = $tenantId ORDER BY at ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<{
      event_id: string
      approval_id: string
      at: string
      reason: string
      suggested_approvers_json: string
    }>
    return rows.map((row) => ({
      tenantId,
      eventId: row.event_id,
      approvalId: row.approval_id,
      at: row.at,
      reason: row.reason,
      suggestedApprovers: JSON.parse(row.suggested_approvers_json) as string[],
    }))
  }
}
