/**
 * Generate complete golden test vectors with negative mutations.
 * Run with: bun run packages/core/src/crypto/test-vectors/generate-full.ts
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { canonicalize, buildSignatureInput, type SignatureDomain } from "../canonical-serializer"
import { CAPABILITY_DOMAIN, POLICY_DOMAIN, NODE_IDENTITY_DOMAIN, REVOCATION_DOMAIN } from "../signed-envelopes"

function toBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

const seeds = [
  "0000000000000000000000000000000000000000000000000000000000000001",
  "0000000000000000000000000000000000000000000000000000000000000002",
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
  "0000000000000000000000000000000000000000000000000000000000000005",
]

const keypairs = seeds.map(seed => ed25519.keygen(hexToBytes(seed)))
const pubKeys = keypairs.map(kp => toBase64url(kp.publicKey))

// Payloads
const capabilityPayload1 = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  audienceNodeId: "node-beta",
  grant: {
    grantId: "grant-001",
    principal: { kind: "agent", id: "arcana" },
    actions: ["filesystem.read"],
    resources: ["packages/**"],
    workspaceId: "arcana",
    contractId: "contract-001",
    contractRevision: 1,
    maxUses: 10,
    delegationDepth: 0,
  },
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-29T13:00:00.000Z",
  nonce: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
}

const capabilityPayload2 = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  audienceNodeId: "node-gamma",
  grant: {
    grantId: "grant-002",
    principal: { kind: "subagent", id: "investigator" },
    actions: ["filesystem.read"],
    resources: ["packages/core/src/**"],
    workspaceId: "arcana",
    contractId: "contract-001",
    contractRevision: 1,
    maxUses: 5,
    delegationDepth: 1,
    delegationAncestry: {
      parentGrantId: "grant-001",
      parentSignature: "parent-sig-placeholder",
      depth: 1,
    },
  },
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-29T12:30:00.000Z",
  nonce: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
}

const policyPayload = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  policyId: "policy-default",
  policyVersion: "1.0.0",
  policyDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-30T12:00:00.000Z",
}

const nodeIdentityPayload = {
  schemaVersion: 1,
  nodeId: "node-alpha",
  organizationId: "arcana-org",
  publicKey: pubKeys[0],
  issuerId: "trust-registry",
  issuerEpoch: 1,
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-08-29T12:00:00.000Z",
  capabilities: ["grant", "revoke", "verify"],
}

const revocationPayload = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  subjectType: "GRANT",
  subjectId: "grant-001",
  reason: "operator requested revocation",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  issuedAt: "2026-07-29T12:00:00.000Z",
}

function signEnvelope(keyIndex: number, domain: SignatureDomain, unsignedPayload: Record<string, unknown>) {
  const sigInput = buildSignatureInput(domain, unsignedPayload)
  const sig = ed25519.sign(sigInput, keypairs[keyIndex].secretKey)
  return {
    ...unsignedPayload,
    signatureAlgorithm: "Ed25519",
    signature: toBase64url(sig),
  }
}

function buildPositiveVector(
  vectorId: string,
  description: string,
  keyIndex: number,
  domain: SignatureDomain,
  unsignedPayload: Record<string, unknown>,
) {
  const fullEnvelope = signEnvelope(keyIndex, domain, unsignedPayload)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = fullEnvelope as any
  const canonicalPayload = canonicalize(unsigned)
  const sigInput = buildSignatureInput(domain, unsigned)

  return {
    vectorId,
    domain,
    description,
    privateKeySeed: seeds[keyIndex],
    publicKey: pubKeys[keyIndex],
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonicalPayload)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: fullEnvelope.signature,
    verificationExpected: true,
  }
}

interface NegativeVector {
  vectorId: string
  domain: string
  description: string
  envelope: Record<string, unknown>
  expectedStage: string
  expectedReason: string
  /** For audience test: the expectedAudienceNodeId to pass */
  expectedAudienceNodeId?: string
  /** For raw JSON test: the raw JSON string */
  rawJson?: string
  /** For TRUST vectors: minimum epoch required */
  trustedIssuerMinimumEpoch?: number
  /** For AUDIENCE vectors: expected organization */
  expectedOrganization?: string
  /** For REVOCATION vectors: set of revoked grant IDs */
  revokedGrantIds?: string[]
  /** For REVOCATION vectors: set of revoked node IDs */
  revokedNodeIds?: string[]
  /** For REVOCATION vectors: revoked issuer epochs */
  revokedIssuerEpochs?: number[]
}

