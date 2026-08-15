/**
 * F7: High availability and disaster recovery.
 *
 * Availability/RPO/RTO targets, digest-verified backups and restores, and
 * restore drills that must land inside the published targets. Degraded local
 * enforcement during an outage follows the D-9 offline policy (fail closed,
 * never permissive). Key material rides the same digest-verified backup
 * surface (kind "KEYS"): the digest protects content, the fingerprint gates
 * which key a restore may activate.
 */

import { createHash } from "node:crypto"
import { canonicalize, decodeCanonicalBase64url } from "../crypto/canonical-serializer"
import { keyFingerprint } from "./key-rotation"

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
  /** Key fingerprint recorded at backup time (KEYS backups only). */
  fingerprint?: string
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

/**
 * Key material carried by a KEYS backup. `publicKey` identifies the key;
 * `secretKey` is the matching Ed25519 secret seed (base64url, 32 bytes).
 */
export type KeyBackupMaterial = {
  nodeId: string
  publicKey: string // base64url Ed25519 public key
  secretKey?: string // base64url Ed25519 secret seed
}

/** Canonical digest over the full key material: tampering changes it. */
export function keyMaterialDigest(material: KeyBackupMaterial): string {
  return createHash("sha256").update(canonicalize(material)).digest("hex")
}

export type KeyBackupResult =
  | { kind: "BACKED_UP"; record: BackupRecord }
  | { kind: "REJECTED"; reason: string }

/**
 * Record a digest-verified key backup. The digest is computed from the key
 * material itself (never client-asserted), and the key fingerprint is
 * recorded so a restore can gate which key becomes active.
 */
export function backupKeyMaterial(
  input: {
    tenantId: string
    backupId: string
    material: KeyBackupMaterial
    now?: Date
  },
  store: ReliabilityStore,
): KeyBackupResult {
  const publicKey = decodeCanonicalBase64url(input.material.publicKey)
  if (!publicKey || publicKey.length !== 32) {
    return { kind: "REJECTED", reason: "publicKey must be a base64url 32-byte Ed25519 key" }
  }
  if (input.material.secretKey !== undefined) {
    const secret = decodeCanonicalBase64url(input.material.secretKey)
    if (!secret || secret.length !== 32) {
      return { kind: "REJECTED", reason: "secretKey must be a base64url 32-byte Ed25519 seed" }
    }
  }
  const record: BackupRecord = {
    tenantId: input.tenantId,
    backupId: input.backupId,
    kind: "KEYS",
    createdAt: (input.now ?? new Date()).toISOString(),
    digest: keyMaterialDigest(input.material),
    fingerprint: keyFingerprint(publicKey),
  }
  store.putBackup(record)
  return { kind: "BACKED_UP", record }
}

export type KeyRestoreResult =
  | { kind: "RESTORED"; record: BackupRecord }
  | { kind: "REJECTED"; reason: string }

/**
 * Restore key material only when (1) the presented material's digest matches
 * the recorded digest (tamper → reject, fail closed) and (2) the restored
 * key's fingerprint matches the fingerprint recorded at backup time. When
 * `activeKeyFingerprint` is supplied (the current key in the active key
 * store), the restored fingerprint must also match it before the key is
 * accepted as active — a rotated or wrong-epoch key backup never activates.
 */
export function restoreKeyMaterial(
  input: {
    tenantId: string
    backupId: string
    presentedMaterial: KeyBackupMaterial
    activeKeyFingerprint?: string
    now?: Date
  },
  store: ReliabilityStore,
): KeyRestoreResult {
  const backup = store.getBackup(input.tenantId, input.backupId)
  if (!backup) return { kind: "REJECTED", reason: "key backup not found" }
  if (backup.kind !== "KEYS") {
    return { kind: "REJECTED", reason: "backup is not a key backup" }
  }
  const publicKey = decodeCanonicalBase64url(input.presentedMaterial.publicKey)
  if (!publicKey || publicKey.length !== 32) {
    return { kind: "REJECTED", reason: "publicKey must be a base64url 32-byte Ed25519 key" }
  }
  if (keyMaterialDigest(input.presentedMaterial) !== backup.digest) {
    return { kind: "REJECTED", reason: "key backup digest mismatch — content is tampered" }
  }
  const presentedFingerprint = keyFingerprint(publicKey)
  if (backup.fingerprint && presentedFingerprint !== backup.fingerprint) {
    return {
      kind: "REJECTED",
      reason: "restored key fingerprint does not match the recorded fingerprint",
    }
  }
  if (input.activeKeyFingerprint && presentedFingerprint !== input.activeKeyFingerprint) {
    return {
      kind: "REJECTED",
      reason: "restored key fingerprint does not match the active key; not activated",
    }
  }
  const now = (input.now ?? new Date()).toISOString()
  store.putBackup({ ...backup, restoredAt: now })
  return { kind: "RESTORED", record: { ...backup, restoredAt: now } }
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
