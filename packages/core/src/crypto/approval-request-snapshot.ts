/**
 * ApprovalRequestSnapshot (audit PR-2): the complete immutable reviewable
 * request behind an approval hash.
 *
 * The durable ApprovalRecord stores the canonical `requestHash` and lifecycle
 * metadata, but NOT the reviewable action. The operator was approving a
 * hash-associated record without seeing the complete immutable action. This
 * module closes that gap:
 *
 *  - `ApprovalRequestSnapshot` is the immutable display projection of the
 *    exact `AuthorizationRequest` that was hashed into `requestHash`.
 *  - It is written atomically with the approval record when the approval is
 *    created and is NEVER mutated afterwards.
 *  - Before a snapshot is returned to any operator surface it is VERIFIED:
 *    the runtime recomputes `computeRequestHash` over the stored immutable
 *    request and requires it to equal the approval record's `requestHash`.
 *    A changed or missing snapshot FAILS CLOSED — an explicit error, never a
 *    silently stale snapshot.
 *
 * Sensitive argument values are never silently omitted: they are replaced
 * with an explicit `{ redacted: true, path: "<field path>" }` marker so the
 * operator sees that a secret-backed argument is present at a known path.
 */

import { createHash } from "node:crypto"
import type { AuthorizationRequest, CanonicalResource, RiskClass } from "../capability/types"
import { POLICY_VERSION } from "../capability/types"
import { computeRequestHash } from "../capability/request-hash"

// ─── Primitive Types ────────────────────────────────────────────────

/** Deterministic compact JSON (object keys sorted recursively). */
export type CanonicalJson = string

/**
 * Explicit redaction marker. A sensitive argument value is NEVER silently
 * omitted — the field is replaced with this marker so the operator knows a
 * secret-backed argument was present at `path`.
 */
export type RedactedValue = {
  redacted: true
  path: string
}

export type DiffPreview = {
  filePath: string
  kind: "add" | "delete" | "modify" | "rename" | "unknown"
  additions?: number
  deletions?: number
  content?: string
}

export type ArtifactPreview = {
  kind: string
  name: string
  contentType?: string
  size?: number
  url?: string
  description?: string
}

// ─── Snapshot ───────────────────────────────────────────────────────

/**
 * Immutable reviewable projection of the exact authorization request.
 * `requestHash` is the canonical hash of the full AuthorizationRequest that
 * this snapshot projects; the runtime recomputes it before returning.
 */
export type ApprovalRequestSnapshot = {
  schemaVersion: "1"
  approvalId: string
  requestHash: string
  action: string
  resource: string
  /** Canonical JSON of the request arguments (sensitive values redacted). */
  arguments: CanonicalJson
  capability: string
  principalId: string
  intentId?: string
  policyVersion: string
  contractRevision: number
  riskClass: RiskClass
  diffPreview?: DiffPreview
  artifactPreview?: ArtifactPreview
}

export type ApprovalSnapshotMeta = {
  approvalId: string
  requestHash: string
  capability?: string
  intentId?: string
  policyVersion?: string
  contractRevision: number
  riskClass: RiskClass
  diffPreview?: DiffPreview
  artifactPreview?: ArtifactPreview
}

// ─── Canonical JSON ─────────────────────────────────────────────────

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      out[key] = sortKeys(record[key])
    }
    return out
  }
  return value
}

/** Deterministic compact JSON: object keys sorted recursively. */
export function canonicalJson(value: unknown): CanonicalJson {
  return JSON.stringify(sortKeys(value))
}

// ─── Sensitive Argument Redaction ───────────────────────────────────

/**
 * Default sensitive argument field matchers. Substring match against the
 * lower-cased argument key — aligned with the security-context secret/auth
 * patterns used at the production boundary. Redaction replaces the VALUE
 * with an explicit marker; it never drops the field.
 */
export const DEFAULT_SENSITIVE_ARGUMENT_KEYS: readonly string[] = [
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "privatekey",
  "private_key",
  "cookie",
  "jwt",
  "session_key",
  "access_token",
  "refresh_token",
  "client_secret",
  "signing_key",
  "auth",
]

export function isSensitiveArgumentKey(key: string): boolean {
  const lower = key.toLowerCase()
  return DEFAULT_SENSITIVE_ARGUMENT_KEYS.some((sensitive) => lower.includes(sensitive))
}

/**
 * Recursively replace sensitive argument values with an explicit
 * `{ redacted: true, path }` marker. Never omits a field and never touches
 * non-sensitive content. Deterministic (pure function of the value), so the
 * projection can be recomputed identically at verification time.
 */
export function redactSensitiveArguments(value: unknown, path: readonly string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactSensitiveArguments(item, [...path, String(index)]))
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record)) {
      if (isSensitiveArgumentKey(key)) {
        out[key] = { redacted: true, path: [...path, key].join(".") } satisfies RedactedValue
      } else {
        out[key] = redactSensitiveArguments(record[key], [...path, key])
      }
    }
    return out
  }
  return value
}

