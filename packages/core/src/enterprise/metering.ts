/**
 * F12: Usage metering.
 *
 * Metering is observability-only. Aggregation and quota status are
 * informational; a metering outage or overage can NEVER change a security
 * decision (see `meteringNeverAffectsDecision` in commercial-readiness.ts).
 */

export type UsageEvent = {
  tenantId: string
  eventId: string
  feature: string
  units: number
  at: string
}

export interface MeteringStore {
  putUsage(event: UsageEvent): void
  usage(tenantId: string, feature: string, since: string): number
  allUsage(tenantId: string): UsageEvent[]
}

export type QuotaStatus = {
  ok: boolean
  used: number
  limit: number
  overQuota: boolean
}

export function quotaStatus(limit: number, used: number): QuotaStatus {
  const overQuota = used > limit
  return { ok: !overQuota, used, limit, overQuota }
}
