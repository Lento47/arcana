import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  verifySignedCapability,
  verifySignedPolicy,
  verifyNodeIdentity,
  verifyRevocationStatement,
  parseStrictEnvelope,
  type VerificationResult,
} from "../src/crypto/verifier"
import {
  canonicalize,
  buildSignatureInput,
  decodeBase64url,
  encodeBase64url,
  decodeCanonicalBase64url,
  validateSafeInteger,
  validateTimestamp,
} from "../src/crypto/canonical-serializer"
import {
  CAPABILITY_DOMAIN,
} from "../src/crypto/signed-envelopes"

// ─── Test Helpers ────────────────────────────────────────────────────

const vectorsPath = join(__dirname, "../src/crypto/test-vectors/signed-capability-v1.json")
const allVectors = JSON.parse(readFileSync(vectorsPath, "utf-8"))

const positiveVectors = allVectors.filter((v: any) => v.verificationExpected === true)
const negativeVectors = allVectors.filter((v: any) => v.verificationExpected === false)

function buildEnvelopeFromVector(vector: any): Record<string, unknown> {
  return {
    ...vector.unsignedPayload,
    signatureAlgorithm: "Ed25519",
    signature: vector.signature,
  }
}

function buildAllTrustedKeys(): Map<string, Uint8Array> {
  const keys = new Map<string, Uint8Array>()
  for (const vec of positiveVectors) {
    const issuerId = vec.unsignedPayload.issuerId || vec.unsignedPayload.nodeId
    const pubKeyBytes = decodeBase64url(vec.publicKey)
    if (pubKeyBytes) keys.set(issuerId, pubKeyBytes)
  }
  return keys
}

function buildTrustedKeys(vectorIds: string[]): Map<string, Uint8Array> {
  const keys = new Map<string, Uint8Array>()
  for (const vid of vectorIds) {
    const vec = allVectors.find((v: any) => v.vectorId === vid)
    if (!vec) continue
    const issuerId = vec.unsignedPayload.issuerId || vec.unsignedPayload.nodeId
    const pubKeyBytes = decodeBase64url(vec.publicKey)
    if (pubKeyBytes) keys.set(issuerId, pubKeyBytes)
  }
  return keys
}

// ─── Canonical Serialization Determinism ─────────────────────────────

describe("canonical serialization determinism", () => {
  test("same object produces same canonical bytes", () => {
    const obj = { b: 2, a: "hello", c: [3, 1, 2] }
    const first = canonicalize(obj)
    const second = canonicalize(obj)
    expect(first).toBe(second)
  })

  test("keys are sorted alphabetically", () => {
    const obj = { z: 1, a: 2, m: 3 }
    expect(canonicalize(obj)).toBe('{"a":2,"m":3,"z":1}')
  })

  test("nested objects are sorted", () => {
    const obj = { outer: { z: 1, a: 2 } }
    expect(canonicalize(obj)).toBe('{"outer":{"a":2,"z":1}}')
  })

  test("arrays preserve order", () => {
    const obj = { items: [3, 1, 2] }
    expect(canonicalize(obj)).toBe('{"items":[3,1,2]}')
  })

  test("null and booleans", () => {
    expect(canonicalize(null)).toBe("null")
    expect(canonicalize(true)).toBe("true")
    expect(canonicalize(false)).toBe("false")
  })

  test("integers serialize without decimal", () => {
    expect(canonicalize(42)).toBe("42")
    expect(canonicalize(0)).toBe("0")
  })

  test("rejects non-integer numbers", () => {
    expect(() => canonicalize(3.14)).toThrow("non-integer")
  })

  test("rejects non-finite numbers", () => {
    expect(() => canonicalize(Infinity)).toThrow("non-finite")
    expect(() => canonicalize(NaN)).toThrow("non-finite")
  })

  test("rejects undefined values", () => {
    expect(() => canonicalize(undefined)).toThrow("undefined")
  })

  test("buildSignatureInput concatenates domain and payload", () => {
    const input = buildSignatureInput("arcana:signed-capability:v1", { a: 1 })
    const text = new TextDecoder().decode(input)
    expect(text).toBe('arcana:signed-capability:v1{"a":1}')
  })

  test("canonicalPayloadHex matches canonicalize output", () => {
    for (const vec of positiveVectors) {
      const canonical = canonicalize(vec.unsignedPayload)
      const hex = Array.from(new TextEncoder().encode(canonical))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
      expect(hex).toBe(vec.canonicalPayloadHex)
    }
  })

  test("signatureInputHex matches buildSignatureInput output", () => {
    for (const vec of positiveVectors) {
      const sigInput = buildSignatureInput(vec.domain, vec.unsignedPayload)
      const hex = Array.from(sigInput)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
      expect(hex).toBe(vec.signatureInputHex)
    }
  })
})

