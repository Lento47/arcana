/**
 * E-9: Protocol Extension Registry (enforcement)
 *
 * Implements the extension-registry rules from
 * `.hermes/docs/arcana/docs/protocol/PROTOCOL-GOVERNANCE.md`:
 *
 *   - Optional extensions must be namespaced (`x-<vendor>-<name>`), documented
 *     in the schema registry, and never alter security semantics.
 *   - Unknown mandatory fields are rejected (strict schema).
 *
 * Conventions mirror the D-phase crypto code:
 *   - fail closed: anything unknown, malformed, or unverifiable is rejected
 *   - pure functions, no I/O, no network
 *   - explicit `{ valid: true } | { valid: false; reason: string }` results
 *
 * Enforcement points:
 *   - `crypto/verifier.ts` (schema layer) — every signed envelope domain
 *   - `crypto/policy-bundle-store.ts` (D-4 control-plane admission)
 */

import type { ValidationIssue } from "../crypto/canonical-serializer"

// ─── Extension Identifier ─────────────────────────────────────────────

/**
 * Namespaced extension identifier: `x-<vendor>-<name>`.
 * Vendor and name are lowercase `[a-z0-9]` words, optionally hyphenated.
 * The vendor is the first segment after `x-`; the name is the remainder,
 * so `x-arcana-proof-batch` parses as vendor `arcana`, name `proof-batch`.
 */
export const EXTENSION_IDENTIFIER_PATTERN = /^x-[a-z0-9]+(?:-[a-z0-9]+)+$/

export type ExtensionIdentifier = string

export type ParsedExtensionIdentifier = {
  identifier: string
  vendor: string
  name: string
}

export function parseExtensionIdentifier(value: unknown): ParsedExtensionIdentifier | null {
  if (typeof value !== "string") return null
  if (!EXTENSION_IDENTIFIER_PATTERN.test(value)) return null
  const rest = value.slice(2) // strip "x-"
  const dash = rest.indexOf("-")
  if (dash <= 0) return null
  const vendor = rest.slice(0, dash)
  const name = rest.slice(dash + 1)
  if (name.length === 0) return null
  return { identifier: value, vendor, name }
}

// ─── Registry ─────────────────────────────────────────────────────────

export type ExtensionLifecycleStatus = "EXPERIMENTAL" | "STABLE" | "FROZEN"

export type ExtensionRegistration = {
  identifier: string
  vendor: string
  name: string
  /** Documented name/purpose. Required by the governance doc. */
  description: string
  /** Explicit note on what the extension never alters. Required by the doc. */
  securitySemantics: string
  status: ExtensionLifecycleStatus
  sinceSchemaVersion: number
}

/** Vendors the runtime itself publishes under (`arcana:` signature domains). */
export const KNOWN_VENDORS: readonly string[] = ["arcana"]

/**
 * Built-in registry. Entries mirror extensions already present in the repo:
 *   - `x-arcana-session`  — approval-api.v1.yaml SessionRestrictionHeader,
 *     surfaced as `sessionRestriction` in authority-affordance.ts.
 *   - `x-arcana-contract` — OpenAPI metadata extension in approval-api.v1.yaml.
 * New extensions require a PR touching this registry (governance ownership).
 */
export const BUILTIN_EXTENSIONS: readonly ExtensionRegistration[] = [
  {
    identifier: "x-arcana-session",
    vendor: "arcana",
    name: "session",
    description: "Authenticated session restriction (approval-api.v1.yaml SessionRestrictionHeader).",
    securitySemantics:
      "Grants nothing; only restricts decision surfaces to the authenticated session. Never alters canonical serialization, signature input, authorization, approval, or revocation semantics.",
    status: "EXPERIMENTAL",
    sinceSchemaVersion: 1,
  },
  {
    identifier: "x-arcana-contract",
    vendor: "arcana",
    name: "contract",
    description: "Contract metadata extension for OpenAPI surfaces (approval-api.v1.yaml x-arcana-contract).",
    securitySemantics:
      "Documentation-only metadata with no runtime semantics. Never alters canonical serialization, signature input, authorization, approval, or revocation semantics.",
    status: "EXPERIMENTAL",
    sinceSchemaVersion: 1,
  },
]

