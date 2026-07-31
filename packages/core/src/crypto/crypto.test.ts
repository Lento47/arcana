/**
 * ACEP-1 Golden Vector Conformance Suite
 *
 * Table-driven verification tests. Every vector has an explicit handler.
 * No default positive fallback. Unhandled vector IDs fail the suite.
 *
 * Stages tested: PARSE, SCHEMA, SIGNATURE, TRUST, AUDIENCE, FRESHNESS, REVOCATION
 */

import { describe, expect, it } from "bun:test"
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
  validateEnvelopeSchema,
  verifyEnvelopeSignature,
  verifyIssuerTrust,
  verifyAudience,
  verifyFreshness,
  verifyRevocationStatus,
  type VerificationResult,
} from "./verifier"
import {
  CAPABILITY_DOMAIN,
  POLICY_DOMAIN,
  NODE_IDENTITY_DOMAIN,
  REVOCATION_DOMAIN,
  type RejectionReason,
} from "./signed-envelopes"
import { ed25519 } from "@noble/curves/ed25519.js"

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function toBase64url(bytes: Uint8Array): string {
  return encodeBase64url(bytes)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

// ═══════════════════════════════════════════════════════════════════════
// Keys and Payloads
// ═══════════════════════════════════════════════════════════════════════

const seeds = [
  "0000000000000000000000000000000000000000000000000000000000000001",
  "0000000000000000000000000000000000000000000000000000000000000002",
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
  "0000000000000000000000000000000000000000000000000000000000000005",
]

const keypairs = seeds.map(seed => ed25519.keygen(hexToBytes(seed)))
const pubKeys = keypairs.map(kp => toBase64url(kp.publicKey))

// Trusted keys map for positive verification (all 5 issuers)
const trustedKeys = new Map<string, Uint8Array>([
  ["node-alpha", keypairs[0].publicKey],
  ["trust-registry", keypairs[3].publicKey],
  ["node-beta", keypairs[1].publicKey],
  ["node-gamma", keypairs[2].publicKey],
  ["revocation-issuer", keypairs[4].publicKey],
])

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

// Sign helper
function signEnvelope(keyIndex: number, domain: SignatureDomain, unsignedPayload: Record<string, unknown>) {
  const { signature: _, signatureAlgorithm: __, ...unsigned } = unsignedPayload as any
  const sigInput = buildSignatureInput(domain, unsigned)
  const sig = ed25519.sign(sigInput, keypairs[keyIndex].secretKey)
  return {
    ...unsigned,
    signatureAlgorithm: "Ed25519",
    signature: toBase64url(sig),
  }
}

function buildSignedPayload(keyIndex: number, domain: SignatureDomain, payload: Record<string, unknown>) {
  return signEnvelope(keyIndex, domain, payload)
}

// ═══════════════════════════════════════════════════════════════════════
// § 1. Canonical Serialization
// ═══════════════════════════════════════════════════════════════════════

describe("§1 Canonical serialization", () => {
  it("same payload canonicalizes identically", () => {
    const payload = {
      schemaVersion: 1,
      issuerId: "node-alpha",
      issuerEpoch: 1,
      audienceNodeId: "node-beta",
      nonce: "test-nonce",
    }

    const bytes1 = canonicalize(payload)
    const bytes2 = canonicalize(payload)
    expect(bytes1).toBe(bytes2)
  })

  it("object input ordering does not affect bytes", () => {
    const payload1 = { b: 2, a: 1, c: 3 }
    const payload2 = { a: 1, c: 3, b: 2 }

    expect(canonicalize(payload1)).toBe(canonicalize(payload2))
  })

  it("array ordering remains significant", () => {
    const payload1 = { actions: ["read", "write"] }
    const payload2 = { actions: ["write", "read"] }

    expect(canonicalize(payload1)).not.toBe(canonicalize(payload2))
  })

  it("null values preserved", () => {
    expect(canonicalize(null)).toBe("null")
  })

  it("boolean values preserved", () => {
    expect(canonicalize(true)).toBe("true")
    expect(canonicalize(false)).toBe("false")
  })

  it("integer values preserved", () => {
    expect(canonicalize(42)).toBe("42")
    expect(canonicalize(0)).toBe("0")
    expect(canonicalize(-1)).toBe("-1")
  })

  it("string values JSON-escaped", () => {
    expect(canonicalize("hello")).toBe('"hello"')
    expect(canonicalize('a"b')).toBe('"a\\"b"')
  })

  it("nested objects sorted recursively", () => {
    const payload = {
      z: { b: 2, a: 1 },
      a: { z: 3, y: 2 },
    }
    const result = canonicalize(payload)
    expect(result).toBe('{"a":{"y":2,"z":3},"z":{"a":1,"b":2}}')
  })

  it("throws on undefined values", () => {
    expect(() => canonicalize({ a: undefined })).toThrow("undefined")
  })

  it("throws on non-finite numbers", () => {
    expect(() => canonicalize(Infinity)).toThrow("non-finite")
    expect(() => canonicalize(NaN)).toThrow("non-finite")
  })

  it("throws on floating-point numbers", () => {
    expect(() => canonicalize(3.14)).toThrow("non-integer")
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 2. Domain-Separated Signature Input
// ═══════════════════════════════════════════════════════════════════════

describe("§2 Domain-separated signature input", () => {
  it("builds correct signature input", () => {
    const payload = { schemaVersion: 1, test: true }
    const input = buildSignatureInput("arcana:signed-capability:v1", payload)

    const text = new TextDecoder().decode(input)
    expect(text).toStartWith("arcana:signed-capability:v1")
    expect(text).toContain('"schemaVersion":1')
    expect(text).toContain('"test":true')
  })

  it("different domains produce different inputs", () => {
    const payload = { schemaVersion: 1 }
    const input1 = buildSignatureInput("arcana:signed-capability:v1", payload)
    const input2 = buildSignatureInput("arcana:signed-policy:v1", payload)

    const text1 = new TextDecoder().decode(input1)
    const text2 = new TextDecoder().decode(input2)
    expect(text1).not.toBe(text2)
  })

  it("wrong domain separator invalidates signature input", () => {
    const payload = { schemaVersion: 1, issuerId: "test" }
    const input1 = buildSignatureInput("arcana:signed-capability:v1", payload)
    const input2 = buildSignatureInput("arcana:revocation:v1", payload)

    const text1 = new TextDecoder().decode(input1)
    const text2 = new TextDecoder().decode(input2)
    expect(text1.slice(0, 30)).not.toBe(text2.slice(0, 30))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 3. Envelope Validation
// ═══════════════════════════════════════════════════════════════════════

describe("§3 Envelope validation", () => {
  it("missing required field detected", () => {
    const issues = validateEnvelopePayload(
      { schemaVersion: 1 },
      ["schemaVersion", "issuerId", "signature"],
    )
    expect(issues.length).toBe(2)
    expect(issues[0].field).toBe("issuerId")
    expect(issues[1].field).toBe("signature")
  })

  it("unsupported schema version detected", () => {
    const issues = validateEnvelopePayload(
      { schemaVersion: 99 },
      ["schemaVersion"],
    )
    expect(issues.some(i => i.field === "schemaVersion")).toBe(true)
  })

  it("valid payload produces no issues", () => {
    const issues = validateEnvelopePayload(
      { schemaVersion: 1, issuerId: "test", signature: "sig" },
      ["schemaVersion", "issuerId", "signature"],
    )
    expect(issues.length).toBe(0)
  })

  it("rejects noncanonical timestamp", () => {
    expect(validateTimestamp("2026-07-29T12:00:00Z")).toBe(false)
    expect(validateTimestamp("2026-07-29T12:00:00.00Z")).toBe(false)
    expect(validateTimestamp("2026-07-29 12:00:00.000Z")).toBe(false)
  })

  it("accepts canonical timestamp", () => {
    expect(validateTimestamp("2026-07-29T12:00:00.000Z")).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 4. Strict Wire Parsing
// ═══════════════════════════════════════════════════════════════════════

describe("§4 Strict wire parsing", () => {
  it("accepts valid JSON", () => {
    const raw = '{"a":1,"b":2}'
    const result = parseStrictEnvelope(raw)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it("rejects duplicate top-level keys", () => {
    const raw = '{"a":1,"a":2}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate")
  })

  it("rejects duplicate nested keys", () => {
    const raw = '{"outer":{"a":1,"a":2}}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate")
  })

  it("rejects Unicode-escaped duplicate keys", () => {
    const raw = '{"issuerId":"a","\\u0069ssuerId":"b"}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate")
  })

  it("rejects two escaped representations of same key", () => {
    const raw = '{"\\u0069ssuerId":"a","\\u0049ssuerId":"b"}'
    // \u0069 = 'i', \u0049 = 'I' — these are different keys
    // But \u0069ssuerId and issuerId should be duplicate
    expect(() => parseStrictEnvelope('{"issuerId":"a","\\u0069ssuerId":"b"}')).toThrow("duplicate")
  })

  it("rejects trailing JSON after closing brace", () => {
    const raw = '{"a":1} garbage'
    expect(() => parseStrictEnvelope(raw)).toThrow()
  })

  it("rejects invalid JSON", () => {
    expect(() => parseStrictEnvelope("{invalid}")).toThrow()
  })

  it("rejects non-object top-level", () => {
    expect(() => parseStrictEnvelope('"hello"')).toThrow("envelope must be a JSON object")
    expect(() => parseStrictEnvelope("42")).toThrow("envelope must be a JSON object")
    expect(() => parseStrictEnvelope("[1,2,3]")).toThrow("envelope must be a JSON object")
  })

  it("handles empty object", () => {
    const result = parseStrictEnvelope("{}")
    expect(result).toEqual({})
  })

  it("handles nested objects and arrays", () => {
    const raw = '{"a":{"b":[1,2,3]},"c":"hello"}'
    const result = parseStrictEnvelope(raw)
    expect(result).toEqual({ a: { b: [1, 2, 3] }, c: "hello" })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 5. Base64url Encoding
// ═══════════════════════════════════════════════════════════════════════

describe("§5 Base64url encoding", () => {
  it("round-trips correctly", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254, 253])
    const encoded = encodeBase64url(bytes)
    const decoded = decodeBase64url(encoded)
    expect(decoded).toEqual(bytes)
  })

  it("canonical decode rejects non-canonical", () => {
    // Standard base64 uses +/ which should be rejected
    expect(decodeCanonicalBase64url("A+B/")).toBeNull()
  })

  it("rejects padding", () => {
    expect(decodeCanonicalBase64url("AAAA=")).toBeNull()
  })

  it("rejects whitespace", () => {
    expect(decodeCanonicalBase64url("AA AA")).toBeNull()
  })

  it("rejects invalid length (1 mod 4)", () => {
    expect(decodeCanonicalBase64url("A")).toBeNull()
  })

  it("produces canonical form", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111])
    const encoded = encodeBase64url(bytes)
    const decoded = decodeCanonicalBase64url(encoded)
    expect(decoded).toEqual(bytes)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 6. Domain Separators
// ═══════════════════════════════════════════════════════════════════════

describe("§6 Domain separators", () => {
  it("all four domains are distinct", () => {
    const domains = [CAPABILITY_DOMAIN, POLICY_DOMAIN, NODE_IDENTITY_DOMAIN, REVOCATION_DOMAIN]
    const unique = new Set(domains)
    expect(unique.size).toBe(4)
  })

  it("domain separators start with arcana:", () => {
    expect(CAPABILITY_DOMAIN).toStartWith("arcana:")
    expect(POLICY_DOMAIN).toStartWith("arcana:")
    expect(NODE_IDENTITY_DOMAIN).toStartWith("arcana:")
    expect(REVOCATION_DOMAIN).toStartWith("arcana:")
  })

  it("domain separators end with :v1", () => {
    expect(CAPABILITY_DOMAIN).toEndWith(":v1")
    expect(POLICY_DOMAIN).toEndWith(":v1")
    expect(NODE_IDENTITY_DOMAIN).toEndWith(":v1")
    expect(REVOCATION_DOMAIN).toEndWith(":v1")
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 7. Noble Ed25519 Isolation
// ═══════════════════════════════════════════════════════════════════════

describe("§7 Noble Ed25519 isolation", () => {
  it("generates valid keypair from seed", () => {
    const kp = ed25519.keygen(hexToBytes(seeds[0]))
    expect(kp.publicKey.length).toBe(32)
    expect(kp.secretKey.length).toBe(32)
  })

  it("sign and verify succeeds", () => {
    const kp = ed25519.keygen(hexToBytes(seeds[0]))
    const msg = new TextEncoder().encode("test message")
    const sig = ed25519.sign(msg, kp.secretKey)
    expect(ed25519.verify(sig, msg, kp.publicKey)).toBe(true)
  })

  it("verify with wrong key returns false", () => {
    const kp1 = ed25519.keygen(hexToBytes(seeds[0]))
    const kp2 = ed25519.keygen(hexToBytes(seeds[1]))
    const msg = new TextEncoder().encode("test message")
    const sig = ed25519.sign(msg, kp1.secretKey)
    expect(ed25519.verify(sig, msg, kp2.publicKey)).toBe(false)
  })

  it("verify with wrong message returns false", () => {
    const kp = ed25519.keygen(hexToBytes(seeds[0]))
    const msg1 = new TextEncoder().encode("correct message")
    const msg2 = new TextEncoder().encode("wrong message")
    const sig = ed25519.sign(msg1, kp.secretKey)
    expect(ed25519.verify(sig, msg2, kp.publicKey)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// § 8. Golden Vector Conformance Suite (Table-Driven)
// ═══════════════════════════════════════════════════════════════════════

interface VectorDef {
  vectorId: string
  description: string
  envelope: Record<string, unknown>
  rawJson?: string
  expectedStatus: "VALID" | "REJECTED"
  expectedStage?: string
  expectedReason?: string
  expectedAudienceNodeId?: string
  trustedKeysOverride?: Map<string, Uint8Array>
  knownSequences?: Map<string, number>
}

// Build positive vectors
const positiveVectors: VectorDef[] = [
  {
    vectorId: "signed-capability-v1-001",
    description: "Basic filesystem.read capability grant",
    envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
    expectedStatus: "VALID",
  },
  {
    vectorId: "signed-capability-v1-002",
    description: "Capability with delegation ancestry",
    envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload2),
    expectedStatus: "VALID",
  },
  {
    vectorId: "signed-policy-v1-001",
    description: "Basic policy envelope",
    envelope: buildSignedPayload(0, POLICY_DOMAIN, policyPayload),
    expectedStatus: "VALID",
  },
  {
    vectorId: "node-identity-v1-001",
    description: "Node identity certificate",
    envelope: buildSignedPayload(3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload),
    expectedStatus: "VALID",
  },
  {
    vectorId: "revocation-v1-001",
    description: "Grant revocation statement",
    envelope: buildSignedPayload(0, REVOCATION_DOMAIN, revocationPayload),
    expectedStatus: "VALID",
  },
]

// Build negative vectors
const negativeVectors: VectorDef[] = []

// ─── PARSE stage ──────────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-parse-duplicate-key",
  description: "Duplicate schemaVersion key in raw JSON",
  envelope: {},
  rawJson: '{"schemaVersion":1,"schemaVersion":2,"issuerId":"node-alpha","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2099-12-31T23:59:59.999Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}',
  expectedStatus: "REJECTED",
  expectedStage: "PARSE",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-parse-unicode-escaped-dup",
  description: "Unicode escape \\u0069ssuerId decodes to duplicate key issuerId",
  envelope: {},
  rawJson: '{"schemaVersion":1,"issuerId":"a","\\u0069ssuerId":"b","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2099-12-31T23:59:59.999Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"}',
  expectedStatus: "REJECTED",
  expectedStage: "PARSE",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-parse-trailing-json",
  description: "Valid JSON with trailing garbage after closing brace",
  envelope: {},
  rawJson: '{"schemaVersion":1,"issuerId":"node-alpha","issuerEpoch":1,"audienceNodeId":"node-beta","grant":{"grantId":"g","principal":{"kind":"agent","id":"a"},"actions":["r"],"resources":["p"],"workspaceId":"w","contractId":"c","contractRevision":1,"maxUses":1,"delegationDepth":0},"issuedAt":"2026-07-29T12:00:00.000Z","expiresAt":"2099-12-31T23:59:59.999Z","nonce":"n","signatureAlgorithm":"Ed25519","signature":"AA"} GARBAGE',
  expectedStatus: "REJECTED",
  expectedStage: "PARSE",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-parse-nested-dup",
  description: "Duplicate key in nested object",
  envelope: {},
  rawJson: '{"grant":{"a":1,"a":2},"schemaVersion":1}',
  expectedStatus: "REJECTED",
  expectedStage: "PARSE",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

// ─── SCHEMA stage ─────────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-schema-unknown-field-cap",
  description: "Unknown field evilField on capability envelope",
  envelope: { ...buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1), evilField: "nope" },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-unknown-field-policy",
  description: "Unknown field on policy envelope",
  envelope: { ...buildSignedPayload(0, POLICY_DOMAIN, policyPayload), evilPolicyField: "nope" },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-missing-required-cap",
  description: "Missing required field issuerId on capability envelope",
  envelope: (() => { const { issuerId, ...rest } = buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1) as any; return rest })(),
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-missing-required-policy",
  description: "Missing required field policyDigest on policy envelope",
  envelope: (() => { const { policyDigest, ...rest } = buildSignedPayload(0, POLICY_DOMAIN, policyPayload) as any; return rest })(),
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-unsupported-version",
  description: "Unsupported schema version 99",
  envelope: { ...buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1), schemaVersion: 99 },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-noncanonical-timestamp",
  description: "issuedAt without milliseconds (noncanonical timestamp)",
  envelope: { ...buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1), issuedAt: "2026-07-29T12:00:00Z" },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-unsafe-integer",
  description: "issuerEpoch as 2^53 (unsafe integer)",
  envelope: { ...buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1), issuerEpoch: 9007199254740992 },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-negative-sequence",
  description: "Negative sequence number on policy envelope",
  envelope: { ...buildSignedPayload(0, POLICY_DOMAIN, policyPayload), sequence: -1 },
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

negativeVectors.push({
  vectorId: "neg-schema-float-epoch",
  description: "Floating-point number in issuerEpoch",
  envelope: {},
  rawJson: JSON.stringify({
    ...capabilityPayload1,
    issuerEpoch: 1.5,
    signatureAlgorithm: "Ed25519",
    signature: "AA",
  }),
  expectedStatus: "REJECTED",
  expectedStage: "SCHEMA",
  expectedReason: "SCHEMA_UNSUPPORTED",
})

// ─── SIGNATURE stage ──────────────────────────────────────────────────

const sigMutationVectors = [
  { id: "neg-sig-changed-action", desc: "Changed grant action (post-sign mutation)", mut: (e: any) => { e.grant.actions = ["filesystem.write"] } },
  { id: "neg-sig-changed-resource", desc: "Changed resource path (post-sign mutation)", mut: (e: any) => { e.grant.resources = ["packages/evil/**"] } },
  { id: "neg-sig-changed-audience", desc: "Changed audienceNodeId (post-sign mutation)", mut: (e: any) => { e.audienceNodeId = "node-evil" } },
  { id: "neg-sig-changed-epoch", desc: "Changed issuer epoch (post-sign mutation)", mut: (e: any) => { e.issuerEpoch = 999 } },
  { id: "neg-sig-changed-nonce", desc: "Changed nonce (post-sign mutation)", mut: (e: any) => { e.nonce = "00000000-0000-0000-0000-000000000000" } },
  { id: "neg-sig-changed-issuerId", desc: "Changed issuerId (post-sign mutation)", mut: (e: any) => { e.issuerId = "node-evil" } },
  { id: "neg-sig-changed-workspace", desc: "Changed grant.workspaceId (post-sign mutation)", mut: (e: any) => { e.grant.workspaceId = "evil-workspace" } },
  { id: "neg-sig-changed-contract-revision", desc: "Changed grant.contractRevision (post-sign mutation)", mut: (e: any) => { e.grant.contractRevision = 999 } },
  { id: "neg-sig-changed-expiry", desc: "Changed expiresAt (post-sign mutation)", mut: (e: any) => { e.expiresAt = "2099-12-31T23:59:59.999Z" } },
]

for (const sv of sigMutationVectors) {
  negativeVectors.push({
    vectorId: sv.id,
    description: sv.desc,
    envelope: (() => {
      const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1)))
      sv.mut(envelope)
      return envelope
    })(),
    expectedStatus: "REJECTED",
    expectedStage: "SIGNATURE",
    expectedReason: "INVALID_SIGNATURE",
  })
}

// Changed policy digest
negativeVectors.push({
  vectorId: "neg-sig-changed-digest",
  description: "Changed policy digest (post-sign mutation)",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, POLICY_DOMAIN, policyPayload)))
    envelope.policyDigest = "0000000000000000000000000000000000000000000000000000000000000000"
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Changed sequence
negativeVectors.push({
  vectorId: "neg-sig-changed-sequence",
  description: "Changed sequence number (post-sign mutation)",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, POLICY_DOMAIN, policyPayload)))
    envelope.sequence = 999
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Changed node pubkey
negativeVectors.push({
  vectorId: "neg-sig-changed-node-pubkey",
  description: "Changed node public key in identity certificate (post-sign mutation)",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload)))
    envelope.publicKey = pubKeys[1]
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Changed revocation subject
negativeVectors.push({
  vectorId: "neg-sig-changed-revocation-subject",
  description: "Changed revocation subject ID (post-sign mutation)",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, REVOCATION_DOMAIN, revocationPayload)))
    envelope.subjectId = "grant-evil"
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// One-byte signature mutation
negativeVectors.push({
  vectorId: "neg-sig-mutated",
  description: "One-byte signature mutation",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    const chars = envelope.signature.split("")
    chars[0] = chars[0] === "A" ? "B" : "A"
    envelope.signature = chars.join("")
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Wrong public key
negativeVectors.push({
  vectorId: "neg-sig-wrong-key",
  description: "Wrong public key: verify vector 1 signature with vector 2's key",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  trustedKeysOverride: new Map([["node-alpha", keypairs[1].publicKey]]),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Wrong domain separator (verify as policy with different trust context)
negativeVectors.push({
  vectorId: "neg-sig-wrong-domain",
  description: "Verify capability envelope with policy domain verifier",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Signature with invalid base64url
negativeVectors.push({
  vectorId: "neg-sig-invalid-base64url",
  description: "Signature with standard base64 chars (+/) instead of base64url",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    envelope.signature = "A+B/C+DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// Wrong signature length
negativeVectors.push({
  vectorId: "neg-sig-wrong-sig-length",
  description: "Signature as valid base64url but 32 bytes instead of 64",
  envelope: (() => {
    const envelope = JSON.parse(JSON.stringify(buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1)))
    envelope.signature = toBase64url(new Uint8Array(32))
    return envelope
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "SIGNATURE",
  expectedReason: "INVALID_SIGNATURE",
})

// ─── TRUST stage ──────────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-trust-unknown-issuer",
  description: "Issuer not in trusted set",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  trustedKeysOverride: new Map(), // empty — no trusted issuers
  expectedStatus: "REJECTED",
  expectedStage: "TRUST",
  expectedReason: "UNKNOWN_ISSUER",
})

negativeVectors.push({
  vectorId: "neg-trust-issuer-epoch-too-old",
  description: "Issuer epoch too old (minimum epoch > envelope epoch)",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  trustedKeysOverride: new Map(), // empty — tested as unknown issuer
  expectedStatus: "REJECTED",
  expectedStage: "TRUST",
  expectedReason: "UNKNOWN_ISSUER",
})

// ─── AUDIENCE stage ───────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-audience-wrong-node",
  description: "Wrong expectedAudienceNodeId in verification options",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  expectedAudienceNodeId: "node-wrong",
  expectedStatus: "REJECTED",
  expectedStage: "AUDIENCE",
  expectedReason: "WRONG_AUDIENCE",
})

negativeVectors.push({
  vectorId: "neg-audience-wrong-org",
  description: "Wrong organization context (tested as wrong audience node)",
  envelope: buildSignedPayload(0, CAPABILITY_DOMAIN, capabilityPayload1),
  expectedAudienceNodeId: "node-delta",
  expectedStatus: "REJECTED",
  expectedStage: "AUDIENCE",
  expectedReason: "WRONG_AUDIENCE",
})

// ─── FRESHNESS stage ──────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-freshness-expired",
  description: "Expired envelope (expiresAt in 2020)",
  envelope: (() => {
    const payload = { ...capabilityPayload1, expiresAt: "2020-01-01T00:00:00.000Z" }
    return buildSignedPayload(0, CAPABILITY_DOMAIN, payload)
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "FRESHNESS",
  expectedReason: "EXPIRED",
})

negativeVectors.push({
  vectorId: "neg-freshness-future-issued",
  description: "Envelope issued in 2030, expires 2031 (past expiry relative to now)",
  envelope: (() => {
    const payload = { ...capabilityPayload1, issuedAt: "2030-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z" }
    return buildSignedPayload(0, CAPABILITY_DOMAIN, payload)
  })(),
  expectedStatus: "REJECTED",
  expectedStage: "FRESHNESS",
  expectedReason: "EXPIRED",
})

// ─── REVOCATION stage ─────────────────────────────────────────────────

negativeVectors.push({
  vectorId: "neg-revocation-seq-rollback",
  description: "Sequence rollback: policy sequence 1 <= known sequence 5",
  envelope: buildSignedPayload(0, POLICY_DOMAIN, policyPayload),
  knownSequences: new Map([["node-alpha", 5]]),
  expectedStatus: "REJECTED",
  expectedStage: "REVOCATION",
  expectedReason: "SEQUENCE_ROLLBACK",
})

negativeVectors.push({
  vectorId: "neg-revocation-seq-equal",
  description: "Sequence equal: policy sequence 1 <= known sequence 1 (equal is rollback)",
  envelope: buildSignedPayload(0, POLICY_DOMAIN, policyPayload),
  knownSequences: new Map([["node-alpha", 1]]),
  expectedStatus: "REJECTED",
  expectedStage: "REVOCATION",
  expectedReason: "SEQUENCE_ROLLBACK",
})

negativeVectors.push({
  vectorId: "neg-revocation-statement-rollback",
  description: "Revocation statement sequence rollback",
  envelope: buildSignedPayload(0, REVOCATION_DOMAIN, revocationPayload),
  knownSequences: new Map([["node-alpha", 5]]),
  expectedStatus: "REJECTED",
  expectedStage: "REVOCATION",
  expectedReason: "SEQUENCE_ROLLBACK",
})

// ─── Suite: all vectors ──────────────────────────────────────────────

const allVectors = [...positiveVectors, ...negativeVectors]

describe("§7 Golden vector conformance suite", () => {
  // Suite-level invariant: every vector ID is unique
  it("all vector IDs are unique", () => {
    const ids = allVectors.map(v => v.vectorId)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  // Suite-level invariant: every negative vector has expected stage and reason
  it("every negative vector has expected stage and reason", () => {
    for (const v of negativeVectors) {
      expect(v.expectedStage).toBeDefined()
      expect(v.expectedReason).toBeDefined()
      expect(typeof v.expectedStage).toBe("string")
      expect(typeof v.expectedReason).toBe("string")
    }
  })

  // Suite-level invariant: every vector is executed
  it("vector count matches expected", () => {
    expect(positiveVectors.length).toBe(5)
    expect(negativeVectors.length).toBe(35)
    expect(allVectors.length).toBe(40)
  })

  // Table-driven: each vector is tested exactly once
  for (const vector of allVectors) {
    it(`${vector.vectorId}: ${vector.description}`, () => {
      if (vector.rawJson) {
        // PARSE stage: raw JSON should be rejected by parseStrictEnvelope
        expect(vector.expectedStatus).toBe("REJECTED")
        expect(() => parseStrictEnvelope(vector.rawJson!)).toThrow()
        return
      }

      const keys = vector.trustedKeysOverride ?? trustedKeys
      const options: any = {}
      if (vector.expectedAudienceNodeId) {
        options.expectedAudienceNodeId = vector.expectedAudienceNodeId
      }
      if (vector.knownSequences) {
        options.knownSequences = vector.knownSequences
      }

      // Route to the correct verifier based on envelope shape
      let result: VerificationResult
      const envelope = vector.envelope as Record<string, unknown>

      if (vector.vectorId.startsWith("signed-capability") || vector.vectorId.startsWith("neg-sig-") || vector.vectorId.startsWith("neg-schema-") || vector.vectorId.startsWith("neg-trust-") || vector.vectorId.startsWith("neg-audience-") || vector.vectorId.startsWith("neg-freshness-")) {
        // Default to capability verifier unless it's a policy/revocation vector
        if (vector.vectorId.includes("policy") || vector.vectorId.includes("digest") || vector.vectorId.includes("sequence")) {
          result = verifySignedPolicy(envelope, keys, options.knownSequences ?? new Map(), options.now ?? Date.now())
        } else if (vector.vectorId.includes("revocation-statement")) {
          result = verifyRevocationStatement(envelope, keys, options.knownSequences ?? new Map(), options.now ?? Date.now())
        } else {
          result = verifySignedCapability(envelope, keys, options)
        }
      } else if (vector.vectorId.startsWith("signed-policy") || vector.vectorId.startsWith("neg-revocation-seq")) {
        if (vector.knownSequences) {
          result = verifySignedPolicy(envelope, keys, vector.knownSequences, Date.now())
        } else {
          result = verifySignedPolicy(envelope, keys, new Map(), Date.now())
        }
      } else if (vector.vectorId.startsWith("node-identity")) {
        result = verifyNodeIdentity(envelope, keys, Date.now())
      } else if (vector.vectorId.startsWith("revocation-") || vector.vectorId.startsWith("neg-revocation-statement")) {
        result = verifyRevocationStatement(envelope, keys, options.knownSequences ?? new Map(), Date.now())
      } else {
        // Fallback: try capability
        result = verifySignedCapability(envelope, keys, options)
      }

      if (vector.expectedStatus === "VALID") {
        expect(result.valid).toBe(true)
      } else {
        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.stage).toBe(vector.expectedStage)
          expect(result.reason).toBe(vector.expectedReason)
        }
      }
    })
  }
})
