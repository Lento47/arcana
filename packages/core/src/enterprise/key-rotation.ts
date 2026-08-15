/**
 * F7: Key backup and rotation automation.
 *
 * Rotation advances a node's key epoch in the D-1 enrollment registry (the
 * existing key store, never a parallel one) and records tenant-scoped
 * rotation evidence: previous epoch, rotatedAt, and key fingerprints.
 * Dry-run previews report what would rotate without touching the registry.
 * Superseded keys keep failing the existing epoch gate
 * (`node-enrollment.verifyNodeKey`), so automation never weakens D-5
 * rotated-key handling.
 *
 * Tenant scoping: rotation evidence is tenant-scoped (`withTenantAccess`
 * guard on top of tenant-filtered SQL), and a rotation only touches nodes
 * whose `organizationId` equals the calling tenant — a tenant cannot rotate
 * another tenant's node key.
 */

import { createHash } from "node:crypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import {
  decodeCanonicalBase64url,
  encodeBase64url,
} from "../crypto/canonical-serializer"
import {
  rotateNodeKey,
  type EnrollmentContext,
  type EnrolledNodeRecord,
  type EnrollmentRegistry,
} from "../crypto/node-enrollment"
import { withTenantAccess } from "./tenant"

export type KeyRotationMode = "DRY_RUN" | "CONFIRMED"

export type KeyRotationRecord = {
  tenantId: string
  rotationId: string
  nodeId: string
  mode: KeyRotationMode
  previousEpoch: number
  nextEpoch: number
  previousFingerprint: string
  nextFingerprint: string
  rotatedAt: string
}

export interface KeyRotationStore {
  put(record: KeyRotationRecord): void
  get(tenantId: string, rotationId: string): KeyRotationRecord | undefined
  list(tenantId: string): KeyRotationRecord[]
}

/** SHA-256 fingerprint of an Ed25519 public key. */
export function keyFingerprint(publicKey: Uint8Array): string {
  return createHash("sha256").update(publicKey).digest("hex")
}

export function keyFingerprintFromB64(publicKeyB64: string): string | undefined {
  const decoded = decodeCanonicalBase64url(publicKeyB64)
  return decoded ? keyFingerprint(decoded) : undefined
}

export type KeyRotationRejection = { kind: "REJECTED"; reason: string }

export type KeyRotationPreviewResult =
  | {
      kind: "PREVIEW"
      record: KeyRotationRecord
      currentEpoch: number
      nextEpoch: number
      currentFingerprint: string
      nextFingerprint: string
    }
  | KeyRotationRejection

/**
 * Dry-run: report what a confirmed rotation would do and record a DRY_RUN
 * evidence row. The registry is never touched; the candidate fingerprint is
 * computed from a fresh throwaway key.
 */
export function previewNodeKeyRotation(input: {
  tenantId: string
  nodeId: string
  registry: EnrollmentRegistry
  store: KeyRotationStore
  seed?: Uint8Array
  rotationId?: string
  now?: Date
}): KeyRotationPreviewResult {
  const now = input.now ?? new Date()
  const existing = input.registry.get(input.nodeId)
  if (!existing) {
    return { kind: "REJECTED", reason: `node ${input.nodeId} is not enrolled` }
  }
  if (existing.organizationId !== input.tenantId) {
    return {
      kind: "REJECTED",
      reason: `node ${input.nodeId} does not belong to tenant ${input.tenantId}`,
    }
  }
  if (existing.status !== "TRUSTED") {
    return {
      kind: "REJECTED",
      reason: `node ${input.nodeId} status is ${existing.status}, not TRUSTED`,
    }
  }
  const candidate = ed25519.keygen(input.seed ?? ed25519.utils.randomSecretKey())
  const currentFingerprint = keyFingerprintFromB64(existing.publicKey)
  if (!currentFingerprint) {
    return { kind: "REJECTED", reason: `node ${input.nodeId} public key is not a valid Ed25519 key` }
  }
  const record: KeyRotationRecord = {
    tenantId: input.tenantId,
    rotationId: input.rotationId ?? `rotation-${now.getTime()}`,
    nodeId: input.nodeId,
    mode: "DRY_RUN",
    previousEpoch: existing.nodeKeyEpoch,
    nextEpoch: existing.nodeKeyEpoch + 1,
    previousFingerprint: currentFingerprint,
    nextFingerprint: keyFingerprint(candidate.publicKey),
    rotatedAt: now.toISOString(),
  }
  input.store.put(record)
  return {
    kind: "PREVIEW",
    record,
    currentEpoch: existing.nodeKeyEpoch,
    nextEpoch: existing.nodeKeyEpoch + 1,
    currentFingerprint,
    nextFingerprint: record.nextFingerprint,
  }
}

