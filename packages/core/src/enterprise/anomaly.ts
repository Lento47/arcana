/**
 * F9: Anomaly detection heuristics.
 *
 * Deterministic tenant-scoped signals over alert/revocation/backlog/stale
 * counters. Signals are recorded through the security-ops alert pipeline so
 * they appear in incident timelines and forensic exports. Heuristics are
 * advisory; they never change an authorization outcome.
 */

import type { SecurityOpsStore, SecurityAlert } from "./security-ops"

export type AnomalyKind =
  | "alert_burst"
  | "revocation_velocity"
  | "proof_backlog_growth"
  | "stale_node_count"

export type AnomalySignal = {
  signalId: string
  tenantId: string
  kind: AnomalyKind
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  detail: string
  at: string
}

export type AnomalyInput = {
  tenantId: string
  alertsLastHour: number
  revocationsLastHour: number
  maxProofBacklog: number
  staleNodeCount: number
  totalNodeCount: number
  now?: Date
}

export function detectAnomalies(input: AnomalyInput): AnomalySignal[] {
  const now = (input.now ?? new Date()).toISOString()
  const signals: AnomalySignal[] = []
  const push = (
    signalId: string,
    kind: AnomalyKind,
    severity: AnomalySignal["severity"],
    detail: string,
  ) => signals.push({ signalId, tenantId: input.tenantId, kind, severity, detail, at: now })

  if (input.alertsLastHour >= 20) {
    push("anomaly-alert-burst-critical", "alert_burst", "CRITICAL", `alertsLastHour=${input.alertsLastHour} >= 20`)
  } else if (input.alertsLastHour >= 10) {
    push("anomaly-alert-burst-high", "alert_burst", "HIGH", `alertsLastHour=${input.alertsLastHour} >= 10`)
  }
  if (input.revocationsLastHour >= 5) {
    push("anomaly-revocation-velocity", "revocation_velocity", "HIGH", `revocationsLastHour=${input.revocationsLastHour} >= 5`)
  }
  if (input.maxProofBacklog >= 100) {
    push("anomaly-proof-backlog", "proof_backlog_growth", "MEDIUM", `maxProofBacklog=${input.maxProofBacklog} >= 100`)
  }
  if (input.totalNodeCount > 0 && input.staleNodeCount / input.totalNodeCount >= 0.25) {
    push(
      "anomaly-stale-nodes",
      "stale_node_count",
      "MEDIUM",
      `staleNodeCount=${input.staleNodeCount}/${input.totalNodeCount} >= 25%`,
    )
  }
  return signals
}

/**
 * Record anomaly signals through the security-ops alert pipeline and return
 * the alerts that were persisted.
 */
export function recordAnomalySignals(
  input: AnomalyInput,
  store: SecurityOpsStore,
): SecurityAlert[] {
  const alerts = detectAnomalies(input).map((signal) => ({
    tenantId: signal.tenantId,
    alertId: signal.signalId,
    severity: signal.severity,
    kind: `anomaly.${signal.kind}`,
    detail: signal.detail,
    at: signal.at,
  }))
  for (const alert of alerts) store.putAlert(alert)
  return alerts
}