export type ExtensionRegistry = ReadonlyMap<string, ExtensionRegistration>

export const DEFAULT_EXTENSION_REGISTRY: ExtensionRegistry = new Map(
  BUILTIN_EXTENSIONS.map((entry) => [entry.identifier, entry]),
)

export type ExtensionRegistryOptions = {
  registry?: ExtensionRegistry
  /** Accept identifiers from vendors outside the allowlist (format-only). */
  allowUnknownVendors?: boolean
  knownVendors?: readonly string[]
  /** Require the identifier to be registered (default: true). */
  requireRegistered?: boolean
}

// ─── Registry validation ──────────────────────────────────────────────

export type ExtensionRegistryIssue = {
  identifier: string
  message: string
}

/**
 * Validate a whole registry: every entry must parse, carry a documented
 * description and security-semantics note, come from a known vendor, and be
 * unique. Duplicate and conflicting names (same vendor+name, mismatched
 * vendor/name vs identifier) are rejected. Accepts a registry map or a raw
 * registration list (where duplicates are possible by construction).
 */
export function validateExtensionRegistry(
  registry: ExtensionRegistry | readonly ExtensionRegistration[],
  options: { allowUnknownVendors?: boolean; knownVendors?: readonly string[] } = {},
): ExtensionRegistryIssue[] {
  const knownVendors = options.knownVendors ?? KNOWN_VENDORS
  const issues: ExtensionRegistryIssue[] = []
  const seen = new Set<string>()
  const entries = registry instanceof Map ? [...registry.values()] : registry

  for (const entry of entries) {
    const parsed = parseExtensionIdentifier(entry.identifier)
    if (!parsed) {
      issues.push({
        identifier: entry.identifier,
        message: "malformed extension identifier (expected x-<vendor>-<name>, lowercase)",
      })
      continue
    }
    if (entry.vendor !== parsed.vendor || entry.name !== parsed.name) {
      issues.push({
        identifier: entry.identifier,
        message: `registration vendor/name (${entry.vendor}/${entry.name}) do not match the identifier`,
      })
    }
    if (!options.allowUnknownVendors && !knownVendors.includes(entry.vendor)) {
      issues.push({ identifier: entry.identifier, message: `unknown vendor: ${entry.vendor}` })
    }
    if (typeof entry.description !== "string" || entry.description.trim().length === 0) {
      issues.push({ identifier: entry.identifier, message: "missing documented description" })
    }
    if (typeof entry.securitySemantics !== "string" || entry.securitySemantics.trim().length === 0) {
      issues.push({ identifier: entry.identifier, message: "missing security-semantics note" })
    }
    if (
      entry.status !== "EXPERIMENTAL" &&
      entry.status !== "STABLE" &&
      entry.status !== "FROZEN"
    ) {
      issues.push({ identifier: entry.identifier, message: `invalid lifecycle status: ${entry.status}` })
    }
    if (typeof entry.sinceSchemaVersion !== "number" || !Number.isSafeInteger(entry.sinceSchemaVersion)) {
      issues.push({ identifier: entry.identifier, message: "sinceSchemaVersion must be a safe integer" })
    }
    if (seen.has(entry.identifier)) {
      issues.push({ identifier: entry.identifier, message: "duplicate registration" })
    }
    seen.add(entry.identifier)
  }
  return issues
}

// ─── Identifier validation ────────────────────────────────────────────

export type ExtensionValidationResult =
  | { valid: true; parsed: ParsedExtensionIdentifier }
  | { valid: false; reason: string }

/**
 * Validate one extension identifier: well-formed `x-<vendor>-<name>`,
 * vendor in the allowlist, and (by default) registered. Unknown vendors and
 * unregistered identifiers fail closed unless explicitly allowed.
 */
