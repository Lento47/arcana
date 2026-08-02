/**
 * Phase D-3: Pure Verification (hardened)
 *
 * Layered verification of signed envelopes without accessing networks or databases.
 *
 * Stages:
 *   1. PARSE      — strict JSON parse, duplicate-key rejection
 *   2. SCHEMA     — required fields, schema version, field types
 *   3. SIGNATURE  — Ed25519 cryptographic verification
 *   4. TRUST      — issuer in trusted set
 *   5. AUDIENCE   — envelope targets this node
 *   6. FRESHNESS  — not expired
 *   7. REVOCATION — sequence rollback check (policy/revocation only)
 */

import {
  canonicalize,
  buildSignatureInput,
  validateEnvelopePayload,
  validateTimestamp,
  decodeCanonicalBase64url,
  validateSafeInteger,
  type SignatureDomain,
} from "./canonical-serializer"
import {
  CAPABILITY_DOMAIN,
  CAPABILITY_REQUIRED_FIELDS,
  POLICY_DOMAIN,
  POLICY_REQUIRED_FIELDS,
  NODE_IDENTITY_DOMAIN,
  NODE_IDENTITY_REQUIRED_FIELDS,
  REVOCATION_DOMAIN,
  REVOCATION_REQUIRED_FIELDS,
  type RejectionReason,
} from "./signed-envelopes"
import { ed25519 } from "@noble/curves/ed25519.js"

// ─── Named Ed25519 Wrapper ───────────────────────────────────────────

function verifyEd25519Signature(input: {
  signature: Uint8Array
  message: Uint8Array
  publicKey: Uint8Array
}): boolean {
  return ed25519.verify(input.signature, input.message, input.publicKey)
}

// ─── Verification Result ─────────────────────────────────────────────

export type VerificationStage =
  | "PARSE"
  | "SCHEMA"
  | "SIGNATURE"
  | "TRUST"
  | "AUDIENCE"
  | "FRESHNESS"
  | "REVOCATION"

export type VerificationResult =
  | { valid: true }
  | { valid: false; stage: VerificationStage; reason: RejectionReason; detail: string }

// ─── Strict Wire Parsing ─────────────────────────────────────────────

/**
 * Parse raw JSON bytes with duplicate-key rejection.
 * Standard JSON.parse silently keeps the last duplicate key.
 * This function scans the raw text for duplicate object keys before parsing.
 *
 * @throws Error if duplicate keys are found or JSON is invalid
 */
export function parseStrictEnvelope(raw: string): Record<string, unknown> {
  // Scan for duplicate keys in the raw JSON before parsing
  detectDuplicateKeys(raw)
  const parsed = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("envelope must be a JSON object")
  }
  return parsed as Record<string, unknown>
}

/**
 * Scan raw JSON text for duplicate object keys at any nesting level.
 * Keys are compared after JSON escape decoding (Unicode escapes are resolved).
 */
function detectDuplicateKeys(raw: string): void {
  const stack: Array<{ keys: Set<string>; inObject: boolean }> = []
  let i = 0
  const len = raw.length

  while (i < len) {
    const ch = raw[i]
    if (ch === '"') {
      // Read and decode the string (handles \uXXXX, \", \\, etc.)
      i++
      let decoded = ""
      while (i < len && raw[i] !== '"') {
        if (raw[i] === "\\") {
          i++
          if (i >= len) throw new Error("unterminated escape sequence")
          const esc = raw[i]
          switch (esc) {
            case '"': decoded += '"'; i++; break
            case "\\": decoded += "\\"; i++; break
            case "/": decoded += "/"; i++; break
            case "b": decoded += "\b"; i++; break
            case "f": decoded += "\f"; i++; break
            case "n": decoded += "\n"; i++; break
            case "r": decoded += "\r"; i++; break
            case "t": decoded += "\t"; i++; break
            case "u": {
              i++
              if (i + 4 > len) throw new Error("incomplete unicode escape")
              const hex = raw.slice(i, i + 4)
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                throw new Error(`invalid unicode escape: \\u${hex}`)
              }
              decoded += String.fromCharCode(parseInt(hex, 16))
              i += 4
              break
            }
            default:
              throw new Error(`invalid escape sequence: \\${esc}`)
          }
        } else {
          decoded += raw[i]
          i++
        }
      }
      i++ // skip closing "

      // Check if this is a key (followed by :)
      let j = i
      while (j < len && (raw[j] === " " || raw[j] === "\t" || raw[j] === "\n" || raw[j] === "\r")) j++
      if (j < len && raw[j] === ":" && stack.length > 0) {
        const top = stack[stack.length - 1]!
        if (top.inObject) {
          if (top.keys.has(decoded)) {
            throw new Error(`duplicate JSON key: "${decoded}"`)
          }
          top.keys.add(decoded)
        }
      }
    } else if (ch === "{") {
      stack.push({ keys: new Set(), inObject: true })
      i++
    } else if (ch === "}") {
      stack.pop()
      i++
    } else if (ch === "[") {
      stack.push({ keys: new Set(), inObject: false })
      i++
    } else if (ch === "]") {
      stack.pop()
      i++
    } else {
      i++
    }
  }
}

