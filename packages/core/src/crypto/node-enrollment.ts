/**
 * D-1: Node Identity, Enrollment, and Key Rotation
 *
 * Implements the enrollment ceremony, durable rotatable node identity, and
 * decommissioning on the control-plane side:
 *
 *   1. Issuer mints a short-lived join token bound to nodeId/org/trustDomain.
 *   2. Node presents the token + its Ed25519 public key; the control plane
 *      verifies the token and issues a NodeIdentityCertificate.
 *   3. Key rotation advances nodeKeyEpoch and supersedes the old key; rotated
 *      keys are rejected by epoch checks.
 *   4. Decommissioning/suspension revokes the node; re-enrollment of a
 *      decommissioned node is rejected.
 *
 * The registry is pluggable (SQLite implementation in
 * `node-enrollment-sqlite.ts`). The resulting key snapshot feeds the D-8B
 * proof-registration node registry.
 */

import { randomUUID } from "node:crypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import {
  buildSignatureInput,
  decodeCanonicalBase64url,
  encodeBase64url,
  type SignatureDomain,
} from "./canonical-serializer"
import { verifyEnvelopeSignature } from "./verifier"
import { NODE_IDENTITY_DOMAIN, type NodeIdentityCertificate } from "./signed-envelopes"

export const JOIN_TOKEN_DOMAIN: SignatureDomain = "arcana:join-token:v1"

// ─── Signing helper (shared by issuer-side operations) ─────────────

export function signEnvelope(
  domain: SignatureDomain,
  payload: Record<string, unknown>,
  secretKey: Uint8Array,
): Record<string, unknown> {
  const { signature: _, signatureAlgorithm: __, ...unsigned } = payload
  const signatureInput = buildSignatureInput(domain, unsigned)
  const signature = ed25519.sign(signatureInput, secretKey)
  return { ...payload, signatureAlgorithm: "Ed25519", signature: encodeBase64url(signature) }
}

// ─── Join Token ─────────────────────────────────────────────────────

export type JoinToken = {
  schemaVersion: 1
  tokenId: string
  organizationId: string
  trustDomain: string
  nodeId: string
  issuedAt: string
  expiresAt: string
  signatureAlgorithm: "Ed25519"
  signature: string
}

export function createJoinToken(
  input: {
    organizationId: string
    trustDomain: string
    nodeId: string
    issuedAt: Date
    expiresAt: Date
    tokenId?: string
  },
  issuerSecretKey: Uint8Array,
): JoinToken {
  const token = {
    schemaVersion: 1,
    tokenId: input.tokenId ?? randomUUID(),
    organizationId: input.organizationId,
    trustDomain: input.trustDomain,
    nodeId: input.nodeId,
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  }
  return signEnvelope(JOIN_TOKEN_DOMAIN, token, issuerSecretKey) as unknown as JoinToken
}

export type JoinTokenVerification =
  | { valid: true }
  | { valid: false; reason: string }

export function verifyJoinToken(
  token: JoinToken,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  expected: {
    organizationId: string
    trustDomain: string
    nodeId: string
    now: Date
  },
): JoinTokenVerification {
  if (token.schemaVersion !== 1) {
    return { valid: false, reason: `unsupported schema version ${token.schemaVersion}` }
  }
  if (token.organizationId !== expected.organizationId) {
    return { valid: false, reason: `organizationId mismatch: ${token.organizationId}` }
  }
  if (token.trustDomain !== expected.trustDomain) {
    return { valid: false, reason: `trustDomain mismatch: ${token.trustDomain}` }
  }
  if (token.nodeId !== expected.nodeId) {
    return { valid: false, reason: `nodeId mismatch: ${token.nodeId}` }
  }
  const nowMs = expected.now.getTime()
  if (nowMs > new Date(token.expiresAt).getTime()) {
    return { valid: false, reason: `join token expired at ${token.expiresAt}` }
  }
  if (new Date(token.issuedAt).getTime() > nowMs + 5 * 60 * 1000) {
    return { valid: false, reason: "join token issuedAt is in the future" }
  }
  // Join tokens do not carry issuerId (binding is org/trustDomain/nodeId), so
  // the signature is verified against every trusted issuer key.
  const signatureOk = [...trustedIssuerPublicKeys.values()].some((key) => {
    const r = verifyEnvelopeSignature(
      token as unknown as Record<string, unknown>,
      JOIN_TOKEN_DOMAIN,
      key,
    )
    return r.valid
  })
  if (!signatureOk) {
    return { valid: false, reason: "join token signature verification failed" }
  }
  return { valid: true }
}

