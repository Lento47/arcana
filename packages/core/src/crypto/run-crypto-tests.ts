/**
 * ACEP-1 Golden Vector Conformance Suite — standalone runner
 * Run with: bun run packages/core/src/crypto/run-crypto-tests.ts
 *
 * Works around Bun 1.3.14 test runner segfault with @noble/curves on Windows.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import {
  canonicalize,
  buildSignatureInput,
  validateEnvelopePayload,
  validateTimestamp,
  decodeBase64url,
  decodeCanonicalBase64url,
  validateSafeInteger,
  encodeBase64url,
  type SignatureDomain,
} from "./canonical-serializer"
import {
  parseStrictEnvelope,
  verifySignedCapability,
  verifySignedPolicy,
  verifyNodeIdentity,
  verifyRevocationStatement,
  type VerificationResult,
} from "./verifier"
import {
  CAPABILITY_DOMAIN,
  POLICY_DOMAIN,
  NODE_IDENTITY_DOMAIN,
  REVOCATION_DOMAIN,
} from "./signed-envelopes"

// ─── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(message)
    console.log(`  ✗ ${message}`)
  }
}

function assertThrows(fn: () => void, message: string) {
  try {
    fn()
    failed++
    failures.push(`${message} — expected throw but did not throw`)
    console.log(`  ✗ ${message} — expected throw but did not throw`)
  } catch {
    passed++
  }
}

// ─── Keys ─────────────────────────────────────────────────────────────

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

// ─── Payloads ─────────────────────────────────────────────────────────

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
  expiresAt: "2099-12-31T23:59:59.999Z",
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
  expiresAt: "2099-12-31T23:59:59.999Z",
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
  expiresAt: "2099-12-31T23:59:59.999Z",
}

const nodeIdentityPayload = {
  schemaVersion: 1,
  nodeId: "node-alpha",
  organizationId: "arcana-org",
  publicKey: pubKeys[0],
  issuerId: "trust-registry",
  issuerEpoch: 1,
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2099-12-31T23:59:59.999Z",
  capabilities: ["grant", "revoke", "verify"],
}

const revocationPayload = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  subjectType: "GRANT" as const,
  subjectId: "grant-001",
  reason: "operator requested revocation",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  issuedAt: "2026-07-29T12:00:00.000Z",
}

function signEnvelope(keyIndex: number, domain: SignatureDomain, unsignedPayload: Record<string, unknown>) {
  const { signature: _, signatureAlgorithm: __, ...unsigned } = unsignedPayload as any
  const sigInput = buildSignatureInput(domain, unsigned)
  const sig = ed25519.sign(sigInput, keypairs[keyIndex].secretKey)
  return { ...unsigned, signatureAlgorithm: "Ed25519", signature: encodeBase64url(sig) }
}

// ═══════════════════════════════════════════════════════════════════════
// § 1. Canonical Serialization
// ═══════════════════════════════════════════════════════════════════════

console.log("§1 Canonical serialization")
{
  const payload = { schemaVersion: 1, issuerId: "node-alpha", issuerEpoch: 1, audienceNodeId: "node-beta", nonce: "test" }
  assert(canonicalize(payload) === canonicalize(payload), "same payload canonicalizes identically")
  assert(canonicalize({ b: 2, a: 1, c: 3 }) === canonicalize({ a: 1, c: 3, b: 2 }), "key ordering does not affect bytes")
  assert(canonicalize({ actions: ["read", "write"] }) !== canonicalize({ actions: ["write", "read"] }), "array ordering remains significant")
  assert(canonicalize(null) === "null", "null preserved")
  assert(canonicalize(true) === "true", "boolean true preserved")
  assert(canonicalize(42) === "42", "integer preserved")
  assert(canonicalize("hello") === '"hello"', "string JSON-escaped")
  assert(canonicalize({ z: { b: 2, a: 1 }, a: { z: 3, y: 2 } }) === '{"a":{"y":2,"z":3},"z":{"a":1,"b":2}}', "nested sorted recursively")
  assertThrows(() => canonicalize({ a: undefined }), "undefined values throw")
  assertThrows(() => canonicalize(Infinity), "Infinity throws")
  assertThrows(() => canonicalize(3.14), "float throws")
}

// ═══════════════════════════════════════════════════════════════════════
// § 2. Domain Separators
// ═══════════════════════════════════════════════════════════════════════

console.log("§2 Domain separators")
{
  const domains = [CAPABILITY_DOMAIN, POLICY_DOMAIN, NODE_IDENTITY_DOMAIN, REVOCATION_DOMAIN]
  assert(new Set(domains).size === 4, "all four domains distinct")
  assert(domains.every(d => d.startsWith("arcana:")), "all start with arcana:")
  assert(domains.every(d => d.endsWith(":v1")), "all end with :v1")
}

// ═══════════════════════════════════════════════════════════════════════
// § 3. Strict Wire Parsing
// ═══════════════════════════════════════════════════════════════════════

console.log("§3 Strict wire parsing")
{
  const result = parseStrictEnvelope('{"a":1,"b":2}')
  assert(result.a === 1 && result.b === 2, "accepts valid JSON")
  assertThrows(() => parseStrictEnvelope('{"a":1,"a":2}'), "rejects duplicate top-level keys")
  assertThrows(() => parseStrictEnvelope('{"outer":{"a":1,"a":2}}'), "rejects duplicate nested keys")
  assertThrows(() => parseStrictEnvelope('{"issuerId":"a","\\u0069ssuerId":"b"}'), "rejects Unicode-escaped duplicate keys")
  assertThrows(() => parseStrictEnvelope('{"a":1} GARBAGE'), "rejects trailing JSON")
  assertThrows(() => parseStrictEnvelope("{invalid}"), "rejects invalid JSON")
  assertThrows(() => parseStrictEnvelope('"hello"'), "rejects non-object top-level")
  assert(Object.keys(parseStrictEnvelope("{}")).length === 0, "handles empty object")
}

// ═══════════════════════════════════════════════════════════════════════
// § 4. Base64url
// ═══════════════════════════════════════════════════════════════════════

console.log("§4 Base64url encoding")
{
  const bytes = new Uint8Array([0, 1, 2, 3, 255, 254, 253])
  assert(encodeBase64url(bytes) === encodeBase64url(bytes), "deterministic encode")
  assert(decodeCanonicalBase64url("A+B/") === null, "rejects standard base64 chars")
  assert(decodeCanonicalBase64url("AAAA=") === null, "rejects padding")
  assert(decodeCanonicalBase64url("AA AA") === null, "rejects whitespace")
  assert(decodeCanonicalBase64url("A") === null, "rejects invalid length 1 mod 4")
}

// ═══════════════════════════════════════════════════════════════════════
// § 5. Noble Ed25519
// ═══════════════════════════════════════════════════════════════════════

console.log("§5 Noble Ed25519")
{
  const kp = ed25519.keygen(hexToBytes(seeds[0]))
  assert(kp.publicKey.length === 32, "public key is 32 bytes")
  const msg = new TextEncoder().encode("test message")
  const sig = ed25519.sign(msg, kp.secretKey)
  assert(sig.length === 64, "signature is 64 bytes")
  assert(ed25519.verify(sig, msg, kp.publicKey) === true, "sign+verify roundtrip")
  const kp2 = ed25519.keygen(hexToBytes(seeds[1]))
  assert(ed25519.verify(sig, msg, kp2.publicKey) === false, "wrong key rejects")
  assert(ed25519.verify(sig, new TextEncoder().encode("wrong"), kp.publicKey) === false, "wrong message rejects")
}

// ═══════════════════════════════════════════════════════════════════════
// § 6. Positive Golden Vectors
// ═══════════════════════════════════════════════════════════════════════

console.log("§6 Positive golden vectors")
{
  // Capability v1
  const cap = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const r1 = verifySignedCapability(cap as any, trustedKeys, { expectedAudienceNodeId: "node-beta" })
  assert(r1.valid === true, "positive: signed-capability-v1-001")

  // Capability v2
  const cap2 = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload2)
  const r2 = verifySignedCapability(cap2 as any, trustedKeys, { expectedAudienceNodeId: "node-gamma" })
  assert(r2.valid === true, "positive: signed-capability-v1-002")

  // Policy
  const pol = signEnvelope(0, POLICY_DOMAIN, policyPayload)
  const r3 = verifySignedPolicy(pol as any, trustedKeys, new Map(), Date.now())
  assert(r3.valid === true, "positive: signed-policy-v1-001")

  // Node identity
  const node = signEnvelope(3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload)
  const r4 = verifyNodeIdentity(node as any, trustedKeys, Date.now())
  assert(r4.valid === true, "positive: node-identity-v1-001")

  // Revocation
  const rev = signEnvelope(0, REVOCATION_DOMAIN, revocationPayload)
  const r5 = verifyRevocationStatement(rev as any, trustedKeys, new Map(), Date.now())
  assert(r5.valid === true, "positive: revocation-v1-001")
}

// ═══════════════════════════════════════════════════════════════════════
// § 7. Negative Vectors — PARSE stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§7 Negative vectors — PARSE")
{
  // Duplicate key
  assertThrows(() => parseStrictEnvelope('{"schemaVersion":1,"schemaVersion":2}'), "neg-parse-duplicate-key")
  // Unicode-escaped duplicate
  assertThrows(() => parseStrictEnvelope('{"issuerId":"a","\\u0069ssuerId":"b"}'), "neg-parse-unicode-escaped-dup")
  // Trailing garbage
  assertThrows(() => parseStrictEnvelope('{"a":1} GARBAGE'), "neg-parse-trailing-json")
  // Nested duplicate
  assertThrows(() => parseStrictEnvelope('{"grant":{"a":1,"a":2},"schemaVersion":1}'), "neg-parse-nested-dup")
}

// ═══════════════════════════════════════════════════════════════════════
// § 8. Negative Vectors — SCHEMA stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§8 Negative vectors — SCHEMA")
{
  // Unknown field
  const cap = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const r1 = verifySignedCapability({ ...cap, evilField: "nope" } as any, trustedKeys)
  assert(r1.valid === false && r1.stage === "SCHEMA", "neg-schema-unknown-field-cap")

  // Missing required field
  const { issuerId, ...rest } = cap as any
  const r2 = verifySignedCapability(rest, trustedKeys)
  assert(r2.valid === false && r2.stage === "SCHEMA", "neg-schema-missing-required-cap")

  // Unsupported schema version
  const r3 = verifySignedCapability({ ...cap, schemaVersion: 99 } as any, trustedKeys)
  assert(r3.valid === false && r3.stage === "SCHEMA", "neg-schema-unsupported-version")

  // Noncanonical timestamp
  const r4 = verifySignedCapability({ ...cap, issuedAt: "2026-07-29T12:00:00Z" } as any, trustedKeys)
  assert(r4.valid === false && r4.stage === "SCHEMA", "neg-schema-noncanonical-timestamp")

  // Unsafe integer
  const r5 = verifySignedCapability({ ...cap, issuerEpoch: 9007199254740992 } as any, trustedKeys)
  assert(r5.valid === false && r5.stage === "SCHEMA", "neg-schema-unsafe-integer")

  // Negative sequence
  const pol = signEnvelope(0, POLICY_DOMAIN, policyPayload)
  const r6 = verifySignedPolicy({ ...pol, sequence: -1 } as any, trustedKeys, new Map(), Date.now())
  assert(r6.valid === false && r6.stage === "SCHEMA", "neg-schema-negative-sequence")

  // Float epoch via raw JSON
  const floatJson = JSON.stringify({ ...capabilityPayload1, issuerEpoch: 1.5, signatureAlgorithm: "Ed25519", signature: "AA" })
  const parsed = JSON.parse(floatJson)
  const r7 = verifySignedCapability(parsed, trustedKeys)
  assert(r7.valid === false && r7.stage === "SCHEMA", "neg-schema-float-epoch")
}

// ═══════════════════════════════════════════════════════════════════════
// § 9. Negative Vectors — SIGNATURE stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§9 Negative vectors — SIGNATURE")
{
  const mutations = [
    { id: "action", mut: (e: any) => { e.grant.actions = ["filesystem.write"] } },
    { id: "resource", mut: (e: any) => { e.grant.resources = ["packages/evil/**"] } },
    { id: "audience", mut: (e: any) => { e.audienceNodeId = "node-evil" } },
    { id: "epoch", mut: (e: any) => { e.issuerEpoch = 999 } },
    { id: "nonce", mut: (e: any) => { e.nonce = "00000000-0000-0000-0000-000000000000" } },
    { id: "grantId", mut: (e: any) => { e.grant.grantId = "grant-evil" } },
    { id: "workspace", mut: (e: any) => { e.grant.workspaceId = "evil-workspace" } },
    { id: "contract-revision", mut: (e: any) => { e.grant.contractRevision = 999 } },
    { id: "expiry", mut: (e: any) => { e.expiresAt = "2050-06-15T00:00:00.000Z" } },
  ]

  for (const m of mutations) {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    m.mut(envelope)
    const r = verifySignedCapability(envelope, trustedKeys)
    assert(r.valid === false && r.stage === "SIGNATURE" && r.reason === "INVALID_SIGNATURE", `neg-sig-changed-${m.id}`)
  }

  // One-byte signature mutation
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    const chars = envelope.signature.split("")
    chars[0] = chars[0] === "A" ? "B" : "A"
    envelope.signature = chars.join("")
    const r = verifySignedCapability(envelope, trustedKeys)
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-mutated")
  }

  // Wrong public key
  {
    const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
    const wrongKeys = new Map([["node-alpha", keypairs[1].publicKey]])
    const r = verifySignedCapability(envelope as any, wrongKeys)
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-wrong-key")
  }

  // Invalid base64url
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    envelope.signature = "A+B/C+DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    const r = verifySignedCapability(envelope, trustedKeys)
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-invalid-base64url")
  }

  // Wrong sig length
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    envelope.signature = encodeBase64url(new Uint8Array(32))
    const r = verifySignedCapability(envelope, trustedKeys)
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-wrong-sig-length")
  }

  // Changed policy digest
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, POLICY_DOMAIN, policyPayload)))
    envelope.policyDigest = "0".repeat(64)
    const r = verifySignedPolicy(envelope, trustedKeys, new Map(), Date.now())
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-changed-digest")
  }

  // Changed node pubkey in identity cert
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload)))
    envelope.publicKey = pubKeys[1]
    const r = verifyNodeIdentity(envelope, trustedKeys, Date.now())
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-changed-node-pubkey")
  }

  // Changed revocation subject
  {
    const envelope = JSON.parse(JSON.stringify(signEnvelope(0, REVOCATION_DOMAIN, revocationPayload)))
    envelope.subjectId = "grant-evil"
    const r = verifyRevocationStatement(envelope, trustedKeys, new Map(), Date.now())
    assert(r.valid === false && r.stage === "SIGNATURE", "neg-sig-changed-revocation-subject")
  }
}

// ═══════════════════════════════════════════════════════════════════════
// § 10. Negative Vectors — TRUST stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§10 Negative vectors — TRUST")
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const emptyKeys = new Map<string, Uint8Array>()
  const r = verifySignedCapability(envelope as any, emptyKeys)
  assert(r.valid === false && r.stage === "TRUST" && r.reason === "UNKNOWN_ISSUER", "neg-trust-unknown-issuer")
}

// ═══════════════════════════════════════════════════════════════════════
// § 11. Negative Vectors — AUDIENCE stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§11 Negative vectors — AUDIENCE")
{
  const envelope = signEnvelope(0, CAPABILITY_DOMAIN, capabilityPayload1)
  const r = verifySignedCapability(envelope as any, trustedKeys, { expectedAudienceNodeId: "node-wrong" })
  assert(r.valid === false && r.stage === "AUDIENCE" && r.reason === "WRONG_AUDIENCE", "neg-audience-wrong-node")
}

// ═══════════════════════════════════════════════════════════════════════
// § 12. Negative Vectors — FRESHNESS stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§12 Negative vectors — FRESHNESS")
{
  // Expired
  const payload1 = { ...capabilityPayload1, expiresAt: "2020-01-01T00:00:00.000Z" }
  const envelope1 = signEnvelope(0, CAPABILITY_DOMAIN, payload1)
  const r1 = verifySignedCapability(envelope1 as any, trustedKeys)
  assert(r1.valid === false && r1.stage === "FRESHNESS" && r1.reason === "EXPIRED", "neg-freshness-expired")

  // Future issued with expired expiry (issued in 2030, expires in 2030 — but now is 2026)
  // Actually, freshness only checks expiresAt. If expiresAt is in the future, it's valid.
  // To test freshness rejection, expiresAt must be in the PAST.
  const payload2 = { ...capabilityPayload1, issuedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2021-01-01T00:00:00.000Z" }
  const envelope2 = signEnvelope(0, CAPABILITY_DOMAIN, payload2)
  const r2 = verifySignedCapability(envelope2 as any, trustedKeys)
  assert(r2.valid === false && r2.stage === "FRESHNESS" && r2.reason === "EXPIRED", "neg-freshness-future-issued")
}

// ═══════════════════════════════════════════════════════════════════════
// § 13. Negative Vectors — REVOCATION stage
// ═══════════════════════════════════════════════════════════════════════

console.log("§13 Negative vectors — REVOCATION")
{
  // Sequence rollback
  const envelope = signEnvelope(0, POLICY_DOMAIN, policyPayload)
  const r = verifySignedPolicy(envelope as any, trustedKeys, new Map([["node-alpha", 5]]), Date.now())
  assert(r.valid === false && r.stage === "REVOCATION" && r.reason === "SEQUENCE_ROLLBACK", "neg-revocation-seq-rollback")

  // Sequence equal
  const r2 = verifySignedPolicy(envelope as any, trustedKeys, new Map([["node-alpha", 1]]), Date.now())
  assert(r2.valid === false && r2.stage === "REVOCATION", "neg-revocation-seq-equal")
}

// ═══════════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n═══════════════════════════════════════════`)
console.log(`Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`)
if (failures.length > 0) {
  console.log(`\nFailures:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log(`✓ All tests passed`)
}
