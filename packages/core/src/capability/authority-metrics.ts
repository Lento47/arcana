// packages/core/src/capability/authority-metrics.ts
//
// Authority Kernel K5/K6 substrate — process-wide counters for every mediated
// decision and durable-effect terminal state. Purely additive, zero-I/O,
// allocation-free on the hot path (integer bumps only). Consumers: Run
// Scorecard (per-session roll-up), /health surfaces, future OTel export.

export type DecisionMetric =
  | "allowed"
  | "denied"
  | "approval_required"
  | "stale"
  | "execution_failed"

export type ClaimMetric =
  | "claims_settled"
  | "claims_failed"
  | "claims_cancelled"
  | "claims_ambiguous"

const counters: Record<string, number> = {}
const latencies: Record<string, number[]> = {}

function bump(key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by
}

/** Called by every gate right before mapping the EnforcementResult. */
export function recordDecision(status: string): void {
  switch (status) {
    case "EXECUTED":
      bump("authz_allowed")
      break
    case "DENIED":
      bump("authz_denied")
      break
    case "APPROVAL_REQUIRED":
      bump("authz_approval_required")
      break
    case "STALE_DECISION":
      bump("authz_stale")
      break
    default:
      bump("authz_execution_failed")
  }
}

/** Called by the EffectClaim machine on every terminal transition. */
export function recordClaimTerminal(state: ClaimTerminalState): void {
  switch (state) {
    case "SETTLED":
      bump("claims_settled")
      break
    case "FAILED":
      bump("claims_failed")
      break
    case "CANCELLED":
      bump("claims_cancelled")
      break
    case "AMBIGUOUS":
      bump("claims_ambiguous")
      break
  }
}
type ClaimTerminalState = "SETTLED" | "FAILED" | "CANCELLED" | "AMBIGUOUS"

/** Latency observation in milliseconds (kernel mediation wall-time). */
export function observeLatency(kind: "gate_total_ms", ms: number): void {
  const arr = (latencies[kind] ??= [])
  arr.push(ms)
  if (arr.length > 2048) arr.shift()
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1)
  return sortedAsc[Math.max(0, idx)]!
}

/** Snapshot + optional reset (scorecards read deltas; health reads totals). */
export function snapshotMetrics(reset = false): Record<string, number> {
  const snap: Record<string, number> = { ...counters }
  for (const [kind, arr] of Object.entries(latencies)) {
    const sorted = [...arr].sort((a, b) => a - b)
    snap[`${kind}.p50`] = percentile(sorted, 50)
    snap[`${kind}.p95`] = percentile(sorted, 95)
    snap[`${kind}.p99`] = percentile(sorted, 99)
    snap[`${kind}.count`] = sorted.length
  }
  if (reset) {
    for (const k of Object.keys(counters)) delete counters[k]
    for (const k of Object.keys(latencies)) delete latencies[k]
  }
  return snap
}
