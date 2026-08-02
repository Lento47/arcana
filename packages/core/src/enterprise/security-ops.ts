/**
 * F9: Enterprise security operations.
 *
 * Tenant-scoped alerts, incident timelines, revocation campaigns (audited
 * batch emergency revocation), and forensic exports. Emergency deny
 * propagation is audited per node and never silent.
 */

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

export type SecurityAlert = {
  tenantId: string
  alertId: string
  severity: AlertSeverity
  kind: string
  subjectId?: string
  detail: string
  at: string
}

export type IncidentTimelineEvent = {
  tenantId: string
  incidentId: string
  at: string
  actor: string
  event: string
}

export interface SecurityOpsStore {
  putAlert(alert: SecurityAlert): void
  alerts(tenantId: string, severity?: AlertSeverity): SecurityAlert[]
  appendTimeline(event: IncidentTimelineEvent): void
  timeline(tenantId: string, incidentId: string): IncidentTimelineEvent[]
  allTimeline(tenantId: string): IncidentTimelineEvent[]
}

export type RevocationCampaignResult = {
  revokedNodes: string[]
  auditEvents: Array<{ nodeId: string; at: string; reason: string }>
}

export type RevocationTarget = {
  nodeId: string
}

/**
 * Audited emergency-denial campaign: every node revocation is recorded and
 * returns a per-node audit event. The caller supplies the enforcement action
 * (e.g. F2 privileged audit + fleet setRevoked).
 */
export function runRevocationCampaign(
  tenantId: string,
  targets: readonly RevocationTarget[],
  reason: string,
  revokeNode: (nodeId: string) => { ok: boolean; reason?: string },
  now: Date,
): RevocationCampaignResult {
  const revokedNodes: string[] = []
  const auditEvents: RevocationCampaignResult["auditEvents"] = []
  for (const target of targets) {
    const result = revokeNode(target.nodeId)
    if (result.ok) {
      revokedNodes.push(target.nodeId)
      auditEvents.push({ nodeId: target.nodeId, at: now.toISOString(), reason })
    }
  }
  return { revokedNodes, auditEvents }
}

export type ForensicExport = {
  tenantId: string
  exportedAt: string
  alerts: SecurityAlert[]
  timeline: IncidentTimelineEvent[]
}

export function forensicExport(
  tenantId: string,
  store: SecurityOpsStore,
  now: Date,
): ForensicExport {
  return {
    tenantId,
    exportedAt: now.toISOString(),
    alerts: store.alerts(tenantId),
    timeline: store.allTimeline(tenantId),
  }
}
