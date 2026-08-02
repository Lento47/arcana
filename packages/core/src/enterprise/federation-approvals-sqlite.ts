/**
 * F8: SQLite cross-org approval store.
 */

import { Database } from "bun:sqlite"
import type {
  CrossOrgApprovalRule,
  CrossOrgApprovalStore,
  RoutedApproval,
} from "./federation-approvals"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cross_org_approval_rules (
  rule_id TEXT PRIMARY KEY,
  org_a TEXT NOT NULL,
  org_b TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  action_patterns_json TEXT NOT NULL,
  max_per_day INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_org_routed_approvals (
  routing_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  org_a TEXT NOT NULL,
  org_b TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  action TEXT NOT NULL,
  routed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cross_org_routed_org_b
  ON cross_org_routed_approvals (org_b, routed_at);
`

export class SqliteCrossOrgApprovalStore implements CrossOrgApprovalStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putRule(rule: CrossOrgApprovalRule): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO cross_org_approval_rules (
          rule_id, org_a, org_b, agreement_id, action_patterns_json, max_per_day
        ) VALUES ($ruleId, $orgA, $orgB, $agreementId, $actionPatternsJson, $maxPerDay)`,
      )
      .run({
        $ruleId: rule.ruleId,
        $orgA: rule.orgA,
        $orgB: rule.orgB,
        $agreementId: rule.agreementId,
        $actionPatternsJson: JSON.stringify(rule.actionPatterns),
        $maxPerDay: rule.maxPerDay,
      })
  }

  getRule(ruleId: string): CrossOrgApprovalRule | undefined {
    const row = this.db
      .query(`SELECT * FROM cross_org_approval_rules WHERE rule_id = $ruleId`)
      .get({ $ruleId: ruleId }) as
      | {
          org_a: string
          org_b: string
          agreement_id: string
          action_patterns_json: string
          max_per_day: number
        }
      | null
    return row ? mapRule(ruleId, row) : undefined
  }

  listRules(orgId: string): CrossOrgApprovalRule[] {
    const rows = this.db
      .query(`SELECT * FROM cross_org_approval_rules WHERE org_a = $orgId ORDER BY rule_id ASC`)
      .all({ $orgId: orgId }) as unknown as Array<{
      rule_id: string
      org_a: string
      org_b: string
      agreement_id: string
      action_patterns_json: string
      max_per_day: number
    }>
    return rows.map((row) => mapRule(row.rule_id, row))
  }

  putRouted(record: RoutedApproval): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO cross_org_routed_approvals (
          routing_id, rule_id, org_a, org_b, agreement_id, approval_id, action, routed_at
        ) VALUES (
          $routingId, $ruleId, $orgA, $orgB, $agreementId, $approvalId, $action, $routedAt
        )`,
      )
      .run({
        $routingId: record.routingId,
        $ruleId: record.ruleId,
        $orgA: record.orgA,
        $orgB: record.orgB,
        $agreementId: record.agreementId,
        $approvalId: record.approvalId,
        $action: record.action,
        $routedAt: record.routedAt,
      })
  }

  routedSince(orgId: string, since: string): RoutedApproval[] {
    const rows = this.db
      .query(
        `SELECT * FROM cross_org_routed_approvals
         WHERE org_b = $orgId AND routed_at >= $since ORDER BY routed_at ASC`,
      )
      .all({ $orgId: orgId, $since: since }) as unknown as Array<{
      routing_id: string
      rule_id: string
      org_a: string
      org_b: string
      agreement_id: string
      approval_id: string
      action: string
      routed_at: string
    }>
    return rows.map((row) => ({
      routingId: row.routing_id,
      ruleId: row.rule_id,
      orgA: row.org_a,
      orgB: row.org_b,
      agreementId: row.agreement_id,
      approvalId: row.approval_id,
      action: row.action,
      routedAt: row.routed_at,
    }))
  }
}

function mapRule(
  ruleId: string,
  row: {
    org_a: string
    org_b: string
    agreement_id: string
    action_patterns_json: string
    max_per_day: number
  },
): CrossOrgApprovalRule {
  return {
    ruleId,
    orgA: row.org_a,
    orgB: row.org_b,
    agreementId: row.agreement_id,
    actionPatterns: JSON.parse(row.action_patterns_json) as string[],
    maxPerDay: row.max_per_day,
  }
}