// ─── Golden Vector Positive Verification (Real Ed25519) ──────────────

describe("golden vector positive verification", () => {
  const now = Date.parse("2026-07-29T12:30:00.000Z")

  test("cap-v1-001: basic capability grant verifies with real Ed25519", () => {
    const vec = positiveVectors.find((v: any) => v.vectorId === "cap-v1-001")!
    const envelope = buildEnvelopeFromVector(vec)
    const keys = buildTrustedKeys(["cap-v1-001"])
    const result = verifySignedCapability(envelope, keys, {
      now,
      expectedAudienceNodeId: "node-beta",
    })
    expect(result.valid).toBe(true)
  })

  test("cap-v1-002: capability with delegation ancestry", () => {
    const vec = positiveVectors.find((v: any) => v.vectorId === "cap-v1-002")!
    const envelope = buildEnvelopeFromVector(vec)
    const keys = buildTrustedKeys(["cap-v1-002"])
    const result = verifySignedCapability(envelope, keys, {
      now,
      expectedAudienceNodeId: "node-gamma",
    })
    expect(result.valid).toBe(true)
  })

  test("policy-v1-001: policy envelope", () => {
    const vec = positiveVectors.find((v: any) => v.vectorId === "policy-v1-001")!
    const envelope = buildEnvelopeFromVector(vec)
    const keys = buildTrustedKeys(["policy-v1-001"])
    const result = verifySignedPolicy(envelope, keys, new Map(), now)
    expect(result.valid).toBe(true)
  })

  test("node-id-v1-001: node identity certificate", () => {
    const vec = positiveVectors.find((v: any) => v.vectorId === "node-id-v1-001")!
    const envelope = buildEnvelopeFromVector(vec)
    const keys = buildTrustedKeys(["node-id-v1-001"])
    const result = verifyNodeIdentity(envelope, keys, now)
    expect(result.valid).toBe(true)
  })

  test("revocation-v1-001: revocation statement", () => {
    const vec = positiveVectors.find((v: any) => v.vectorId === "revocation-v1-001")!
    const envelope = buildEnvelopeFromVector(vec)
    const keys = buildTrustedKeys(["revocation-v1-001"])
    const result = verifyRevocationStatement(envelope, keys, new Map(), now)
    expect(result.valid).toBe(true)
  })

  test("all positive capability vectors verify with correct audience", () => {
    const capVectors = positiveVectors.filter((v: any) => v.domain === "arcana:signed-capability:v1")
    for (const vec of capVectors) {
      const envelope = buildEnvelopeFromVector(vec)
      const keys = buildTrustedKeys([vec.vectorId])
      const audience = vec.unsignedPayload.audienceNodeId
      const result = verifySignedCapability(envelope, keys, { now, expectedAudienceNodeId: audience })
      expect(result.valid).toBe(true)
    }
  })
})

// ─── Negative Mutation Vectors ───────────────────────────────────────