// ─── Allowed Fields Per Envelope Type ────────────────────────────────

const CAPABILITY_ALLOWED_FIELDS = new Set([
  "schemaVersion", "issuerId", "issuerEpoch", "audienceNodeId",
  "grant", "issuedAt", "expiresAt", "nonce",
  "signatureAlgorithm", "signature",
])

const POLICY_ALLOWED_FIELDS = new Set([
  "schemaVersion", "issuerId", "issuerEpoch", "sequence",
  "policyId", "policyVersion", "policyDigest", "previousPolicyDigest",
  "issuedAt", "expiresAt", "signatureAlgorithm", "signature",
])

const NODE_IDENTITY_ALLOWED_FIELDS = new Set([
  "schemaVersion", "nodeId", "organizationId", "publicKey",
  "issuerId", "issuerEpoch", "issuedAt", "expiresAt",
  "capabilities", "signatureAlgorithm", "signature",
])

const REVOCATION_ALLOWED_FIELDS = new Set([
  "schemaVersion", "issuerId", "issuerEpoch", "sequence",
  "subjectType", "subjectId", "reason", "effectiveAt",
  "issuedAt", "signatureAlgorithm", "signature",
])

function getAllowedFields(domain: SignatureDomain): Set<string> {
  switch (domain) {
    case CAPABILITY_DOMAIN: return CAPABILITY_ALLOWED_FIELDS
    case POLICY_DOMAIN: return POLICY_ALLOWED_FIELDS
    case NODE_IDENTITY_DOMAIN: return NODE_IDENTITY_ALLOWED_FIELDS
    case REVOCATION_DOMAIN: return REVOCATION_ALLOWED_FIELDS
  }
  // Unreachable: all domain cases covered, but TS needs explicit return
  throw new Error(`unknown domain: ${domain as string}`)
}

// ─── Layered Verification ────────────────────────────────────────────

/**
 * Layer 1+2: Schema validation (fields, types, unknown fields).
 */
