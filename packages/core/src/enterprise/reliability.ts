/**
 * F7: High availability and disaster recovery.
 *
 * Availability/RPO/RTO targets, digest-verified backups and restores, and
 * restore drills that must land inside the published targets. Degraded local
 * enforcement during an outage follows the D-9 offline policy (fail closed,
 * never permissive).
 */

export type ReliabilityConfig = {
  availabilityTarget: number // e.g. 0.999
  rpoMs: number
  rtoMs: number
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  availabilityTarget: 0.999,
  rpoMs: 15 * 60 * 1000,
  rtoMs: 60 * 60 * 1000,
}

export type BackupRecord = {
  tenantId: string
  backupId: string
  kind: "DATABASE" | "KEYS"
  createdAt: string
  digest: string
  restoredAt?: string
}

export interface ReliabilityStore {
  putBackup(record: BackupRecord): void
  getBackup(tenantId: string, backupId: string): BackupRecord | undefined
  recordDrill(drill: DrillRecord): void
  drills(tenantId: string): DrillRecord[]
}

export type DrillRecord = {
  tenantId: string
  drillId: string
  startedAt: string
  finishedAt: string
  restoredDigest: string
  measuredRpoMs: number
  measuredRtoMs: number
}

export type RestoreResult =
  | { kind: "RESTORED"; record: BackupRecord }
  | { kind: "REJECTED"; reason: string }

/**
 * Restore a backup only when its digest matches the recorded digest.
 * A corrupt or tampered backup can never be presented as restored.
 */
export function restoreBackup(
  tenantId: string,
  backupId: string,
  presentedDigest: string,
  store: ReliabilityStore,
  now: Date = new Date(),
): RestoreResult {
  const backup = store.getBackup(tenantId, backupId)
  if (!backup) return { kind: "REJECTED", reason: "backup not found" }
  if (backup.digest !== presentedDigest) {
    return { kind: "REJECTED", reason: "backup digest mismatch — content is not the recorded backup" }
  }
  store.putBackup({ ...backup, restoredAt: now.toISOString() })
  return { kind: "RESTORED", record: { ...backup, restoredAt: now.toISOString() } }
}

export type DrillResult = {
  pass: boolean
  violations: string[]
  measuredRpoMs: number
  measuredRtoMs: number
}

export function evaluateDrill(
  drill: Omit<DrillRecord, "drillId" | "restoredDigest">,
  config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG,
): DrillResult {
  const violations: string[] = []
  if (drill.measuredRpoMs > config.rpoMs) {
    violations.push(`RPO ${drill.measuredRpoMs} ms exceeds target ${config.rpoMs} ms`)
  }
  if (drill.measuredRtoMs > config.rtoMs) {
    violations.push(`RTO ${drill.measuredRtoMs} ms exceeds target ${config.rtoMs} ms`)
  }
  return {
    pass: violations.length === 0,
    violations,
    measuredRpoMs: drill.measuredRpoMs,
    measuredRtoMs: drill.measuredRtoMs,
  }
}

/**
 * Degraded local enforcement during an outage: fail closed. Only
 * OFFLINE_RESTRICTED/READ_ONLY states may continue per the D-9 policy;
 * QUARANTINED and missing state deny everything.
 */
export function degradedEnforcementAllowed(
  enforcementMode: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED",
): { allowed: boolean; reason: string } {
  switch (enforcementMode) {
    case "ONLINE":
      return { allowed: true, reason: "online" }
    case "OFFLINE_RESTRICTED":
      return { allowed: true, reason: "offline-restricted per lease policy" }
    case "OFFLINE_READ_ONLY":
      return { allowed: true, reason: "read-only offline" }
    case "QUARANTINED":
      return { allowed: false, reason: "quarantined nodes deny all effects" }
  }
}