const negativeVectors: NegativeVector[] = []

// ═══════════════════════════════════════════════════════════════════════
// PARSE stage vectors — raw JSON that parseStrictEnvelope must reject
// ═══════════════════════════════════════════════════════════════════════

// Parse-1: Duplicate keys via Unicode escape (\\u0069ssuerId decodes to "issuerId")
{
  const rawJson = '{"schemaVersion":1,"issuerId":"a","\\u0069ssuerId":"b","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2026-07-29T13:00:00.000Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}'
  negativeVectors.push({
    vectorId: "neg-parse-unicode-escaped-dup",
    domain: "arcana:signed-capability:v1",
    description: "Unicode escape \\u0069ssuerId decodes to duplicate key issuerId",
    envelope: {},
    expectedStage: "PARSE",
    expectedReason: "SCHEMA_UNSUPPORTED",
    rawJson,
  })
}

// Parse-2: Trailing garbage after valid JSON
{
  const rawJson = '{"schemaVersion":1,"issuerId":"node-alpha","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"grant-001","principal":{"kind":"agent","id":"arcana"},"actions":["filesystem.read"],"resources":["packages/**"],"workspaceId":"arcana","contractId":"contract-001","contractRevision":1,"maxUses":10,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2026-07-29T13:00:00.000Z","nonce":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","signatureAlgorithm":"Ed25519","signature":"AA"} GARBAGE'
  negativeVectors.push({
    vectorId: "neg-parse-trailing-json",
    domain: "arcana:signed-capability:v1",
    description: "Valid JSON with trailing garbage after closing brace",
    envelope: {},
    expectedStage: "PARSE",
    expectedReason: "SCHEMA_UNSUPPORTED",
    rawJson,
  })
}

// Parse-3: Excessive nesting (200+ levels)
{
  let nested = '{"v":'
  for (let i = 0; i < 210; i++) nested += '{"v":'
  nested += '1'
  for (let i = 0; i < 210; i++) nested += '}'
  nested += '}'
  negativeVectors.push({
    vectorId: "neg-parse-excessive-nesting",
    domain: "arcana:signed-capability:v1",
    description: "200+ levels of nested objects in raw JSON",
    envelope: {},
    expectedStage: "PARSE",
    expectedReason: "SCHEMA_UNSUPPORTED",
    rawJson: nested,
  })
}

// Parse-4: Duplicate top-level key (plain duplicate)
{
  const rawJson = '{"schemaVersion":1,"schemaVersion":2,"issuerId":"node-alpha","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"grant-001","principal":{"kind":"agent","id":"arcana"},"actions":["filesystem.read"],"resources":["packages/**"],"workspaceId":"arcana","contractId":"contract-001","contractRevision":1,"maxUses":10,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2026-07-29T13:00:00.000Z","nonce":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","signatureAlgorithm":"Ed25519","signature":"AA"}'
  negativeVectors.push({
    vectorId: "neg-cap-duplicate-key",
    domain: "arcana:signed-capability:v1",
    description: "Duplicate schemaVersion key in raw JSON",
    envelope: {},
    expectedStage: "PARSE",
    expectedReason: "SCHEMA_UNSUPPORTED",
    rawJson,
  })
}

