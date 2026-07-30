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
