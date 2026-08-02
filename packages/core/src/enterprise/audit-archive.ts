/**
 * F6: Audit, compliance, and evidence archive.
 *
 * Tenant-scoped immutable proof retention with:
 * - canonical fingerprints (exports verify independently via the SDK
 *   verifier)
 * - chain-of-custody metadata
 * - retention policies with legal hold
 * - retention deletion that never falsifies surviving proofs
 * - auditor access is read-only + tenant-scoped (caller enforces via RBAC)
 */

import { createHash } from "node:crypto"
import { canonicalize } from "../crypto/canonical-serializer"

export type CustodyEvent = {
  who: string
  action: string
  at: string
}

export type ArchiveRecord = {
  tenantId: string
  archiveId: string
  proofId: string
  proofJson: string
  fingerprint: string
  source: string
  ingestedAt: string
  retentionUntil: string
  legalHold: boolean
  custody: CustodyEvent[]
}

export interface AuditArchiveStore {
  put(record: ArchiveRecord): void
  get(tenantId: string, archiveId: string): ArchiveRecord | undefined
  search(tenantId: string, query: { proofId?: string; source?: string }): ArchiveRecord[]
  update(record: ArchiveRecord): void
  delete(tenantId: string, archiveId: string): void
}

export type ProofLike = {
  id: string
  schema_version: string
  timestamp: string
  lifecycle: { status: string; started_at: string; ended_at?: string }
  events: Array<{ id: string; timestamp: string; type: string }>
}

export function proofFingerprint(proof: ProofLike): string {
  const canonical = canonicalize({
    id: proof.id,
    schema_version: proof.schema_version,
    timestamp: proof.timestamp,
    lifecycle: proof.lifecycle,
    events: proof.events,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export type ArchiveResult =
  | { kind: "ARCHIVED"; record: ArchiveRecord }
  | { kind: "REJECTED"; reason: string }

export function archiveProof(
  input: {
    tenantId: string
    proofId: string
    proofJson: string
    source: string
    retentionUntil: string
    archiveId?: string
    ingestedAt?: string
  },
  store: AuditArchiveStore,
): ArchiveResult {
  let proof: ProofLike
  try {
    proof = JSON.parse(input.proofJson) as ProofLike
  } catch {
    return { kind: "REJECTED", reason: "proof is not valid JSON" }
  }
  if (!proof.id || proof.schema_version !== "0.2" || !Array.isArray(proof.events)) {
    return { kind: "REJECTED", reason: "proof does not satisfy the archive schema" }
  }
  const fingerprint = proofFingerprint(proof)
  const record: ArchiveRecord = {
    tenantId: input.tenantId,
    archiveId: input.archiveId ?? `arch-${input.proofId}`,
    proofId: input.proofId,
    proofJson: input.proofJson,
    fingerprint,
    source: input.source,
    ingestedAt: input.ingestedAt ?? new Date().toISOString(),
    retentionUntil: input.retentionUntil,
    legalHold: false,
    custody: [],
  }
  store.put(record)
  return { kind: "ARCHIVED", record }
}

export type ExportResult =
  | {
      kind: "EXPORTED"
      proofJson: string
      fingerprint: string
      custody: CustodyEvent[]
    }
  | { kind: "REJECTED"; reason: string }

export function exportProof(
  tenantId: string,
  archiveId: string,
  store: AuditArchiveStore,
): ExportResult {
  const record = store.get(tenantId, archiveId)
  if (!record) return { kind: "REJECTED", reason: "archive record not found" }
  return {
    kind: "EXPORTED",
    proofJson: record.proofJson,
    fingerprint: record.fingerprint,
    custody: [...record.custody],
  }
}

export function appendCustody(
  tenantId: string,
  archiveId: string,
  event: CustodyEvent,
  store: AuditArchiveStore,
): { ok: boolean; reason?: string } {
  const record = store.get(tenantId, archiveId)
  if (!record) return { ok: false, reason: "archive record not found" }
  store.update({ ...record, custody: [...record.custody, event] })
  return { ok: true }
}

export function placeLegalHold(
  tenantId: string,
  archiveId: string,
  store: AuditArchiveStore,
): { ok: boolean; reason?: string } {
  const record = store.get(tenantId, archiveId)
  if (!record) return { ok: false, reason: "archive record not found" }
  store.update({ ...record, legalHold: true })
  return { ok: true }
}

export function removeLegalHold(
  tenantId: string,
  archiveId: string,
  store: AuditArchiveStore,
): { ok: boolean; reason?: string } {
  const record = store.get(tenantId, archiveId)
  if (!record) return { ok: false, reason: "archive record not found" }
  store.update({ ...record, legalHold: false })
  return { ok: true }
}

/**
 * Retention sweep: delete records past retention unless on legal hold.
 * Surviving records keep their fingerprints (deletion cannot falsify them).
 */
export function applyRetention(
  tenantId: string,
  store: AuditArchiveStore,
  now: Date,
): { deleted: number; retainedByHold: number } {
  let deleted = 0
  let retainedByHold = 0
  for (const record of store.search(tenantId, {})) {
    if (new Date(record.retentionUntil).getTime() > now.getTime()) continue
    if (record.legalHold) {
      retainedByHold++
      continue
    }
    store.delete(tenantId, record.archiveId)
    deleted++
  }
  return { deleted, retainedByHold }
}