function validateEnvelopeSchema(
  envelope: Record<string, unknown>,
  domain: SignatureDomain,
  requiredFields: string[],
): VerificationResult {
  // Schema version
  if (envelope.schemaVersion !== 1) {
    return {
      valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
      detail: `schemaVersion: ${envelope.schemaVersion}`,
    }
  }

  // Required fields
  const issues = validateEnvelopePayload(envelope, requiredFields)
  if (issues.length > 0) {
    return {
      valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
      detail: issues.map((i: { field: string; message: string }) => `${i.field}: ${i.message}`).join("; "),
    }
  }

  // Unknown fields
  const allowed = getAllowedFields(domain)
  for (const key of Object.keys(envelope)) {
    if (!allowed.has(key)) {
      return {
        valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
        detail: `unknown field: ${key}`,
      }
    }
  }

  // Timestamp format
  const issuedAt = envelope.issuedAt as string
  if (!validateTimestamp(issuedAt)) {
    return {
      valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
      detail: "issuedAt must be UTC RFC 3339 with milliseconds",
    }
  }

  // expiresAt is optional (revocation statements use effectiveAt instead)
  const expiresAt = envelope.expiresAt as string | undefined
  if (expiresAt !== undefined && !validateTimestamp(expiresAt)) {
    return {
      valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
      detail: "expiresAt must be UTC RFC 3339 with milliseconds",
    }
  }

  // effectiveAt is optional (revocation statements)
  const effectiveAt = envelope.effectiveAt as string | undefined
  if (effectiveAt !== undefined && !validateTimestamp(effectiveAt)) {
    return {
      valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
      detail: "effectiveAt must be UTC RFC 3339 with milliseconds",
    }
  }

  // Safe integer validation for numeric fields
  const numericFields = ["issuerEpoch", "sequence", "contractRevision", "maxUses", "delegationDepth"]
  for (const field of numericFields) {
    const value = envelope[field]
    if (value !== undefined && typeof value === "number") {
      if (!validateSafeInteger(value)) {
        return {
          valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
          detail: `field ${field} must be a safe integer, got: ${value}`,
        }
      }
    }
  }

  // Check nested grant object if present
  const grant = envelope.grant as Record<string, unknown> | undefined
  if (grant) {
    for (const field of ["contractRevision", "maxUses", "delegationDepth"]) {
      const value = grant[field]
      if (value !== undefined && typeof value === "number") {
        if (!validateSafeInteger(value)) {
          return {
            valid: false, stage: "SCHEMA", reason: "SCHEMA_UNSUPPORTED",
            detail: `grant.${field} must be a safe integer, got: ${value}`,
          }
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Layer 3: Ed25519 signature verification.
 */
function verifyEnvelopeSignature(
  envelope: Record<string, unknown>,
  domain: SignatureDomain,
  publicKey: Uint8Array,
): VerificationResult {
  const signature = envelope.signature as string
  if (!signature) {
    return {
      valid: false, stage: "SIGNATURE", reason: "INVALID_SIGNATURE",
      detail: "missing signature field",
    }
  }

  const signatureBytes = decodeCanonicalBase64url(signature)
  if (!signatureBytes || signatureBytes.length !== 64) {
    return {
      valid: false, stage: "SIGNATURE", reason: "INVALID_SIGNATURE",
      detail: `signature must be 64 bytes base64url, got ${signatureBytes?.length ?? 0} bytes`,
    }
  }

  // Public key must be 32 bytes
  if (publicKey.length !== 32) {
    return {
      valid: false, stage: "SIGNATURE", reason: "INVALID_SIGNATURE",
      detail: `public key must be 32 bytes, got ${publicKey.length} bytes`,
    }
  }

  // Build unsigned payload (remove signature and signatureAlgorithm)
  const { signature: _, signatureAlgorithm: __, ...unsignedPayload } = envelope as any
  const signatureInput = buildSignatureInput(domain, unsignedPayload)

  // Verify Ed25519 signature
  const validSig = verifyEd25519Signature({ signature: signatureBytes, message: signatureInput, publicKey })
  if (!validSig) {
    return {
      valid: false, stage: "SIGNATURE", reason: "INVALID_SIGNATURE",
      detail: "Ed25519 signature verification failed",
    }
  }

  return { valid: true }
}

/**
 * Layer 4: Issuer trust check.
 */
function verifyIssuerTrust(
  envelope: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
): VerificationResult {
  const issuerId = envelope.issuerId as string
  const publicKey = trustedIssuerPublicKeys.get(issuerId)
  if (!publicKey) {
    return {
      valid: false, stage: "TRUST", reason: "UNKNOWN_ISSUER",
      detail: `issuer ${issuerId} not in trusted set`,
    }
  }
  return { valid: true }
}

/**
 * Layer 5: Audience check (capability envelopes only).
 */
function verifyAudience(
  envelope: Record<string, unknown>,
  expectedAudience: string | undefined,
): VerificationResult {
  if (expectedAudience === undefined) return { valid: true }
  const audienceNodeId = envelope.audienceNodeId as string
  if (audienceNodeId !== expectedAudience) {
    return {
      valid: false, stage: "AUDIENCE", reason: "WRONG_AUDIENCE",
      detail: `audience ${audienceNodeId} does not match expected ${expectedAudience}`,
    }
  }
  return { valid: true }
}

/**
 * Layer 6: Freshness check.
 */
function verifyFreshness(
  envelope: Record<string, unknown>,
  now: number,
): VerificationResult {
  const expiresAt = envelope.expiresAt as string | undefined
  if (expiresAt) {
    const expiresAtMs = new Date(expiresAt).getTime()
    if (now > expiresAtMs) {
      return {
        valid: false, stage: "FRESHNESS", reason: "EXPIRED",
        detail: `expired at ${expiresAt}`,
      }
    }
  }
  // Clock-skew tolerance: envelopes issued more than 5 minutes in the future
  // are rejected (mirrors the sync transport's freshness rule). This applies
  // to every envelope kind, including revocation statements that have no
  // expiresAt: a future-dated revocation must fail closed.
  const issuedAt = envelope.issuedAt as string | undefined
  if (issuedAt) {
    const issuedAtMs = new Date(issuedAt).getTime()
    if (issuedAtMs > now + 5 * 60 * 1000) {
      return {
        valid: false, stage: "FRESHNESS", reason: "EXPIRED",
        detail: `issuedAt ${issuedAt} is more than 5 minutes in the future`,
      }
    }
  }
  return { valid: true }
}

/**
 * Layer 7: Revocation/sequence rollback check.
 */
function verifyRevocationStatus(
  envelope: Record<string, unknown>,
  knownSequences: Map<string, number>,
): VerificationResult {
  const issuerId = envelope.issuerId as string
  const sequence = envelope.sequence as number | undefined
  if (sequence === undefined) return { valid: true }

  const knownSeq = knownSequences.get(issuerId)
  if (knownSeq !== undefined && sequence <= knownSeq) {
    return {
      valid: false, stage: "REVOCATION", reason: "SEQUENCE_ROLLBACK",
      detail: `sequence ${sequence} <= known ${knownSeq}`,
    }
  }
  return { valid: true }
}

// ─── Full Envelope Verification ──────────────────────────────────────

function verifyEnvelope(
  envelope: Record<string, unknown>,
  domain: SignatureDomain,
  requiredFields: string[],
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  options: { now?: number; expectedAudienceNodeId?: string; knownSequences?: Map<string, number> } = {},
): VerificationResult {
  const now = options.now ?? Date.now()

  // Layer 2: Schema
  const schema = validateEnvelopeSchema(envelope, domain, requiredFields)
  if (!schema.valid) return schema

  // Layer 4: Trust (needed before signature to get public key)
  const trust = verifyIssuerTrust(envelope, trustedIssuerPublicKeys)
  if (!trust.valid) return trust

  // Layer 3: Signature
  const issuerId = envelope.issuerId as string
  const publicKey = trustedIssuerPublicKeys.get(issuerId)!
  const sig = verifyEnvelopeSignature(envelope, domain, publicKey)
  if (!sig.valid) return sig

  // Layer 5: Audience
  const audience = verifyAudience(envelope, options.expectedAudienceNodeId)
  if (!audience.valid) return audience

  // Layer 6: Freshness
  const freshness = verifyFreshness(envelope, now)
  if (!freshness.valid) return freshness

  // Layer 7: Revocation
  if (options.knownSequences) {
    const revocation = verifyRevocationStatus(envelope, options.knownSequences)
    if (!revocation.valid) return revocation
  }

  return { valid: true }
}

// ─── Public Verifiers ────────────────────────────────────────────────

/**
 * Verify a signed capability envelope.
 * Pure function: no network, no database.
 */
export function verifySignedCapability(
  envelope: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  options?: { now?: number; expectedAudienceNodeId?: string },
): VerificationResult {
  return verifyEnvelope(
    envelope,
    CAPABILITY_DOMAIN,
    CAPABILITY_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    options,
  )
}

/**
 * Verify a signed policy envelope.
 * Pure function: no network, no database.
 */
export function verifySignedPolicy(
  envelope: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  knownSequences: Map<string, number>,
  now: number = Date.now(),
): VerificationResult {
  return verifyEnvelope(
    envelope,
    POLICY_DOMAIN,
    POLICY_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    { now, knownSequences },
  )
}

/**
 * Verify a node identity certificate.
 * Pure function: no network, no database.
 */
export function verifyNodeIdentity(
  certificate: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  now: number = Date.now(),
): VerificationResult {
  return verifyEnvelope(
    certificate,
    NODE_IDENTITY_DOMAIN,
    NODE_IDENTITY_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    { now },
  )
}

/**
 * Verify a revocation statement.
 * Pure function: no network, no database.
 */
export function verifyRevocationStatement(
  statement: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  knownSequences: Map<string, number>,
  now: number = Date.now(),
): VerificationResult {
  return verifyEnvelope(
    statement,
    REVOCATION_DOMAIN,
    REVOCATION_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    { now, knownSequences },
  )
}

// ─── Re-export layers for independent testing ────────────────────────

export {
  validateEnvelopeSchema,
  verifyEnvelopeSignature,
  verifyIssuerTrust,
  verifyAudience,
  verifyFreshness,
  verifyRevocationStatus,
}
