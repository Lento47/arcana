/**
 * D-5: Revocation Convergence Measurement
 *
 * RevocationLag = detectionDelay + distributionDelay + nodePollingDelay +
 * localEnforcementDelay (playbook §30 D5).
 *
 * This module provides:
 *   - estimateRevocationLag: closed-form p50/p95/worst from configuration
 *   - measureRevocationLag: observed lag distribution from an event log
 *   - checkRevocationTargets: frozen risk-class bounds
 *     (CRITICAL ≤ 5s, HIGH ≤ 30s when connected)
 */

export type RevocationRiskTargets = {
  criticalMs: number
  highMs: number
}

export const DEFAULT_REVOCATION_RISK_TARGETS: RevocationRiskTargets = {
  criticalMs: 5_000,
  highMs: 30_000,
}

export type RevocationConvergenceConfig = {
  /** Node polling interval (pull-based sync). */
  pollingIntervalMs: number
  /** Control-plane → node distribution delay. */
  distributionDelayMs: number
  /** Local enforcement application delay after receipt. */
  localEnforcementDelayMs: number
  /** Fixed detection delay (push fan-out, monitoring, etc.). */
  detectionDelayMs?: number
}

export type RevocationLagEstimate = {
  p50Ms: number
  p95Ms: number
  worstMs: number
}

/**
 * Closed-form estimate. Polling adds a uniform wait within one interval:
 * p50 ≈ interval/2, p95 ≈ 0.95 × interval, worst = interval.
 */
export function estimateRevocationLag(
  config: RevocationConvergenceConfig,
): RevocationLagEstimate {
  const detection = config.detectionDelayMs ?? 0
  const distribution = config.distributionDelayMs
  const enforcement = config.localEnforcementDelayMs
  const interval = config.pollingIntervalMs
  return {
    p50Ms: detection + distribution + interval / 2 + enforcement,
    p95Ms: detection + distribution + interval * 0.95 + enforcement,
    worstMs: detection + distribution + interval + enforcement,
  }
}

export type RevocationLagSample = {
  publishedAt: number
  enforcedAt: number
}

export type RevocationLagMeasurement = {
  count: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export function measureRevocationLag(samples: RevocationLagSample[]): RevocationLagMeasurement {
  if (samples.length === 0) {
    return { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 }
  }
  const lags = samples.map((s) => Math.max(0, s.enforcedAt - s.publishedAt)).sort((a, b) => a - b)
  const p50 = lags[Math.min(lags.length - 1, Math.floor(lags.length / 2))]
  const p95 = lags[Math.min(lags.length - 1, Math.max(0, Math.ceil(lags.length * 0.95) - 1))]
  return {
    count: lags.length,
    p50Ms: p50,
    p95Ms: p95,
    maxMs: lags[lags.length - 1],
  }
}

export type RevocationTargetCheck = {
  pass: boolean
  criticalP95Ms: number
  highP95Ms: number
  violations: string[]
}

/**
 * Frozen-bound check: the measured/estimated p95 must stay within the
 * connected risk targets (CRITICAL ≤ 5 s, HIGH ≤ 30 s).
 */
export function checkRevocationTargets(
  p95Ms: number,
  riskClass: "CRITICAL" | "HIGH",
  targets: RevocationRiskTargets = DEFAULT_REVOCATION_RISK_TARGETS,
): RevocationTargetCheck {
  const limit = riskClass === "CRITICAL" ? targets.criticalMs : targets.highMs
  const violations: string[] = []
  if (p95Ms > limit) {
    violations.push(`${riskClass} revocation p95 ${p95Ms} ms exceeds ${limit} ms`)
  }
  return {
    pass: violations.length === 0,
    criticalP95Ms: p95Ms,
    highP95Ms: p95Ms,
    violations,
  }
}