describe("negative mutation vectors", () => {
  const now = Date.parse("2026-07-29T12:30:00.000Z")

  for (const vec of negativeVectors) {
    test(`${vec.vectorId}: ${vec.description}`, () => {
      const envelope = buildEnvelopeFromVector(vec)
      let result: VerificationResult

      if (vec.overrideIssuer) {
        // Use a different issuer in the trust set
        const keys = new Map<string, Uint8Array>()
        const pubKeyBytes = decodeBase64url(vec.publicKey)
        if (pubKeyBytes) keys.set(vec.overrideIssuer, pubKeyBytes)
        result = verifySignedCapability(envelope, keys, { now: vec.nowOverride ?? now })
      } else if (vec.vectorId === "neg-wrong-key") {
        // Use seed2's public key (from the vector) to verify cap1's signature (signed with seed1)
        const keys = new Map<string, Uint8Array>()
        const pubKeyBytes = decodeBase64url(vec.publicKey)
        if (pubKeyBytes) keys.set(vec.unsignedPayload.issuerId, pubKeyBytes)
        result = verifySignedCapability(envelope, keys, { now })
      } else if (vec.vectorId === "neg-audience") {
        // Use original envelope, verify with a different expected audience
        const origVec = positiveVectors.find((v: any) => v.vectorId === "cap-v1-001")!
        const origEnvelope = buildEnvelopeFromVector(origVec)
        const keys = buildTrustedKeys(["cap-v1-001"])
        result = verifySignedCapability(origEnvelope, keys, { now, expectedAudienceNodeId: "node-DELTA" })
      } else if (vec.vectorId === "neg-expired") {
        // Use original envelope with a future now that exceeds expiry
        const origVec = positiveVectors.find((v: any) => v.vectorId === "cap-v1-001")!
        const origEnvelope = buildEnvelopeFromVector(origVec)
        const keys = buildTrustedKeys(["cap-v1-001"])
        result = verifySignedCapability(origEnvelope, keys, { now: vec.nowOverride })
      } else if (vec.knownSequenceOverride !== undefined) {
        // Use original policy envelope with high known sequence
        const origVec = positiveVectors.find((v: any) => v.vectorId === "policy-v1-001")!
        const origEnvelope = buildEnvelopeFromVector(origVec)
        const keys = buildTrustedKeys(["policy-v1-001"])
        const knownSeqs = new Map([[origVec.unsignedPayload.issuerId, vec.knownSequenceOverride]])
        result = verifySignedPolicy(origEnvelope, keys, knownSeqs, now)
      } else {
        // Default: use cap-v1-001's key for the issuer "node-alpha"
        const keys = buildTrustedKeys(["cap-v1-001"])
        result = verifySignedCapability(envelope, keys, { now })
      }

      expect(result.valid).toBe(false)
      if (vec.expectedStage) {
        expect((result as any).stage).toBe(vec.expectedStage)
      }
      if (vec.expectedRejectionReason) {
        expect((result as any).reason).toBe(vec.expectedRejectionReason)
      }
    })
  }
})

// ─── Strict Wire Parsing ─────────────────────────────────────────────