// ─── Enrollment Registry ────────────────────────────────────────────

export type NodeEnrollmentStatus = "UNREGISTERED" | "PENDING" | "TRUSTED" | "SUSPENDED" | "REVOKED"

export type EnrolledNodeRecord = {
  nodeId: string
  organizationId: string
  trustDomain: string
  status: NodeEnrollmentStatus
  /** base64url Ed25519 public key (current epoch). */
  publicKey: string
  nodeKeyEpoch: number
  certificate: NodeIdentityCertificate
  enrolledAt: string
  lastKeyRotatedAt?: string
  decommissionedAt?: string
}

export interface EnrollmentRegistry {
  get(nodeId: string): EnrolledNodeRecord | undefined
  put(record: EnrolledNodeRecord): void
  remove(nodeId: string): void
  list(): EnrolledNodeRecord[]
}

// ─── Enrollment ─────────────────────────────────────────────────────

export type EnrollmentContext = {
  issuerId: string
  issuerSecretKey: Uint8Array
  issuerPublicKeys: Map<string, Uint8Array>
  certificateDurationMs: number
  nodeCapabilities?: readonly string[]
  now?: Date
}

export type EnrollmentResult =
  | { kind: "ENROLLED"; record: EnrolledNodeRecord }
  | { kind: "DUPLICATE_ENROLLMENT"; detail: string }
  | { kind: "REJECTED"; reason: string }

export function enrollNode(
  token: JoinToken,
  nodePublicKey: Uint8Array,
  registry: EnrollmentRegistry,
  context: EnrollmentContext,
): EnrollmentResult {
  const now = context.now ?? new Date()
  const expected = {
    organizationId: token.organizationId,
    trustDomain: token.trustDomain,
    nodeId: token.nodeId,
    now,
  }
  const tokenCheck = verifyJoinToken(token, context.issuerPublicKeys, expected)
  if (!tokenCheck.valid) {
    return { kind: "REJECTED", reason: `join token invalid: ${tokenCheck.reason}` }
  }

  const existing = registry.get(token.nodeId)
  if (existing) {
    if (existing.status === "REVOKED") {
      return { kind: "REJECTED", reason: "node is decommissioned; re-enrollment denied" }
    }
    return { kind: "DUPLICATE_ENROLLMENT", detail: `node ${token.nodeId} already enrolled (${existing.status})` }
  }

  const certificate = issueCertificate({
    nodeId: token.nodeId,
    organizationId: token.organizationId,
    publicKey: nodePublicKey,
    issuerId: context.issuerId,
    issuerSecretKey: context.issuerSecretKey,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + context.certificateDurationMs),
    capabilities: context.nodeCapabilities ?? ["node.sync", "node.proof.upload"],
  })

  const record: EnrolledNodeRecord = {
    nodeId: token.nodeId,
    organizationId: token.organizationId,
    trustDomain: token.trustDomain,
    status: "TRUSTED",
    publicKey: encodeBase64url(nodePublicKey),
    nodeKeyEpoch: 1,
    certificate,
    enrolledAt: now.toISOString(),
  }
  registry.put(record)
  return { kind: "ENROLLED", record }
}

function issueCertificate(input: {
  nodeId: string
  organizationId: string
  publicKey: Uint8Array
  issuerId: string
  issuerSecretKey: Uint8Array
  issuedAt: Date
  expiresAt: Date
  capabilities: readonly string[]
}): NodeIdentityCertificate {
  const payload = {
    schemaVersion: 1,
    nodeId: input.nodeId,
    organizationId: input.organizationId,
    publicKey: encodeBase64url(input.publicKey),
    issuerId: input.issuerId,
    issuerEpoch: 1,
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    capabilities: [...input.capabilities],
  }
  return signEnvelope(NODE_IDENTITY_DOMAIN, payload, input.issuerSecretKey) as unknown as NodeIdentityCertificate
}

// ─── Key Rotation ───────────────────────────────────────────────────

export type KeyRotationResult =
  | { kind: "ROTATED"; record: EnrolledNodeRecord }
  | { kind: "REJECTED"; reason: string }