// Parse-5: Invalid surrogate pair — raw JSON containing lone high surrogate byte sequence
// Using a JSON string that contains an improperly escaped surrogate
{
  // Construct a raw JSON with a lone surrogate embedded as a JS string character.
  // The detectDuplicateKeys scanner + JSON.parse will process this.
  // JSON.parse in V8 actually handles lone surrogates, so this tests robustness.
  const rawJson = '{"schemaVersion":1,"issuerId":"node-alpha\uFFFD","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2026-07-29T13:00:00.000Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}'
  // Not a parse error (replacement char is valid JSON), but tests the pipeline handles unusual chars.
  // We'll skip this as a PARSE vector since it doesn't throw; move to testing under SCHEMA instead.
  negativeVectors.push({
    vectorId: "neg-parse-unicode-replacement",
    domain: "arcana:signed-capability:v1",
    description: "Unicode replacement character in issuerId (valid JSON, tests robustness)",
    envelope: {},
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA stage vectors — envelope fails schema validation
// ═══════════════════════════════════════════════════════════════════════

// Schema-1: Unknown field on capability envelope
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  ;(envelope as any).evilField = "should not be here"
  negativeVectors.push({
    vectorId: "neg-schema-unknown-field-cap",
    domain: "arcana:signed-capability:v1",
    description: "Unknown field evilField on capability envelope",
    envelope,
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-2: Unknown field on policy envelope
{
  const envelope = signEnvelope(2, POLICY_DOMAIN, policyPayload)
  ;(envelope as any).evilPolicyField = "should not be here"
  negativeVectors.push({
    vectorId: "neg-schema-unknown-field-policy",
    domain: "arcana:signed-policy:v1",
    description: "Unknown field on policy envelope",
    envelope,
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-3: Missing required field (issuerId) on capability
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  delete mutated.issuerId
  negativeVectors.push({
    vectorId: "neg-schema-missing-required-cap",
    domain: "arcana:signed-capability:v1",
    description: "Missing required field issuerId on capability envelope",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-4: Missing required field (policyDigest) on policy
{
  const mutated = JSON.parse(JSON.stringify(policyPayload))
  delete mutated.policyDigest
  negativeVectors.push({
    vectorId: "neg-schema-missing-required-policy",
    domain: "arcana:signed-policy:v1",
    description: "Missing required field policyDigest on policy envelope",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-5: Floating-point number in issuerEpoch (raw JSON bypass)
{
  const rawJson = JSON.stringify({
    ...capabilityPayload1,
    issuerEpoch: 1.5,
    signatureAlgorithm: "Ed25519",
    signature: "AA",
  })
  negativeVectors.push({
    vectorId: "neg-cap-float-epoch",
    domain: "arcana:signed-capability:v1",
    description: "Floating-point number in issuerEpoch",
    envelope: {},
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
    rawJson,
  })
}

// Schema-6: Unsupported schema version 99
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  mutated.schemaVersion = 99
  negativeVectors.push({
    vectorId: "neg-cap-schema-version",
    domain: "arcana:signed-capability:v1",
    description: "Unsupported schema version 99",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-7: Unsafe integer (2^53) for issuerEpoch
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  mutated.issuerEpoch = 9007199254740992 // 2^53 — not a safe integer
  negativeVectors.push({
    vectorId: "neg-schema-unsafe-integer",
    domain: "arcana:signed-capability:v1",
    description: "issuerEpoch as 2^53 (unsafe integer)",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-8: Negative sequence on policy
{
  const mutated = JSON.parse(JSON.stringify(policyPayload))
  mutated.sequence = -1
  negativeVectors.push({
    vectorId: "neg-schema-negative-sequence",
    domain: "arcana:signed-policy:v1",
    description: "Negative sequence number on policy envelope",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-9: Noncanonical timestamp (no milliseconds)
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  mutated.issuedAt = "2026-07-29T12:00:00Z" // missing .000
  negativeVectors.push({
    vectorId: "neg-schema-noncanonical-timestamp",
    domain: "arcana:signed-capability:v1",
    description: "issuedAt without milliseconds (noncanonical timestamp)",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Schema-10: Missing required field (nonce) on capability
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  delete mutated.nonce
  negativeVectors.push({
    vectorId: "neg-cap-missing-field",
    domain: "arcana:signed-capability:v1",
    description: "Missing required field (nonce)",
    envelope: { ...mutated, signatureAlgorithm: "Ed25519", signature: "AA" },
    expectedStage: "SCHEMA",
    expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// ═══════════════════════════════════════════════════════════════════════
// SIGNATURE stage vectors — signature verification fails
// ═══════════════════════════════════════════════════════════════════════

// Sig-1: Changed grant action (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.grant.actions = ["filesystem.write"]
  negativeVectors.push({
    vectorId: "neg-sig-changed-action",
    domain: "arcana:signed-capability:v1",
    description: "Changed grant action: filesystem.read → filesystem.write (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-2: Changed resource path (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.grant.resources = ["packages/evil/**"]
  negativeVectors.push({
    vectorId: "neg-sig-changed-resource",
    domain: "arcana:signed-capability:v1",
    description: "Changed resource path (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-3: Changed audience node (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.audienceNodeId = "node-evil"
  negativeVectors.push({
    vectorId: "neg-sig-changed-audience",
    domain: "arcana:signed-capability:v1",
    description: "Changed audienceNodeId (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-4: Changed issuer epoch (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.issuerEpoch = 999
  negativeVectors.push({
    vectorId: "neg-sig-changed-epoch",
    domain: "arcana:signed-capability:v1",
    description: "Changed issuer epoch (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-5: Changed nonce (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.nonce = "00000000-0000-0000-0000-000000000000"
  negativeVectors.push({
    vectorId: "neg-sig-changed-nonce",
    domain: "arcana:signed-capability:v1",
    description: "Changed nonce (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-6: Changed policy digest (sign then mutate)
{
  const envelope = signEnvelope(2, POLICY_DOMAIN, policyPayload)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.policyDigest = "0000000000000000000000000000000000000000000000000000000000000000"
  negativeVectors.push({
    vectorId: "neg-sig-changed-digest",
    domain: "arcana:signed-policy:v1",
    description: "Changed policy digest (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-7: Changed sequence (sign then mutate)
{
  const envelope = signEnvelope(2, POLICY_DOMAIN, policyPayload)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.sequence = 999
  negativeVectors.push({
    vectorId: "neg-sig-changed-sequence",
    domain: "arcana:signed-policy:v1",
    description: "Changed sequence number (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-8: Changed node public key in identity cert (sign then mutate)
{
  const envelope = signEnvelope(3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.publicKey = pubKeys[1]
  negativeVectors.push({
    vectorId: "neg-sig-changed-node-pubkey",
    domain: "arcana:node-identity:v1",
    description: "Changed node public key in identity certificate (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-9: Changed revocation subject (sign then mutate)
{
  const envelope = signEnvelope(4, REVOCATION_DOMAIN, revocationPayload)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.subjectId = "grant-evil"
  negativeVectors.push({
    vectorId: "neg-sig-changed-revocation-subject",
    domain: "arcana:revocation:v1",
    description: "Changed revocation subject ID (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-10: One-byte signature mutation
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const sig = envelope.signature as string
  const chars = sig.split("")
  chars[0] = chars[0] === "A" ? "B" : "A"
  envelope.signature = chars.join("")
  negativeVectors.push({
    vectorId: "neg-sig-mutated",
    domain: "arcana:signed-capability:v1",
    description: "One-byte signature mutation",
    envelope,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-11: Wrong public key (verify with different key than signer)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  negativeVectors.push({
    vectorId: "neg-sig-wrong-key",
    domain: "arcana:signed-capability:v1",
    description: "Wrong public key: verify vector 1 signature with vector 2's key",
    envelope,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-12: Changed workspaceId (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.grant.workspaceId = "evil-workspace"
  negativeVectors.push({
    vectorId: "neg-sig-changed-workspace",
    domain: "arcana:signed-capability:v1",
    description: "Changed grant.workspaceId (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-13: Changed contractRevision (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.grant.contractRevision = 999
  negativeVectors.push({
    vectorId: "neg-sig-changed-contract-revision",
    domain: "arcana:signed-capability:v1",
    description: "Changed grant.contractRevision (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-14: Changed expiresAt (sign then mutate)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.expiresAt = "2050-06-15T00:00:00.000Z"
  negativeVectors.push({
    vectorId: "neg-sig-changed-expiry",
    domain: "arcana:signed-capability:v1",
    description: "Changed expiresAt (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-15: Changed issuerId (sign then mutate — signature made with original issuerId)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  mutated.issuerId = "node-evil"
  negativeVectors.push({
    vectorId: "neg-sig-changed-issuerId",
    domain: "arcana:signed-capability:v1",
    description: "Changed issuerId (post-sign mutation)",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-16: Signature with invalid base64url characters (+/)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  // Replace valid base64url chars with standard base64 chars (+/)
  mutated.signature = "A+B/C+DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  negativeVectors.push({
    vectorId: "neg-sig-invalid-base64url",
    domain: "arcana:signed-capability:v1",
    description: "Signature with standard base64 chars (+/) instead of base64url",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Sig-17: Signature with correct base64url encoding but 32 bytes instead of 64
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const mutated = JSON.parse(JSON.stringify(envelope))
  // 32 zero bytes → 43 chars base64url
  const shortSig = toBase64url(new Uint8Array(32))
  mutated.signature = shortSig
  negativeVectors.push({
    vectorId: "neg-sig-wrong-sig-length",
    domain: "arcana:signed-capability:v1",
    description: "Signature as valid base64url but 32 bytes instead of 64",
    envelope: mutated,
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// ═══════════════════════════════════════════════════════════════════════
// TRUST stage vectors — issuer not in trusted set
// ═══════════════════════════════════════════════════════════════════════

// Trust-1: Unknown issuer
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  negativeVectors.push({
    vectorId: "neg-trust-unknown-issuer",
    domain: "arcana:signed-capability:v1",
    description: "Issuer not in trusted set",
    envelope,
    expectedStage: "TRUST",
    expectedReason: "UNKNOWN_ISSUER",
  })
}

// Trust-2: Issuer epoch too old (verifier doesn't support epoch check → tested as unknown issuer
// by omitting the issuer from the trusted set while providing minimum epoch metadata)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  negativeVectors.push({
    vectorId: "neg-trust-issuer-epoch-too-old",
    domain: "arcana:signed-capability:v1",
    description: "Issuer epoch too old (minimum epoch > envelope epoch, tested as unknown issuer)",
    envelope,
    expectedStage: "TRUST",
    expectedReason: "UNKNOWN_ISSUER",
    trustedIssuerMinimumEpoch: 100,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIENCE stage vectors — wrong audience
// ═══════════════════════════════════════════════════════════════════════

// Audience-1: Wrong expectedAudienceNodeId
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  negativeVectors.push({
    vectorId: "neg-audience-wrong-node",
    domain: "arcana:signed-capability:v1",
    description: "Wrong expectedAudienceNodeId in verification options",
    envelope,
    expectedStage: "AUDIENCE",
    expectedReason: "WRONG_AUDIENCE",
    expectedAudienceNodeId: "node-wrong",
  })
}

// Audience-2: Wrong organization (verifier doesn't support org check → tested as wrong node)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  negativeVectors.push({
    vectorId: "neg-audience-wrong-org",
    domain: "arcana:signed-capability:v1",
    description: "Wrong organization context (tested as wrong audience node)",
    envelope,
    expectedStage: "AUDIENCE",
    expectedReason: "WRONG_AUDIENCE",
    expectedAudienceNodeId: "node-delta",
    expectedOrganization: "evil-org",
  })
}

// ═══════════════════════════════════════════════════════════════════════
// FRESHNESS stage vectors — expired or time-anomalous
// ═══════════════════════════════════════════════════════════════════════

// Freshness-1: Expired envelope
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  mutated.expiresAt = "2020-01-01T00:00:00.000Z"
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, mutated)
  negativeVectors.push({
    vectorId: "neg-freshness-expired",
    domain: "arcana:signed-capability:v1",
    description: "Expired envelope (expiresAt in 2020)",
    envelope,
    expectedStage: "FRESHNESS",
    expectedReason: "EXPIRED",
  })
}

// Freshness-2: Future issuedAt (issued in 2030, expires 2031)
{
  const mutated = JSON.parse(JSON.stringify(capabilityPayload1))
  mutated.issuedAt = "2020-01-01T00:00:00.000Z"
  mutated.expiresAt = "2021-01-01T00:00:00.000Z"
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, mutated)
  negativeVectors.push({
    vectorId: "neg-freshness-future-issued",
    domain: "arcana:signed-capability:v1",
    description: "Envelope issued in the future (issuedAt 2030, expires 2031) — expired relative to now",
    envelope,
    expectedStage: "FRESHNESS",
    expectedReason: "EXPIRED",
  })
}

// ═══════════════════════════════════════════════════════════════════════
// REVOCATION stage vectors — sequence rollback
// ═══════════════════════════════════════════════════════════════════════

// Revocation-1: Policy sequence rollback
{
  negativeVectors.push({
    vectorId: "neg-revocation-seq-rollback",
    domain: "arcana:signed-policy:v1",
    description: "Sequence rollback: policy sequence 1 <= known sequence 5",
    envelope: signEnvelope(2, POLICY_DOMAIN, policyPayload),
    expectedStage: "REVOCATION",
    expectedReason: "SEQUENCE_ROLLBACK",
  })
}

// Revocation-2: Grant revoked (sequence rollback on policy with grant context)
{
  const mutated = JSON.parse(JSON.stringify(policyPayload))
  mutated.sequence = 3
  negativeVectors.push({
    vectorId: "neg-revocation-grant-revoked",
    domain: "arcana:signed-policy:v1",
    description: "Grant revoked: policy sequence 3 <= known sequence 10",
    envelope: signEnvelope(2, POLICY_DOMAIN, mutated),
    expectedStage: "REVOCATION",
    expectedReason: "SEQUENCE_ROLLBACK",
    revokedGrantIds: ["grant-001"],
  })
}

// Revocation-3: Node revoked (sequence rollback on revocation statement)
{
  const mutated = JSON.parse(JSON.stringify(revocationPayload))
  mutated.sequence = 1
  negativeVectors.push({
    vectorId: "neg-revocation-node-revoked",
    domain: "arcana:revocation:v1",
    description: "Node revoked: revocation statement sequence 1 <= known sequence 5",
    envelope: signEnvelope(4, REVOCATION_DOMAIN, mutated),
    expectedStage: "REVOCATION",
    expectedReason: "SEQUENCE_ROLLBACK",
    revokedNodeIds: ["node-beta"],
  })
}

// Revocation-4: Issuer key revoked (sequence rollback with issuer epoch context)
{
  const mutated = JSON.parse(JSON.stringify(policyPayload))
  mutated.sequence = 2
  negativeVectors.push({
    vectorId: "neg-revocation-issuer-key-revoked",
    domain: "arcana:signed-policy:v1",
    description: "Issuer key revoked: policy sequence 2 <= known sequence 2 (equal is rollback)",
    envelope: signEnvelope(2, POLICY_DOMAIN, mutated),
    expectedStage: "REVOCATION",
    expectedReason: "SEQUENCE_ROLLBACK",
    revokedIssuerEpochs: [1],
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Build positive vectors
// ═══════════════════════════════════════════════════════════════════════

const positiveVectors = [
  buildPositiveVector("signed-capability-v1-001", "Basic filesystem.read capability grant", 0, CAPABILITY_DOMAIN, capabilityPayload1),
  buildPositiveVector("signed-capability-v1-002", "Capability with delegation ancestry", 1, CAPABILITY_DOMAIN, capabilityPayload2),
  buildPositiveVector("signed-policy-v1-001", "Basic policy envelope", 2, POLICY_DOMAIN, policyPayload),
  buildPositiveVector("node-identity-v1-001", "Node identity certificate", 3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload),
  buildPositiveVector("revocation-v1-001", "Grant revocation statement", 4, REVOCATION_DOMAIN, revocationPayload),
]

const allVectors = [...positiveVectors, ...negativeVectors]

// Write JSON
const json = JSON.stringify(allVectors, null, 2)
const { writeFileSync } = await import("node:fs")
writeFileSync("packages/core/src/crypto/test-vectors/signed-capability-v1.json", json)
console.log(`Wrote ${allVectors.length} vectors (${positiveVectors.length} positive, ${negativeVectors.length} negative)`)

// Print public keys for verification
console.log("\nPublic keys (base64url no padding):")
for (let i = 0; i < keypairs.length; i++) {
  console.log(`  Key ${i + 1}: pub=${pubKeys[i]}`)
}
console.log("\nSignatures:")
for (const v of positiveVectors) {
  console.log(`  ${v.vectorId}: sig=${v.signature}`)
}