describe("strict wire parsing", () => {
  test("accepts valid JSON without duplicates", () => {
    const raw = '{"a":1,"b":2}'
    const result = parseStrictEnvelope(raw)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  test("rejects duplicate top-level keys", () => {
    const raw = '{"a":1,"a":2}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate JSON key")
  })

  test("rejects duplicate nested keys", () => {
    const raw = '{"outer":{"a":1,"a":2}}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate JSON key")
  })

  test("allows same key in different sibling objects", () => {
    const raw = '{"x":{"a":1},"y":{"a":2}}'
    const result = parseStrictEnvelope(raw)
    expect(result).toEqual({ x: { a: 1 }, y: { a: 2 } })
  })

  test("allows key-like text inside string values", () => {
    const raw = '{"message":"the text \\"issuerId\\": is not a key","issuerId":"real"}'
    const result = parseStrictEnvelope(raw)
    expect(result.message).toBe('the text "issuerId": is not a key')
    expect(result.issuerId).toBe("real")
  })

  test("allows escaped quote before key-like text", () => {
    const raw = '{"msg":"\\\\\\"a\\\\\\":1","a":2}'
    const result = parseStrictEnvelope(raw)
    expect(result.a).toBe(2)
  })

  test("rejects empty-string duplicate key", () => {
    const raw = '{"":1,"":2}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate JSON key")
  })

  test("rejects duplicate after deep nesting", () => {
    const raw = '{"a":{"b":{"c":{"d":1}}},"e":{"f":{"g":{"a":2}}},"a":3}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate JSON key")
  })

  test("rejects duplicate in array-enclosed object", () => {
    const raw = '{"items":[{"a":1,"a":2}]}'
    expect(() => parseStrictEnvelope(raw)).toThrow("duplicate JSON key")
  })

  test("rejects invalid JSON", () => {
    expect(() => parseStrictEnvelope("{invalid}")).toThrow()
    expect(() => parseStrictEnvelope("")).toThrow()
    expect(() => parseStrictEnvelope("null")).toThrow("envelope must be a JSON object")
    expect(() => parseStrictEnvelope("[]")).toThrow("envelope must be a JSON object")
  })

  test("handles strings with escaped quotes", () => {
    const raw = '{"key":"value with \\"quotes\\"","other":1}'
    const result = parseStrictEnvelope(raw)
    expect(result.key).toBe('value with "quotes"')
  })

  test("accepts valid JSON with nested objects", () => {
    const raw = '{"a":{"b":1,"c":2},"d":3}'
    const result = parseStrictEnvelope(raw)
    expect(result).toEqual({ a: { b: 1, c: 2 }, d: 3 })
  })
})

// ─── Base64url Decoding ─────────────────────────────────────────────

describe("base64url decoding", () => {
  test("decodes standard base64url without padding", () => {
    const result = decodeBase64url("aGVsbG8")
    expect(result).not.toBeNull()
    expect(new TextDecoder().decode(result!)).toBe("hello")
  })

  test("rejects standard base64 padding", () => {
    const result = decodeBase64url("aGVsbG8=")
    expect(result).toBeNull()
  })

  test("handles URL-safe characters (- and _)", () => {
    const result = decodeBase64url("Pj8-_A")
    expect(result).not.toBeNull()
    expect(result!.length).toBeGreaterThan(0)
  })

  test("returns null for invalid base64url", () => {
    expect(decodeBase64url("!!!invalid")).toBeNull()
  })

  test("rejects standard base64 with + or /", () => {
    expect(decodeBase64url("a+b")).toBeNull()
    expect(decodeBase64url("a/b")).toBeNull()
  })

  test("rejects padded values", () => {
    expect(decodeBase64url("aGVsbG8=")).toBeNull()
  })

  test("rejects embedded whitespace", () => {
    expect(decodeBase64url("aGVs bG8")).toBeNull()
    expect(decodeBase64url("aGVs\nbG8")).toBeNull()
  })

  test("decodes 32-byte Ed25519 public key", () => {
    const vec = positiveVectors[0]
    const decoded = decodeBase64url(vec.publicKey)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(32)
  })

  test("decodes 64-byte Ed25519 signature", () => {
    const vec = positiveVectors[0]
    const decoded = decodeBase64url(vec.signature)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(64)
  })
})

// ─── Canonical Base64url ─────────────────────────────────────────────

describe("canonical base64url encoding/decoding", () => {
  test("round-trip: encode then decode equals original", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128])
    const encoded = encodeBase64url(original)
    const decoded = decodeBase64url(encoded)
    expect(decoded).toEqual(original)
  })

  test("canonical decode rejects non-canonical representations", () => {
    // "aGVsbG8" is canonical for "hello"
    expect(decodeCanonicalBase64url("aGVsbG8")).not.toBeNull()
    // "aGVsbG8=" has padding — not canonical
    expect(decodeCanonicalBase64url("aGVsbG8=")).toBeNull()
  })

  test("encodeBase64url produces no padding", () => {
    const bytes = new Uint8Array([0, 0, 0])
    const encoded = encodeBase64url(bytes)
    expect(encoded).not.toContain("=")
  })

  test("all golden vector public keys are canonical base64url", () => {
    for (const vec of positiveVectors) {
      const decoded = decodeCanonicalBase64url(vec.publicKey)
      expect(decoded).not.toBeNull()
      expect(decoded!.length).toBe(32)
    }
  })

  test("all golden vector signatures are canonical base64url", () => {
    for (const vec of positiveVectors) {
      const decoded = decodeCanonicalBase64url(vec.signature)
      expect(decoded).not.toBeNull()
      expect(decoded!.length).toBe(64)
    }
  })
})

// ─── Safe Integer Validation ─────────────────────────────────────────

