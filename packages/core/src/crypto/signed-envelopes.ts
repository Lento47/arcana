/**
 * Phase D-1: Signed Envelope Types
 *
 * Four domain-separated envelopes:
 * - SignedCapabilityEnvelope
 * - SignedPolicyEnvelope
 * - NodeIdentityCertificate
 * - RevocationStatement
 *
 * Each envelope has:
 * - schemaVersion: 1
 * - issuerId + issuerEpoch
 * - domain-specific payload
 * - signatureAlgorithm: "Ed25519"
 * - signature: base64-encoded 64-byte signature
 */

import type { SignatureDomain } from "./canonical-serializer"

// ─── Signed Capability Envelope ──────────────────────────────────────

export type SignedCapabilityEnvelope = {
  schemaVersion: 1
  issuerId: string
  issuerEpoch: number
  audienceNodeId: string
  grant: CapabilityGrantPayload
  issuedAt: string      // UTC RFC 3339 with milliseconds
  expiresAt: string     // UTC RFC 3339 with milliseconds
  nonce: string         // UUID v4
  signatureAlgorithm: "Ed25519"
  signature: string     // base64
}

export type CapabilityGrantPayload = {
  grantId: string
  principal: { kind: string; id: string }
  actions: readonly string[]
  resources: readonly string[]
  workspaceId: string
  contractId: string
  contractRevision: number
  maxUses: number | "unlimited"
  delegationDepth: number
  delegationAncestry?: DelegationAncestry
}

export type DelegationAncestry = {
  parentGrantId: string
  parentSignature: string
  depth: number
}

export const CAPABILITY_DOMAIN: SignatureDomain = "arcana:signed-capability:v1"

export const CAPABILITY_REQUIRED_FIELDS = [
  "schemaVersion", "issuerId", "issuerEpoch", "audienceNodeId",
  "grant", "issuedAt", "expiresAt", "nonce",
  "signatureAlgorithm", "signature",
]

// ─── Signed Policy Envelope ──────────────────────────────────────────

export type SignedPolicyEnvelope = {
  schemaVersion: 1
  issuerId: string
  issuerEpoch: number
  sequence: number
  policyId: string
  policyVersion: string
  policyDigest: string          // SHA-256 hex
  previousPolicyDigest?: string // SHA-256 hex, links to predecessor
  issuedAt: string
  expiresAt: string
  signatureAlgorithm: "Ed25519"
  signature: string
}

export const POLICY_DOMAIN: SignatureDomain = "arcana:signed-policy:v1"

export const POLICY_REQUIRED_FIELDS = [
  "schemaVersion", "issuerId", "issuerEpoch", "sequence",
  "policyId", "policyVersion", "policyDigest",
  "issuedAt", "expiresAt", "signatureAlgorithm", "signature",
]

// ─── Node Identity Certificate ───────────────────────────────────────

export type NodeIdentityCertificate = {
  schemaVersion: 1
  nodeId: string
  organizationId: string
  publicKey: string             // base64 Ed25519 public key (32 bytes)
  issuerId: string
  issuerEpoch: number
  issuedAt: string
  expiresAt: string
  capabilities: readonly string[]
  signatureAlgorithm: "Ed25519"
  signature: string
}

export const NODE_IDENTITY_DOMAIN: SignatureDomain = "arcana:node-identity:v1"

export const NODE_IDENTITY_REQUIRED_FIELDS = [
  "schemaVersion", "nodeId", "organizationId", "publicKey",
  "issuerId", "issuerEpoch", "issuedAt", "expiresAt",
  "capabilities", "signatureAlgorithm", "signature",
]

// ─── Revocation Statement ────────────────────────────────────────────

export type RevocationStatement = {
  schemaVersion: 1
  issuerId: string
  issuerEpoch: number
  sequence: number
  subjectType: "GRANT" | "NODE" | "ISSUER_KEY" | "POLICY"
  subjectId: string
  reason: string
  effectiveAt: string
  issuedAt: string
  signatureAlgorithm: "Ed25519"
  signature: string
}

export const REVOCATION_DOMAIN: SignatureDomain = "arcana:revocation:v1"

export const REVOCATION_REQUIRED_FIELDS = [
  "schemaVersion", "issuerId", "issuerEpoch", "sequence",
  "subjectType", "subjectId", "reason", "effectiveAt",
  "issuedAt", "signatureAlgorithm", "signature",
]

// ─── Rejection Reasons ───────────────────────────────────────────────

export type RejectionReason =
  | "INVALID_SIGNATURE"
  | "UNKNOWN_ISSUER"
  | "ISSUER_EPOCH_TOO_OLD"
  | "WRONG_AUDIENCE"
  | "EXPIRED"
  | "SEQUENCE_ROLLBACK"
  | "DIGEST_MISMATCH"
  | "SCHEMA_UNSUPPORTED"
  | "ANCESTRY_INVALID"
  | "REVOKED"

// ─── Envelope Signer Interface ───────────────────────────────────────

/**
 * Separates key custody from serialization.
 * Later backed by: OS key store, TPM, HSM, Cloud KMS, secure enclave.
 */
export interface EnvelopeSigner {
  sign(domain: SignatureDomain, canonicalPayload: Uint8Array): Promise<Uint8Array>
}
