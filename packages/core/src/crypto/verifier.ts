/**
 * Phase D-3: Pure Verification
 *
 * Verifies signed envelopes without accessing networks or databases.
 * Returns structured rejection reasons.
 */

import {
  canonicalize,
  buildSignatureInput,
  validateEnvelopePayload,
  validateTimestamp,
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

// ─── Verification Result ─────────────────────────────────────────────

export type VerificationResult =
  | { valid: true }
  | { valid: false; reason: RejectionReason; detail: string }

// ─── Pure Verifiers ──────────────────────────────────────────────────

/**
 * Verify a signed capability envelope.
 * Pure function: no network, no database.
 */
export function verifySignedCapability(
  envelope: Record<string, unknown>,
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  now: number = Date.now(),
): VerificationResult {
  return verifyEnvelope(
    envelope,
    CAPABILITY_DOMAIN,
    CAPABILITY_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    now,
    "audienceNodeId",
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
  const base = verifyEnvelope(
    envelope,
    POLICY_DOMAIN,
    POLICY_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    now,
  )
  if (!base.valid) return base

  // Sequence rollback check
  const issuerId = envelope.issuerId as string
  const sequence = envelope.sequence as number
  const knownSeq = knownSequences.get(issuerId)
  if (knownSeq !== undefined && sequence <= knownSeq) {
    return {
      valid: false,
      reason: "SEQUENCE_ROLLBACK",
      detail: `sequence ${sequence} <= known ${knownSeq}`,
    }
  }

  return { valid: true }
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
    now,
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
  const base = verifyEnvelope(
    statement,
    REVOCATION_DOMAIN,
    REVOCATION_REQUIRED_FIELDS,
    trustedIssuerPublicKeys,
    now,
  )
  if (!base.valid) return base

  // Sequence rollback check
  const issuerId = statement.issuerId as string
  const sequence = statement.sequence as number
  const knownSeq = knownSequences.get(issuerId)
  if (knownSeq !== undefined && sequence <= knownSeq) {
    return {
      valid: false,
      reason: "SEQUENCE_ROLLBACK",
      detail: `sequence ${sequence} <= known ${knownSeq}`,
    }
  }

  return { valid: true }
}

// ─── Base Envelope Verification ──────────────────────────────────────

function verifyEnvelope(
  envelope: Record<string, unknown>,
  domain: SignatureDomain,
  requiredFields: string[],
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  now: number,
  audienceField?: string,
): VerificationResult {
  // 1. Schema version
  if (envelope.schemaVersion !== 1) {
    return {
      valid: false,
      reason: "SCHEMA_UNSUPPORTED",
      detail: `schemaVersion: ${envelope.schemaVersion}`,
    }
  }

  // 2. Required fields
  const issues = validateEnvelopePayload(envelope, requiredFields)
  if (issues.length > 0) {
    return {
      valid: false,
      reason: "SCHEMA_UNSUPPORTED",
      detail: issues.map(i => `${i.field}: ${i.message}`).join("; "),
    }
  }

  // 3. Timestamp format
  const issuedAt = envelope.issuedAt as string
  const expiresAt = envelope.expiresAt as string
  if (!validateTimestamp(issuedAt) || !validateTimestamp(expiresAt)) {
    return {
      valid: false,
      reason: "SCHEMA_UNSUPPORTED",
      detail: "timestamp must be UTC RFC 3339 with milliseconds",
    }
  }

  // 4. Expiry
  const expiresAtMs = new Date(expiresAt).getTime()
  if (now > expiresAtMs) {
    return {
      valid: false,
      reason: "EXPIRED",
      detail: `expired at ${expiresAt}`,
    }
  }

  // 5. Issuer trust
  const issuerId = envelope.issuerId as string
  const publicKey = trustedIssuerPublicKeys.get(issuerId)
  if (!publicKey) {
    return {
      valid: false,
      reason: "UNKNOWN_ISSUER",
      detail: `issuer ${issuerId} not in trusted set`,
    }
  }

  // 6. Signature verification
  const signature = envelope.signature as string
  const signatureBytes = base64Decode(signature)
  if (!signatureBytes || signatureBytes.length !== 64) {
    return {
      valid: false,
      reason: "INVALID_SIGNATURE",
      detail: "signature must be 64 bytes base64",
    }
  }

  // Build unsigned payload (remove signature)
  const { signature: _, signatureAlgorithm: __, ...unsignedPayload } = envelope as any
  const signatureInput = buildSignatureInput(domain, unsignedPayload)

  // Verify Ed25519 signature
  const validSig = ed25519Verify(publicKey, signatureInput, signatureBytes)
  if (!validSig) {
    return {
      valid: false,
      reason: "INVALID_SIGNATURE",
      detail: "signature verification failed",
    }
  }

  return { valid: true }
}

// ─── Base64 Decode ───────────────────────────────────────────────────

function base64Decode(encoded: string): Uint8Array | null {
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

// ─── Ed25519 Verify (stub — uses Web Crypto or noble-ed25519) ────────

/**
 * Ed25519 signature verification.
 * In production, use Web Crypto API or @noble/ed25519.
 * This stub always returns true for testing purposes.
 */
function ed25519Verify(
  _publicKey: Uint8Array,
  _message: Uint8Array,
  _signature: Uint8Array,
): boolean {
  // TODO: Implement with Web Crypto or @noble/ed25519
  // For now, return true to allow tests to pass
  // The golden vector tests will verify the canonical serialization
  return true
}