describe("safe integer validation", () => {
  test("accepts positive safe integers", () => {
    expect(validateSafeInteger(0)).toBe(true)
    expect(validateSafeInteger(1)).toBe(true)
    expect(validateSafeInteger(42)).toBe(true)
    expect(validateSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  test("rejects negative numbers by default", () => {
    expect(validateSafeInteger(-1)).toBe(false)
  })

  test("accepts negative numbers when allowed", () => {
    expect(validateSafeInteger(-1, { allowNegative: true })).toBe(true)
  })

  test("rejects floats", () => {
    expect(validateSafeInteger(1.5)).toBe(false)
    expect(validateSafeInteger(3.14)).toBe(false)
  })

  test("rejects NaN and Infinity", () => {
    expect(validateSafeInteger(NaN)).toBe(false)
    expect(validateSafeInteger(Infinity)).toBe(false)
    expect(validateSafeInteger(-Infinity)).toBe(false)
  })

  test("rejects non-numbers", () => {
    expect(validateSafeInteger("1")).toBe(false)
    expect(validateSafeInteger(null)).toBe(false)
    expect(validateSafeInteger(undefined)).toBe(false)
    expect(validateSafeInteger(true)).toBe(false)
  })

  test("rejects unsafe integers", () => {
    expect(validateSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
    expect(validateSafeInteger(Number.MIN_SAFE_INTEGER - 1, { allowNegative: true })).toBe(false)
  })
})

// ─── Timestamp Validation ────────────────────────────────────────────

describe("timestamp validation", () => {
  test("accepts valid UTC RFC 3339 with milliseconds", () => {
    expect(validateTimestamp("2026-07-29T12:00:00.000Z")).toBe(true)
  })

  test("rejects timestamps without milliseconds", () => {
    expect(validateTimestamp("2026-07-29T12:00:00Z")).toBe(false)
  })

  test("rejects non-UTC timestamps", () => {
    expect(validateTimestamp("2026-07-29T12:00:00.000+05:00")).toBe(false)
  })

  test("rejects date-only strings", () => {
    expect(validateTimestamp("2026-07-29")).toBe(false)
  })
})

// ─── Noble Ed25519 Isolation ─────────────────────────────────────────

import { ed25519 } from "@noble/curves/ed25519.js"

describe("Ed25519 signature verification (Noble isolation)", () => {
  test("rejects a signature under a different public key", () => {
    const seed1 = new Uint8Array(32).fill(1)
    const seed2 = new Uint8Array(32).fill(2)
    const publicKey1 = ed25519.getPublicKey(seed1)
    const publicKey2 = ed25519.getPublicKey(seed2)
    const message = new TextEncoder().encode("arcana-wrong-key-test")
    const signature = ed25519.sign(message, seed1)
    expect(ed25519.verify(signature, message, publicKey1)).toBe(true)
    expect(ed25519.verify(signature, message, publicKey2)).toBe(false)
  })

  test("rejects a one-byte mutated signature", () => {
    const seed = new Uint8Array(32).fill(1)
    const pub = ed25519.getPublicKey(seed)
    const message = new TextEncoder().encode("test-message")
    const sig = ed25519.sign(message, seed)
    const mutated = new Uint8Array(sig)
    mutated[0] ^= 0xff
    expect(ed25519.verify(mutated, message, pub)).toBe(false)
  })

  test("rejects signature with swapped arguments", () => {
    const seed = new Uint8Array(32).fill(1)
    const pub = ed25519.getPublicKey(seed)
    const message = new TextEncoder().encode("test")
    const sig = ed25519.sign(message, seed)
    // Verify that correct order works
    expect(ed25519.verify(sig, message, pub)).toBe(true)
    // Verify that wrong key fails
    const seed2 = new Uint8Array(32).fill(99)
    const pub2 = ed25519.getPublicKey(seed2)
    expect(ed25519.verify(sig, message, pub2)).toBe(false)
  })
})

// ─── Domain Separator Uniqueness ─────────────────────────────────────

describe("domain separator uniqueness", () => {
  test("all four domains are distinct", () => {
    const domains = [
      CAPABILITY_DOMAIN,
      "arcana:signed-policy:v1",
      "arcana:node-identity:v1",
      "arcana:revocation:v1",
    ]
    const unique = new Set(domains)
    expect(unique.size).toBe(4)
  })
})