export function rotateNodeKey(
  nodeId: string,
  newPublicKey: Uint8Array,
  registry: EnrollmentRegistry,
  context: EnrollmentContext,
): KeyRotationResult {
  const now = context.now ?? new Date()
  const existing = registry.get(nodeId)
  if (!existing) {
    return { kind: "REJECTED", reason: `node ${nodeId} is not enrolled` }
  }
  if (existing.status !== "TRUSTED") {
    return { kind: "REJECTED", reason: `node ${nodeId} status is ${existing.status}, not TRUSTED` }
  }
  const newKeyEncoded = encodeBase64url(newPublicKey)
  if (newKeyEncoded === existing.publicKey) {
    return { kind: "REJECTED", reason: "new public key equals current key; no rotation" }
  }

  const nextEpoch = existing.nodeKeyEpoch + 1
  const certificate = issueCertificate({
    nodeId,
    organizationId: existing.organizationId,
    publicKey: newPublicKey,
    issuerId: context.issuerId,
    issuerSecretKey: context.issuerSecretKey,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + context.certificateDurationMs),
    capabilities: existing.certificate.capabilities,
  })

  const updated: EnrolledNodeRecord = {
    ...existing,
    publicKey: newKeyEncoded,
    nodeKeyEpoch: nextEpoch,
    certificate,
    lastKeyRotatedAt: now.toISOString(),
  }
  registry.put(updated)
  return { kind: "ROTATED", record: updated }
}

// ─── Status transitions ─────────────────────────────────────────────

export function setNodeStatus(
  nodeId: string,
  status: NodeEnrollmentStatus,
  registry: EnrollmentRegistry,
  now: Date = new Date(),
): { ok: true; record: EnrolledNodeRecord } | { ok: false; reason: string } {
  const existing = registry.get(nodeId)
  if (!existing) {
    return { ok: false, reason: `node ${nodeId} is not enrolled` }
  }
  const updated: EnrolledNodeRecord = {
    ...existing,
    status,
    decommissionedAt: status === "REVOKED" ? now.toISOString() : existing.decommissionedAt,
  }
  registry.put(updated)
  return { ok: true, record: updated }
}

export function decommissionNode(
  nodeId: string,
  registry: EnrollmentRegistry,
  now: Date = new Date(),
): { ok: true; record: EnrolledNodeRecord } | { ok: false; reason: string } {
  return setNodeStatus(nodeId, "REVOKED", registry, now)
}

// ─── Key verification ───────────────────────────────────────────────

export type NodeKeyVerification =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Verify that a presented node key is the CURRENT key of a TRUSTED node in
 * the given trust domain. Rotated (superseded) keys fail: epoch and key must
 * both equal the registry's current values.
 */
export function verifyNodeKey(
  nodeId: string,
  publicKey: Uint8Array,
  nodeKeyEpoch: number,
  trustDomain: string,
  registry: EnrollmentRegistry,
): NodeKeyVerification {
  const record = registry.get(nodeId)
  if (!record) {
    return { valid: false, reason: `node ${nodeId} is not enrolled` }
  }
  if (record.trustDomain !== trustDomain) {
    return { valid: false, reason: `trustDomain mismatch: ${record.trustDomain}` }
  }
  if (record.status !== "TRUSTED") {
    return { valid: false, reason: `node status is ${record.status}` }
  }
  if (record.nodeKeyEpoch !== nodeKeyEpoch) {
    return {
      valid: false,
      reason: `nodeKeyEpoch ${nodeKeyEpoch} != current ${record.nodeKeyEpoch} (rotated keys rejected)`,
    }
  }
  const encoded = encodeBase64url(publicKey)
  if (encoded !== record.publicKey) {
    return { valid: false, reason: "public key does not match the current enrolled key" }
  }
  return { valid: true }
}

/**
 * Snapshot of current node keys for a trust domain — the registry consumed by
 * the D-8B proof-registration service.
 */
export function registryKeysForTrustDomain(
  registry: EnrollmentRegistry,
  trustDomain: string,
): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>()
  for (const record of registry.list()) {
    if (record.status === "TRUSTED" && record.trustDomain === trustDomain) {
      const key = decodeCanonicalBase64url(record.publicKey)
      if (key && key.length === 32) map.set(record.nodeId, key)
    }
  }
  return map
}