export type NodeKeyRotationResult =
  | {
      kind: "ROTATED"
      record: KeyRotationRecord
      nodeRecord: EnrolledNodeRecord
      newSecretKeyB64?: string
    }
  | KeyRotationRejection

/**
 * Confirmed rotation: advance the key epoch in the enrollment registry via
 * the existing `rotateNodeKey` primitive (re-issued certificate, superseded
 * previous key) and record CONFIRMED rotation evidence. GENERATE mode
 * creates the key pair and returns the new secret seed exactly once for
 * out-of-band delivery; RECEIVE mode accepts an operator/node-submitted
 * public key and never returns a secret.
 */
export function executeNodeKeyRotation(input: {
  tenantId: string
  nodeId: string
  registry: EnrollmentRegistry
  store: KeyRotationStore
  context: EnrollmentContext
  newPublicKey?: Uint8Array
  seed?: Uint8Array
  rotationId?: string
  now?: Date
}): NodeKeyRotationResult {
  const now = input.now ?? new Date()
  const existing = input.registry.get(input.nodeId)
  if (!existing) {
    return { kind: "REJECTED", reason: `node ${input.nodeId} is not enrolled` }
  }
  if (existing.organizationId !== input.tenantId) {
    return {
      kind: "REJECTED",
      reason: `node ${input.nodeId} does not belong to tenant ${input.tenantId}`,
    }
  }
  if (existing.status !== "TRUSTED") {
    return {
      kind: "REJECTED",
      reason: `node ${input.nodeId} status is ${existing.status}, not TRUSTED`,
    }
  }
  const previousFingerprint = keyFingerprintFromB64(existing.publicKey)
  if (!previousFingerprint) {
    return { kind: "REJECTED", reason: `node ${input.nodeId} public key is not a valid Ed25519 key` }
  }

  let newPublicKey: Uint8Array
  let newSecretKeyB64: string | undefined
  if (input.newPublicKey) {
    if (input.newPublicKey.length !== 32) {
      return { kind: "REJECTED", reason: "new public key must be 32 bytes" }
    }
    newPublicKey = input.newPublicKey
  } else {
    const seed = input.seed ?? ed25519.utils.randomSecretKey()
    newPublicKey = ed25519.keygen(seed).publicKey
    newSecretKeyB64 = encodeBase64url(seed)
  }

  const rotated = rotateNodeKey(
    input.nodeId,
    newPublicKey,
    input.registry,
    { ...input.context, now },
  )
  if (rotated.kind !== "ROTATED") {
    return { kind: "REJECTED", reason: rotated.reason }
  }

  const record: KeyRotationRecord = {
    tenantId: input.tenantId,
    rotationId: input.rotationId ?? `rotation-${now.getTime()}`,
    nodeId: input.nodeId,
    mode: "CONFIRMED",
    previousEpoch: existing.nodeKeyEpoch,
    nextEpoch: rotated.record.nodeKeyEpoch,
    previousFingerprint,
    nextFingerprint: keyFingerprint(newPublicKey),
    rotatedAt: now.toISOString(),
  }
  input.store.put(record)
  return {
    kind: "ROTATED",
    record,
    nodeRecord: rotated.record,
    newSecretKeyB64,
  }
}

/**
 * Tenant-scoped evidence reads. The store already filters by tenant; the
 * withTenantAccess guard makes cross-tenant reads impossible even if a
 * misbehaving store leaks.
 */
export function getRotationEvidence(
  tenantId: string,
  rotationId: string,
  store: KeyRotationStore,
): KeyRotationRecord | undefined {
  return withTenantAccess(tenantId, store.get(tenantId, rotationId))
}

export function listRotationEvidence(
  tenantId: string,
  store: KeyRotationStore,
): KeyRotationRecord[] {
  return store
    .list(tenantId)
    .map((record) => withTenantAccess(tenantId, record))
    .filter((record): record is KeyRotationRecord => record !== undefined)
}