export function validateExtensionIdentifier(
  identifier: unknown,
  options: ExtensionRegistryOptions = {},
): ExtensionValidationResult {
  const parsed = parseExtensionIdentifier(identifier)
  if (!parsed) {
    return {
      valid: false,
      reason: `malformed extension identifier: ${JSON.stringify(identifier)} (expected x-<vendor>-<name>, lowercase)`,
    }
  }
  const knownVendors = options.knownVendors ?? KNOWN_VENDORS
  if (!options.allowUnknownVendors && !knownVendors.includes(parsed.vendor)) {
    return { valid: false, reason: `unknown extension vendor: ${parsed.vendor}` }
  }
  if (options.requireRegistered ?? true) {
    const registry = options.registry ?? DEFAULT_EXTENSION_REGISTRY
    if (!registry.has(parsed.identifier)) {
      return { valid: false, reason: `extension not registered: ${parsed.identifier}` }
    }
  }
  return { valid: true, parsed }
}

// ─── Extension declaration (strict schema) ────────────────────────────

export const EXTENSION_DECLARATION_REQUIRED_FIELDS = [
  "identifier",
  "description",
  "securitySemantics",
] as const

/**
 * Validate an extension declaration object. Mandatory fields must be present
 * and unknown fields are rejected (strict schema), so a mandatory-looking
 * field that is not part of the declaration schema cannot sneak in. The
 * declaration must parse as `x-<vendor>-<name>` and be registered.
 */
export function validateExtensionDeclaration(
  declaration: Record<string, unknown>,
  options: ExtensionRegistryOptions = {},
): ExtensionValidationResult {
  const schemaIssues = validateStrictSchema(
    declaration,
    EXTENSION_DECLARATION_REQUIRED_FIELDS,
    new Set<string>(EXTENSION_DECLARATION_REQUIRED_FIELDS),
  )
  if (schemaIssues.length > 0) {
    return {
      valid: false,
      reason: `extension declaration schema invalid: ${schemaIssues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join("; ")}`,
    }
  }

  const identifier = validateExtensionIdentifier(declaration.identifier, options)
  if (!identifier.valid) return identifier

  if (typeof declaration.description !== "string" || declaration.description.trim().length === 0) {
    return { valid: false, reason: "extension declaration missing documented description" }
  }
  if (
    typeof declaration.securitySemantics !== "string" ||
    declaration.securitySemantics.trim().length === 0
  ) {
    return { valid: false, reason: "extension declaration missing security-semantics note" }
  }
  return { valid: true, parsed: identifier.parsed }
}

// ─── Security semantics inspection ────────────────────────────────────

/**
 * Tokens that mark security-sensitive fields. Any extension payload key that
 * matches one of these (word-boundary, camelCase- and kebab-aware) is
 * rejected: extensions never alter security semantics. The list covers the
 * governance doc's named surfaces: canonical serialization, signature input,
 * authorization/approval fields, and revocation, plus authority identity
 * (issuer) and capability/grant artifacts.
 */
const SECURITY_SENSITIVE_TOKENS = [
  "signature",
  "signing",
  "canonical",
  "authorization",
  "authority",
  "approval",
  "approve",
  "deny",
  "revocation",
  "revoke",
  "revoked",
  "issuer",
  "epoch",
  "grant",
  "capability",
  "nonce",
  "token",
  "secret",
  "password",
] as const

const SECURITY_SENSITIVE_PATTERN = new RegExp(`\\b(?:${SECURITY_SENSITIVE_TOKENS.join("|")})\\b`, "i")

/** Mirrors DEFAULT_SYNC_LIMITS.maximumJsonDepth. */
const MAX_EXTENSION_INSPECTION_DEPTH = 16

export type ExtensionInspectionResult = { valid: true } | { valid: false; reason: string }

type WalkIssue = {
  kind: "SECURITY_SENSITIVE" | "UNSAFE_VALUE" | "DEPTH_EXCEEDED"
  path: string
  message: string
}