// ─── Resource → Reviewable String ───────────────────────────────────

/**
 * Canonical, deterministic, reviewable rendering of a CanonicalResource.
 * Preserves every field so the operator sees the full resource selector.
 */
export function resourceToCanonicalString(resource: CanonicalResource): string {
  const fields: Array<[string, string | undefined]> = [
    ["kind", resource.kind],
    ["path", resource.path],
    ["host", resource.host],
    ["executable", resource.executable],
    ["secretKind", resource.secretKind],
  ]
  return fields
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
}

// ─── Builder ────────────────────────────────────────────────────────

/**
 * Build the immutable snapshot projection of an AuthorizationRequest.
 *
 * `arguments` is the canonical JSON of the (redacted) tool-call argument
 * object. When `args` is not supplied the request's tokenized `arguments`
 * array is used. `capability` defaults to the deterministic capability id the
 * approval creates on approve (`approval-cap-<approvalId>`).
 */
export function buildApprovalRequestSnapshot(
  request: AuthorizationRequest,
  meta: ApprovalSnapshotMeta,
  args?: unknown,
): ApprovalRequestSnapshot {
  const redactedArgs = args === undefined ? request.arguments : redactSensitiveArguments(args)
  return {
    schemaVersion: "1",
    approvalId: meta.approvalId,
    requestHash: meta.requestHash,
    action: request.action,
    resource: resourceToCanonicalString(request.resource),
    arguments: canonicalJson(redactedArgs),
    capability: meta.capability ?? `approval-cap-${meta.approvalId}`,
    principalId: request.principalId,
    ...(meta.intentId ? { intentId: meta.intentId } : {}),
    policyVersion: meta.policyVersion ?? POLICY_VERSION,
    contractRevision: meta.contractRevision,
    riskClass: meta.riskClass,
    ...(meta.diffPreview ? { diffPreview: meta.diffPreview } : {}),
    ...(meta.artifactPreview ? { artifactPreview: meta.artifactPreview } : {}),
  }
}

// ─── Verification ───────────────────────────────────────────────────

export type SnapshotVerification =
  | { status: "ok"; snapshot: ApprovalRequestSnapshot }
  | { status: "missing" }
  | { status: "tampered"; reason: string }

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex")
}

export type StoredSnapshotContent = {
  request: AuthorizationRequest
  args: unknown
  snapshotJson: CanonicalJson
  snapshotHash: string
}

/**
 * Fail-closed verification of a stored snapshot against its approval record.
 *
 * 1. The canonical hash is recomputed over the stored immutable request and
 *    must equal the approval record's `requestHash` — a changed request FAILS
 *    CLOSED.
 * 2. The stored projection must hash to its own recorded integrity hash —
 *    a changed projection FAILS CLOSED.
 * 3. The projection is rebuilt from the immutable request + record and must
 *    equal the stored projection — a stale/mismatched projection FAILS
 *    CLOSED. On success the freshly rebuilt projection is returned, so the
 *    operator always sees the content the hash actually commits to.
 */
export function verifyApprovalRequestSnapshot(input: {
  approvalId: string
  content: StoredSnapshotContent
  expectedRequestHash: string
  contractRevision: number
  riskClass: RiskClass
}): SnapshotVerification {
  const { content, expectedRequestHash } = input

  const recomputedHash = computeRequestHash(content.request)
  if (recomputedHash !== expectedRequestHash) {
    return {
      status: "tampered",
      reason: `request hash mismatch: stored ${expectedRequestHash}, recomputed ${recomputedHash}`,
    }
  }

  if (sha256(content.snapshotJson) !== content.snapshotHash) {
    return { status: "tampered", reason: "snapshot projection integrity hash mismatch" }
  }

  let stored: ApprovalRequestSnapshot
  try {
    stored = JSON.parse(content.snapshotJson) as ApprovalRequestSnapshot
  } catch {
    return { status: "tampered", reason: "snapshot projection is not valid JSON" }
  }

  const rebuilt = buildApprovalRequestSnapshot(
    content.request,
    {
      approvalId: input.approvalId,
      requestHash: recomputedHash,
      contractRevision: input.contractRevision,
      riskClass: input.riskClass,
      ...(stored.intentId ? { intentId: stored.intentId } : {}),
      ...(stored.diffPreview ? { diffPreview: stored.diffPreview } : {}),
      ...(stored.artifactPreview ? { artifactPreview: stored.artifactPreview } : {}),
    },
    content.args,
  )

  if (canonicalJson(rebuilt) !== canonicalJson(stored)) {
    return { status: "tampered", reason: "stored snapshot projection does not match the immutable request" }
  }

  return { status: "ok", snapshot: rebuilt }
}

export * as ApprovalRequestSnapshot from "./approval-request-snapshot"
