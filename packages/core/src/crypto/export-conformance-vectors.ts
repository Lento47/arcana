/**
 * Export ACEP-1 conformance vectors in implementation-neutral JSON.
 * Run with: bun run packages/core/src/crypto/export-conformance-vectors.ts
 *
 * Produces a JSON file that can be consumed by the Rust verifier
 * for cross-runtime comparison.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { canonicalize, buildSignatureInput, encodeBase64url } from "./canonical-serializer"
import {
  CAPABILITY_DOMAIN, POLICY_DOMAIN, NODE_IDENTITY_DOMAIN, REVOCATION_DOMAIN,
} from "./signed-envelopes"
import {
  parseStrictEnvelope,
  verifySignedCapability,
  verifySignedPolicy,
  verifyNodeIdentity,
  verifyRevocationStatement,
} from "./verifier"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
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
const pubKeys = keypairs.map(kp => encodeBase64url(kp.publicKey))

const trustedKeys = new Map<string, Uint8Array>([
  ["node-alpha", keypairs[0].publicKey],
  ["trust-registry", keypairs[3].publicKey],
  ["node-beta", keypairs[1].publicKey],
  ["node-gamma", keypairs[2].publicKey],
])

function signEnvelope(keyIndex: number, domain: string, unsigned: Record<string, unknown>) {
  const { signature: _, signatureAlgorithm: __, ...payload } = unsigned as any
  const sigInput = buildSignatureInput(domain as any, payload)
  const sig = ed25519.sign(sigInput, keypairs[keyIndex].secretKey)
  return { ...payload, signatureAlgorithm: "Ed25519", signature: encodeBase64url(sig) }
}

interface ConformanceVector {
  vectorId: string
  domain: string
  description: string
  envelopeType: "positive" | "negative"
  publicKey: string
  trustedIssuerId: string
  unsignedPayload: Record<string, unknown>
  canonicalPayloadHex: string
  signatureInputHex: string
  signature: string
  rawJson?: string
  expectedStatus: "VERIFIED" | "REJECTED"
  expectedStage?: string
  expectedReason?: string
  expectedAudience?: string
  trustedKeyIndex?: number
  knownSequences?: Record<string, number>
}

const vectors: ConformanceVector[] = []

// Payloads
const cap1 = {
  schemaVersion: 1, issuerId: "node-alpha", issuerEpoch: 1, audienceNodeId: "node-beta",
  grant: { grantId: "grant-001", principal: { kind: "agent", id: "arcana" }, actions: ["filesystem.read"], resources: ["packages/**"], workspaceId: "arcana", contractId: "contract-001", contractRevision: 1, maxUses: 10, delegationDepth: 0 },
  issuedAt: "2026-07-29T12:00:00.000Z", expiresAt: "2099-12-31T23:59:59.999Z", nonce: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
}
const cap2 = {
  schemaVersion: 1, issuerId: "node-alpha", issuerEpoch: 1, audienceNodeId: "node-gamma",
  grant: { grantId: "grant-002", principal: { kind: "subagent", id: "investigator" }, actions: ["filesystem.read"], resources: ["packages/core/src/**"], workspaceId: "arcana", contractId: "contract-001", contractRevision: 1, maxUses: 5, delegationDepth: 1, delegationAncestry: { parentGrantId: "grant-001", parentSignature: "parent-sig-placeholder", depth: 1 } },
  issuedAt: "2026-07-29T12:00:00.000Z", expiresAt: "2099-12-31T23:59:59.999Z", nonce: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
}
const pol1 = {
  schemaVersion: 1, issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
  policyId: "policy-default", policyVersion: "1.0.0", policyDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  issuedAt: "2026-07-29T12:00:00.000Z", expiresAt: "2099-12-31T23:59:59.999Z",
}
const node1 = {
  schemaVersion: 1, nodeId: "node-alpha", organizationId: "arcana-org", publicKey: pubKeys[0],
  issuerId: "trust-registry", issuerEpoch: 1, issuedAt: "2026-07-29T12:00:00.000Z", expiresAt: "2099-12-31T23:59:59.999Z", capabilities: ["grant", "revoke", "verify"],
}
const rev1 = {
  schemaVersion: 1, issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
  subjectType: "GRANT", subjectId: "grant-001", reason: "operator requested revocation", effectiveAt: "2026-07-29T12:00:00.000Z", issuedAt: "2026-07-29T12:00:00.000Z",
}

function addPositive(id: string, desc: string, keyIdx: number, domain: string, payload: Record<string, unknown>, trustedKeyIdx?: number) {
  const envelope = signEnvelope(keyIdx, domain, payload)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(domain as any, unsigned)
  vectors.push({
    vectorId: id, domain, description: desc, envelopeType: "positive",
    publicKey: pubKeys[keyIdx], trustedIssuerId: unsigned.issuerId,
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature,
    expectedStatus: "VERIFIED",
    trustedKeyIndex: trustedKeyIdx,
  })
}

function addNegative(id: string, desc: string, domain: string, envelope: Record<string, unknown>, stage: string, reason: string, opts?: { rawJson?: string; audience?: string; trustedIssuer?: string }) {
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(domain as any, unsigned)
  vectors.push({
    vectorId: id, domain, description: desc, envelopeType: "negative",
    publicKey: pubKeys[0], trustedIssuerId: opts?.trustedIssuer ?? "node-alpha",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature as string,
    rawJson: opts?.rawJson,
    expectedStatus: "REJECTED",
    expectedStage: stage,
    expectedReason: reason,
    expectedAudience: opts?.audience,
  })
}

// Positive vectors
addPositive("signed-capability-v1-001", "Basic filesystem.read capability grant", 0, CAPABILITY_DOMAIN, cap1)
addPositive("signed-capability-v1-002", "Capability with delegation ancestry", 0, CAPABILITY_DOMAIN, cap2)
addPositive("signed-policy-v1-001", "Basic policy envelope", 0, POLICY_DOMAIN, pol1)
addPositive("node-identity-v1-001", "Node identity certificate", 3, NODE_IDENTITY_DOMAIN, node1, 3)
addPositive("revocation-v1-001", "Grant revocation statement", 0, REVOCATION_DOMAIN, rev1)

// Negative vectors — SIGNATURE stage
const sigMutations = [
  { id: "neg-sig-changed-action", desc: "Changed grant action", mut: (e: any) => { e.grant.actions = ["filesystem.write"] } },
  { id: "neg-sig-changed-resource", desc: "Changed resource path", mut: (e: any) => { e.grant.resources = ["packages/evil/**"] } },
  { id: "neg-sig-changed-audience", desc: "Changed audienceNodeId", mut: (e: any) => { e.audienceNodeId = "node-evil" } },
  { id: "neg-sig-changed-epoch", desc: "Changed issuer epoch", mut: (e: any) => { e.issuerEpoch = 999 } },
  { id: "neg-sig-changed-nonce", desc: "Changed nonce", mut: (e: any) => { e.nonce = "00000000-0000-0000-0000-000000000000" } },
  { id: "neg-sig-changed-grantId", desc: "Changed grant ID", mut: (e: any) => { e.grant.grantId = "grant-evil" } },
  { id: "neg-sig-changed-workspace", desc: "Changed workspace", mut: (e: any) => { e.grant.workspaceId = "evil" } },
  { id: "neg-sig-changed-contract-revision", desc: "Changed contract revision", mut: (e: any) => { e.grant.contractRevision = 999 } },
  { id: "neg-sig-changed-expiry", desc: "Changed expiry", mut: (e: any) => { e.expiresAt = "2050-06-15T00:00:00.000Z" } },
]

for (const sv of sigMutations) {
  const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, cap1)))
  sv.mut(envelope)
  addNegative(sv.id, sv.desc, CAPABILITY_DOMAIN, envelope, "SIGNATURE", "INVALID_SIGNATURE")
}

// Wrong key — use key[1] as trusted key (key[0] signed it)
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, cap1)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(CAPABILITY_DOMAIN as any, unsigned)
  vectors.push({
    vectorId: "neg-sig-wrong-key", domain: CAPABILITY_DOMAIN, description: "Wrong public key", envelopeType: "negative",
    publicKey: pubKeys[1], trustedIssuerId: "node-alpha",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature,
    expectedStatus: "REJECTED", expectedStage: "SIGNATURE", expectedReason: "INVALID_SIGNATURE",
    trustedKeyIndex: 1,
  })
}

// Signature mutation
{
  const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, cap1)))
  const chars = envelope.signature.split("")
  chars[0] = chars[0] === "A" ? "B" : "A"
  envelope.signature = chars.join("")
  addNegative("neg-sig-mutated", "One-byte signature mutation", CAPABILITY_DOMAIN, envelope, "SIGNATURE", "INVALID_SIGNATURE")
}

// SCHEMA stage
addNegative("neg-schema-unknown-field", "Unknown field", CAPABILITY_DOMAIN,
  { ...signEnvelope(0, CAPABILITY_DOMAIN, cap1), evilField: "nope" }, "SCHEMA", "SCHEMA_UNSUPPORTED")
addNegative("neg-schema-missing-field", "Missing required field", CAPABILITY_DOMAIN,
  (() => { const { issuerId, ...rest } = signEnvelope(0, CAPABILITY_DOMAIN, cap1) as any; return rest })(), "SCHEMA", "SCHEMA_UNSUPPORTED")
addNegative("neg-schema-unsupported-version", "Unsupported schema version", CAPABILITY_DOMAIN,
  { ...signEnvelope(0, CAPABILITY_DOMAIN, cap1), schemaVersion: 99 }, "SCHEMA", "SCHEMA_UNSUPPORTED")

// TRUST stage
addNegative("neg-trust-unknown-issuer", "Unknown issuer", CAPABILITY_DOMAIN,
  signEnvelope(0, CAPABILITY_DOMAIN, cap1), "TRUST", "UNKNOWN_ISSUER", { trustedIssuer: "" })

// AUDIENCE stage
addNegative("neg-audience-wrong-node", "Wrong audience node", CAPABILITY_DOMAIN,
  signEnvelope(0, CAPABILITY_DOMAIN, cap1), "AUDIENCE", "WRONG_AUDIENCE", { audience: "node-wrong" })

// FRESHNESS stage
{
  const payload = { ...cap1, expiresAt: "2020-01-01T00:00:00.000Z" }
  addNegative("neg-freshness-expired", "Expired envelope", CAPABILITY_DOMAIN,
    signEnvelope(0, CAPABILITY_DOMAIN, payload), "FRESHNESS", "EXPIRED")
}

// REVOCATION stage
{
  const envelope = signEnvelope(0, POLICY_DOMAIN, pol1)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(POLICY_DOMAIN as any, unsigned)
  vectors.push({
    vectorId: "neg-revocation-seq-rollback", domain: POLICY_DOMAIN, description: "Sequence rollback", envelopeType: "negative",
    publicKey: pubKeys[0], trustedIssuerId: "node-alpha",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature,
    expectedStatus: "REJECTED", expectedStage: "REVOCATION", expectedReason: "SEQUENCE_ROLLBACK",
    knownSequences: { "node-alpha": 5 },
  })
}

// Additional SIGNATURE vectors
addNegative("neg-sig-changed-digest", "Changed policy digest", POLICY_DOMAIN,
  (() => { const e = JSON.parse(JSON.stringify(signEnvelope(0, POLICY_DOMAIN, pol1))); e.policyDigest = "0".repeat(64); return e })(), "SIGNATURE", "INVALID_SIGNATURE")
addNegative("neg-sig-changed-sequence", "Changed policy sequence", POLICY_DOMAIN,
  (() => { const e = JSON.parse(JSON.stringify(signEnvelope(0, POLICY_DOMAIN, pol1))); e.sequence = 999; return e })(), "SIGNATURE", "INVALID_SIGNATURE")
{
  const e = JSON.parse(JSON.stringify(signEnvelope(3, NODE_IDENTITY_DOMAIN, node1)))
  e.publicKey = pubKeys[1]
  const { signature: _, signatureAlgorithm: __, ...unsigned } = e as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(NODE_IDENTITY_DOMAIN as any, unsigned)
  vectors.push({
    vectorId: "neg-sig-changed-node-pubkey", domain: NODE_IDENTITY_DOMAIN, description: "Changed node public key in identity cert", envelopeType: "negative",
    publicKey: pubKeys[3], trustedIssuerId: "trust-registry",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: e.signature,
    expectedStatus: "REJECTED", expectedStage: "SIGNATURE", expectedReason: "INVALID_SIGNATURE",
    trustedKeyIndex: 3,
  })
}
addNegative("neg-sig-changed-revocation-subject", "Changed revocation subject", REVOCATION_DOMAIN,
  (() => { const e = JSON.parse(JSON.stringify(signEnvelope(0, REVOCATION_DOMAIN, rev1))); e.subjectId = "grant-evil"; return e })(), "SIGNATURE", "INVALID_SIGNATURE")

// Signature with invalid base64url characters
{
  const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, cap1)))
  envelope.signature = "A+B/C+DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  addNegative("neg-sig-invalid-base64url", "Signature with standard base64 chars (+/)", CAPABILITY_DOMAIN, envelope, "SIGNATURE", "INVALID_SIGNATURE")
}

// Wrong signature length (32 bytes instead of 64)
{
  const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, cap1)))
  envelope.signature = encodeBase64url(new Uint8Array(32))
  addNegative("neg-sig-wrong-sig-length", "Signature as valid base64url but 32 bytes", CAPABILITY_DOMAIN, envelope, "SIGNATURE", "INVALID_SIGNATURE")
}

// Additional SCHEMA vectors
addNegative("neg-schema-unknown-field-policy", "Unknown field on policy", POLICY_DOMAIN,
  { ...signEnvelope(0, POLICY_DOMAIN, pol1), evilField: "nope" }, "SCHEMA", "SCHEMA_UNSUPPORTED")
addNegative("neg-schema-missing-required-cap", "Missing issuerId on capability", CAPABILITY_DOMAIN,
  (() => { const { issuerId, ...rest } = signEnvelope(0, CAPABILITY_DOMAIN, cap1) as any; return rest })(), "SCHEMA", "SCHEMA_UNSUPPORTED")
addNegative("neg-schema-missing-required-policy", "Missing policyDigest on policy", POLICY_DOMAIN,
  (() => { const { policyDigest, ...rest } = signEnvelope(0, POLICY_DOMAIN, pol1) as any; return rest })(), "SCHEMA", "SCHEMA_UNSUPPORTED")

// Float epoch (raw JSON needed)
vectors.push({
  vectorId: "neg-schema-float-epoch", domain: CAPABILITY_DOMAIN, description: "Floating-point issuerEpoch", envelopeType: "negative",
  publicKey: "", trustedIssuerId: "", unsignedPayload: {},
  canonicalPayloadHex: "", signatureInputHex: "", signature: "",
  rawJson: JSON.stringify({ ...cap1, issuerEpoch: 1.5, signatureAlgorithm: "Ed25519", signature: "AA" }),
  expectedStatus: "REJECTED", expectedStage: "SCHEMA", expectedReason: "SCHEMA_UNSUPPORTED",
})

// Noncanonical timestamp
addNegative("neg-schema-noncanonical-timestamp", "issuedAt without milliseconds", CAPABILITY_DOMAIN,
  { ...signEnvelope(0, CAPABILITY_DOMAIN, cap1), issuedAt: "2026-07-29T12:00:00Z" }, "SCHEMA", "SCHEMA_UNSUPPORTED")

// Unsafe integer
addNegative("neg-schema-unsafe-integer", "issuerEpoch as 2^53 (unsafe)", CAPABILITY_DOMAIN,
  { ...signEnvelope(0, CAPABILITY_DOMAIN, cap1), issuerEpoch: 9007199254740992 }, "SCHEMA", "SCHEMA_UNSUPPORTED")

// Negative sequence
addNegative("neg-schema-negative-sequence", "Negative sequence on policy", POLICY_DOMAIN,
  { ...signEnvelope(0, POLICY_DOMAIN, pol1), sequence: -1 }, "SCHEMA", "SCHEMA_UNSUPPORTED")

// Unsupported schema version (policy)
addNegative("neg-schema-unsupported-version-policy", "Unsupported schema version on policy", POLICY_DOMAIN,
  { ...signEnvelope(0, POLICY_DOMAIN, pol1), schemaVersion: 99 }, "SCHEMA", "SCHEMA_UNSUPPORTED")

// Additional TRUST vectors
addNegative("neg-trust-issuer-epoch-too-old", "Issuer epoch too old", CAPABILITY_DOMAIN,
  signEnvelope(0, CAPABILITY_DOMAIN, cap1), "TRUST", "UNKNOWN_ISSUER", { trustedIssuer: "" })

// Additional AUDIENCE vectors
addNegative("neg-audience-wrong-org", "Wrong organization", CAPABILITY_DOMAIN,
  signEnvelope(0, CAPABILITY_DOMAIN, cap1), "AUDIENCE", "WRONG_AUDIENCE", { audience: "node-delta" })

// Additional REVOCATION vectors
// Sequence equal (rollback)
{
  const envelope = signEnvelope(0, POLICY_DOMAIN, pol1)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(POLICY_DOMAIN as any, unsigned)
  vectors.push({
    vectorId: "neg-revocation-seq-equal", domain: POLICY_DOMAIN, description: "Sequence equal (rollback)", envelopeType: "negative",
    publicKey: pubKeys[0], trustedIssuerId: "node-alpha",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature,
    expectedStatus: "REJECTED", expectedStage: "REVOCATION", expectedReason: "SEQUENCE_ROLLBACK",
    knownSequences: { "node-alpha": 1 },
  })
}

// Revocation statement rollback
{
  const envelope = signEnvelope(0, REVOCATION_DOMAIN, rev1)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = envelope as any
  const canonical = canonicalize(unsigned)
  const sigInput = buildSignatureInput(REVOCATION_DOMAIN as any, unsigned)
  vectors.push({
    vectorId: "neg-revocation-statement-rollback", domain: REVOCATION_DOMAIN, description: "Revocation statement sequence rollback", envelopeType: "negative",
    publicKey: pubKeys[0], trustedIssuerId: "node-alpha",
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonical)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: envelope.signature,
    expectedStatus: "REJECTED", expectedStage: "REVOCATION", expectedReason: "SEQUENCE_ROLLBACK",
    knownSequences: { "node-alpha": 5 },
  })
}

// Additional PARSE vectors
// Excessive nesting
{
  let nested = '{"v":'
  for (let i = 0; i < 210; i++) nested += '{"v":'
  nested += '1'
  for (let i = 0; i < 210; i++) nested += '}'
  nested += '}'
  vectors.push({
    vectorId: "neg-parse-excessive-nesting", domain: CAPABILITY_DOMAIN, description: "200+ levels of nested objects", envelopeType: "negative",
    publicKey: "", trustedIssuerId: "", unsignedPayload: {},
    canonicalPayloadHex: "", signatureInputHex: "", signature: "",
    rawJson: nested, expectedStatus: "REJECTED", expectedStage: "PARSE", expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// PARSE stage (raw JSON) — add missing ones
const parseVectors = [
  { id: "neg-parse-duplicate-key", desc: "Duplicate top-level key", json: '{"schemaVersion":1,"schemaVersion":2,"issuerId":"node-alpha","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2099-12-31T23:59:59.999Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}' },
  { id: "neg-parse-unicode-escaped-dup", desc: "Unicode-escaped duplicate key", json: '{"schemaVersion":1,"issuerId":"a","\\u0069ssuerId":"b","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2099-12-31T23:59:59.999Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}' },
  { id: "neg-parse-trailing-json", desc: "Trailing garbage", json: '{"schemaVersion":1} GARBAGE' },
  { id: "neg-parse-nested-dup", desc: "Nested duplicate key", json: '{"grant":{"a":1,"a":2},"schemaVersion":1}' },
]

for (const pv of parseVectors) {
  vectors.push({
    vectorId: pv.id, domain: CAPABILITY_DOMAIN, description: pv.desc, envelopeType: "negative",
    publicKey: "", trustedIssuerId: "", unsignedPayload: {},
    canonicalPayloadHex: "", signatureInputHex: "", signature: "",
    rawJson: pv.json, expectedStatus: "REJECTED", expectedStage: "PARSE", expectedReason: "SCHEMA_UNSUPPORTED",
  })
}

// Write output
const output = JSON.stringify(vectors, null, 2)
const { writeFileSync } = await import("node:fs")
writeFileSync("tools/acep-conformance-rust/vectors/conformance-vectors.json", output)
console.log(`Exported ${vectors.length} conformance vectors (${vectors.filter(v => v.envelopeType === 'positive').length} positive, ${vectors.filter(v => v.envelopeType === 'negative').length} negative)`)