function walkExtensionValue(value: unknown, depth: number, maxDepth: number, path: string): WalkIssue | null {
  if (depth > maxDepth) {
    return { kind: "DEPTH_EXCEEDED", path, message: `nesting exceeds limit ${maxDepth}` }
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : { kind: "UNSAFE_VALUE", path, message: "non-finite number" }
  }
  if (typeof value === "undefined") {
    return { kind: "UNSAFE_VALUE", path, message: "undefined value" }
  }
  if (typeof value !== "object") {
    return { kind: "UNSAFE_VALUE", path, message: `unsupported type ${typeof value}` }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const issue = walkExtensionValue(value[i], depth + 1, maxDepth, `${path}[${i}]`)
      if (issue) return issue
    }
    return null
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keyMatchesSensitiveToken(key)) {
      return { kind: "SECURITY_SENSITIVE", path: `${path}.${key}`, message: "security-sensitive field" }
    }
    const issue = walkExtensionValue(entry, depth + 1, maxDepth, `${path}.${key}`)
    if (issue) return issue
  }
  return null
}

function keyMatchesSensitiveToken(key: string): boolean {
  if (SECURITY_SENSITIVE_PATTERN.test(key)) return true
  // camelCase keys ("revocationStatement") need a boundary before capitals.
  const camelSplit = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  return camelSplit !== key.toLowerCase() && SECURITY_SENSITIVE_PATTERN.test(camelSplit)
}

/**
 * Inspect an extension payload/flag set. Fails closed if the value touches a
 * security-sensitive field at any depth, carries a non-canonical value
 * (undefined, non-finite number, unsupported type), or exceeds the nesting
 * limit. Extension payloads must be canonical-JSON-safe so a registered
 * extension can never influence signature input or authorization semantics.
 */
export function inspectExtensionPayload(
  identifier: string,
  value: unknown,
  options: { maxDepth?: number } = {},
): ExtensionInspectionResult {
  const parsed = parseExtensionIdentifier(identifier)
  if (!parsed) {
    return { valid: false, reason: `malformed extension identifier: ${identifier}` }
  }
  const maxDepth = options.maxDepth ?? MAX_EXTENSION_INSPECTION_DEPTH
  const issue = walkExtensionValue(value, 0, maxDepth, "$")
  if (!issue) return { valid: true }
  if (issue.kind === "SECURITY_SENSITIVE") {
    return {
      valid: false,
      reason: `extension ${identifier} touches security-sensitive field ${issue.path} (${issue.message}); extensions never alter security semantics`,
    }
  }
  return { valid: false, reason: `extension ${identifier} value at ${issue.path} is invalid (${issue.message})` }
}

// ─── Envelope-level gate (wire format) ────────────────────────────────

export type ExtensionGateResult =
  | { valid: true; extensions: readonly ParsedExtensionIdentifier[] }
  | { valid: false; reason: string }

/**
 * Validate every `x-*` field on an envelope payload: identifier must parse,
 * vendor must be allowed, the extension must be registered, and the payload
 * must not alter security semantics. Any failure rejects the whole envelope
 * (fail closed). Envelopes without `x-*` fields are unaffected.
 */
export function validateEnvelopeExtensionFields(
  payload: Record<string, unknown>,
  options: ExtensionRegistryOptions = {},
): ExtensionGateResult {
  const extensionKeys = Object.keys(payload).filter((key) => key.startsWith("x-"))
  const accepted: ParsedExtensionIdentifier[] = []
  for (const key of extensionKeys) {
    const check = validateExtensionIdentifier(key, options)
    if (!check.valid) return { valid: false, reason: check.reason }
    const inspection = inspectExtensionPayload(key, payload[key])
    if (!inspection.valid) return { valid: false, reason: inspection.reason }
    accepted.push(check.parsed)
  }
  return { valid: true, extensions: accepted }
}

// ─── Strict schema helper ─────────────────────────────────────────────

/**
 * Strict-schema validation: every required field must be present, no value
 * may be `undefined`, and every key must be in the allowed set. Unknown
 * fields — including unknown mandatory-looking fields — are rejected,
 * consistent with the D-phase envelope validation.
 */
export function validateStrictSchema(
  payload: Record<string, unknown>,
  requiredFields: readonly string[],
  allowedFields: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const field of requiredFields) {
    if (!(field in payload)) {
      issues.push({ field, message: "missing required field" })
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      issues.push({ field: key, message: "undefined value" })
    }
    if (!allowedFields.has(key)) {
      issues.push({ field: key, message: "unknown field" })
    }
  }
  return issues
}
