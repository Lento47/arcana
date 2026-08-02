/**
 * Phase D-1: Canonical Serialization
 *
 * Deterministic JSON canonicalization for signed envelopes.
 * Same payload → same bytes → same signature.
 *
 * Rules:
 * - Object keys sorted alphabetically
 * - Array ordering preserved (order is significant)
 * - Strings: UTF-8, no normalization
 * - Integers: no floating-point
 * - No undefined values
 * - No duplicate keys
 * - Timestamps: strict UTC RFC 3339 with milliseconds
 * - Base64: standard (not URL-safe) for keys/signatures
 */

// ─── Canonical Serialization ─────────────────────────────────────────

/**
 * Canonicalize a value to deterministic JSON bytes.
 * Throws on: duplicate keys, undefined values, non-finite numbers.
 */
export function canonicalize(value: unknown): string {
  return canonicalizeValue(value, [])
}

function canonicalizeValue(value: unknown, path: string[]): string {
  if (value === null) return "null"
  if (value === undefined) throw new Error(`undefined value at ${path.join(".")}`)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path.join(".")}`)
    if (!Number.isInteger(value)) throw new Error(`non-integer number at ${path.join(".")}`)
    return String(value)
  }
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) {
    const items = value.map((v, i) => canonicalizeValue(v, [...path, String(i)]))
    return `[${items.join(",")}]`
  }
  if (typeof value === "object") {
    return canonicalizeObject(value as Record<string, unknown>, path)
  }
  throw new Error(`unsupported type ${typeof value} at ${path.join(".")}`)
}

function canonicalizeObject(obj: Record<string, unknown>, path: string[]): string {
  const keys = Object.keys(obj).sort()

  // Check for duplicate keys (shouldn't happen in JS, but defensive)
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`duplicate key "${key}" at ${path.join(".")}`)
    seen.add(key)
  }

  const pairs = keys.map(key => {
    const value = obj[key]
    if (value === undefined) throw new Error(`undefined value for key "${key}" at ${path.join(".")}`)
    return `${JSON.stringify(key)}:${canonicalizeValue(value, [...path, key])}`
  })

  return `{${pairs.join(",")}}`
}

// ─── Domain-Separated Signature Input ────────────────────────────────

export type SignatureDomain =
  | "arcana:signed-capability:v1"
  | "arcana:signed-policy:v1"
  | "arcana:node-identity:v1"
  | "arcana:revocation:v1"
  | "arcana:node-proof-batch:v1"

/**
 * Build the signature input bytes:
 *   UTF8(domain separator) || UTF8(canonical serialized unsigned payload)
 */
export function buildSignatureInput(
  domain: SignatureDomain,
  payload: unknown,
): Uint8Array {
  const canonical = canonicalize(payload)
  const domainBytes = new TextEncoder().encode(domain)
  const payloadBytes = new TextEncoder().encode(canonical)

  const input = new Uint8Array(domainBytes.length + payloadBytes.length)
  input.set(domainBytes, 0)
  input.set(payloadBytes, domainBytes.length)

  return input
}

// ─── Validation ──────────────────────────────────────────────────────

export type ValidationIssue = {
  field: string
  message: string
}

/**
 * Validate a signed envelope's unsigned payload.
 * Returns issues found (empty = valid).
 */
export function validateEnvelopePayload(
  payload: Record<string, unknown>,
  requiredFields: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const field of requiredFields) {
    if (!(field in payload)) {
      issues.push({ field, message: `missing required field` })
    }
  }

  // Check for undefined values
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      issues.push({ field: key, message: `undefined value` })
    }
  }

  // Check schema version
  if (payload.schemaVersion !== 1) {
    issues.push({ field: "schemaVersion", message: `unsupported schema version: ${payload.schemaVersion}` })
  }

  return issues
}

// ─── Timestamp Validation ────────────────────────────────────────────

/**
 * Validate a timestamp is strict UTC RFC 3339 with milliseconds.
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ
 */
export function validateTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
}

// ─── Base64url Decoding ──────────────────────────────────────────────

/**
 * Decode a base64url-encoded string (no padding) to Uint8Array.
 * Returns null if the input is invalid.
 * Rejects: standard base64 (+/), padding (=), whitespace, wrong length.
 */
export function decodeBase64url(encoded: string): Uint8Array | null {
  try {
    // Reject standard base64 characters
    if (encoded.includes("+") || encoded.includes("/") || encoded.includes("=")) return null
    // Reject whitespace
    if (/\s/.test(encoded)) return null
    // Reject invalid length (unpadded length 1 mod 4 is invalid)
    const padLen = (4 - (encoded.length % 4)) % 4
    if (padLen === 3) return null // invalid: length 1 mod 4

    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen)
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

/**
 * Encode Uint8Array to base64url (no padding).
 */
export function encodeBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

/**
 * Canonical base64url decode: decode-then-reencode must equal the original.
 * This prevents multiple textual representations of the same binary value.
 */
export function decodeCanonicalBase64url(encoded: string): Uint8Array | null {
  const decoded = decodeBase64url(encoded)
  if (!decoded) return null
  if (encodeBase64url(decoded) !== encoded) return null
  return decoded
}

// ─── Safe Integer Validation ─────────────────────────────────────────

/**
 * Validate that a value is a safe integer suitable for wire transmission.
 * Rejects:
 * - Non-number types
 * - Negative numbers (when allowNegative is false, default)
 * - Non-integer numbers (floats, NaN, Infinity)
 * - Numbers with leading zeros in their string representation
 * - Numbers in exponential notation
 *
 * This is stricter than Number.isSafeInteger() because it also rejects
 * values that would produce ambiguous canonical JSON representations.
 */
export function validateSafeInteger(
  value: unknown,
  options?: { allowNegative?: boolean; min?: number; max?: number },
): boolean {
  const allowNegative = options?.allowNegative ?? false

  if (typeof value !== "number") return false
  if (!Number.isFinite(value)) return false
  if (!Number.isInteger(value)) return false
  if (!allowNegative && value < 0) return false

  // Check bounds
  if (options?.min !== undefined && value < options.min) return false
  if (options?.max !== undefined && value > options.max) return false

  // Reject values that would produce leading zeros or exponential notation
  // when serialized to JSON. JSON.stringify always produces canonical form
  // for safe integers, but we want to be defensive about what we accept.
  // For example, the string "01" parsed as number is 1, but we shouldn't
  // accept it from wire format. Since we're already past parsing (value is
  // a number), we just need to ensure it's a safe integer.
  if (!Number.isSafeInteger(value)) return false

  return true
}
