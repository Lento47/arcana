/**
 * D-4: Policy delta transport.
 *
 * DELTA responses carry the operations needed to advance a node from an
 * accepted base bundle to the next bundle, plus the fully signed target
 * envelope. A node applies a delta ONLY when:
 *   - schemaVersion is supported,
 *   - basePolicyDigest matches its accepted bundle digest,
 *   - sequence is exactly base + 1,
 *   - applying the operations reproduces the target envelope's fields, and
 *   - resultPolicyDigest equals the target envelope's policyDigest.
 * Any mismatch fails closed to a FULL snapshot request.
 */

import type { PolicyBundleRecord } from "./policy-bundle-store"
import type { SignedPolicyEnvelope } from "./signed-envelopes"
import type { PolicyDeltaOperation, SignedPolicyDeltaPayload } from "./sync-protocol"

const DELTA_FIELDS = [
  "policyId",
  "policyVersion",
  "policyDigest",
  "previousPolicyDigest",
  "expiresAt",
] as const

function digestOf(envelope: SignedPolicyEnvelope): string {
  return envelope.policyDigest
}

/**
 * Deterministic diff between two signed policy envelopes. Only the
 * security-relevant envelope fields are diffed; signature fields are never
 * carried by a delta.
 */
export function buildPolicyDeltaOperations(
  before: PolicyBundleRecord,
  after: PolicyBundleRecord,
): PolicyDeltaOperation[] {
  const beforeEnvelope = JSON.parse(before.signedEnvelopeJson) as SignedPolicyEnvelope
  const afterEnvelope = JSON.parse(after.signedEnvelopeJson) as SignedPolicyEnvelope
  const operations: PolicyDeltaOperation[] = []
  for (const field of DELTA_FIELDS) {
    const beforeValue = beforeEnvelope[field]
    const afterValue = afterEnvelope[field]
    if (beforeValue === undefined && afterValue === undefined) continue
    if (beforeValue === afterValue) continue
    if (afterValue === undefined) {
      operations.push({ op: "remove", path: field })
    } else {
      operations.push({ op: "replace", path: field, value: afterValue })
    }
  }
  return operations
}

export type DeltaApplyResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: string }

/**
 * Apply dotted-path delta operations to a base payload. Paths are resolved
 * strictly: a missing parent on add/replace is an error (fail closed), and
 * remove on a missing path is an error.
 */
export function applyDeltaOperations(
  base: Record<string, unknown>,
  operations: readonly PolicyDeltaOperation[],
): DeltaApplyResult {
  const payload = structuredClone(base)
  for (const operation of operations) {
    if (!operation.path || operation.path.length === 0) {
      return { ok: false, reason: "empty delta path" }
    }
    const segments = operation.path.split(".")
    let cursor: Record<string, unknown> = payload
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index]!
      const next = cursor[segment]
      if (typeof next !== "object" || next === null) {
        return { ok: false, reason: `delta parent not found: ${segments.slice(0, index + 1).join(".")}` }
      }
      cursor = next as Record<string, unknown>
    }
    const leaf = segments[segments.length - 1]!
    if (operation.op === "remove") {
      if (!(leaf in cursor)) {
        return { ok: false, reason: `delta remove target missing: ${operation.path}` }
      }
      delete cursor[leaf]
    } else {
      if (operation.value === undefined) {
        return { ok: false, reason: `delta ${operation.op} requires value: ${operation.path}` }
      }
      cursor[leaf] = operation.value
    }
  }
  return { ok: true, payload }
}

export function buildPolicyDelta(
  before: PolicyBundleRecord,
  after: PolicyBundleRecord,
  now: Date = new Date(),
): SignedPolicyDeltaPayload {
  const afterEnvelope = JSON.parse(after.signedEnvelopeJson) as SignedPolicyEnvelope
  return {
    schemaVersion: 1,
    issuerId: afterEnvelope.issuerId,
    issuerEpoch: afterEnvelope.issuerEpoch,
    sequence: after.sequence,
    basePolicyDigest: before.digest,
    resultPolicyDigest: digestOf(afterEnvelope),
    operations: buildPolicyDeltaOperations(before, after),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  }
}

export type PolicyDeltaVerification =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Verify a policy delta against the node's accepted base bundle and the
 * carried target envelope. Any mismatch means the node must request a full
 * snapshot instead.
 */
export function verifyPolicyDelta(
  delta: SignedPolicyDeltaPayload,
  base: PolicyBundleRecord | undefined,
  targetEnvelope: SignedPolicyEnvelope,
): PolicyDeltaVerification {
  if (delta.schemaVersion !== 1) {
    return { valid: false, reason: `unsupported delta schemaVersion: ${delta.schemaVersion}` }
  }
  if (!base) {
    return { valid: false, reason: "delta requires a known base bundle" }
  }
  if (delta.basePolicyDigest !== base.digest) {
    return {
      valid: false,
      reason: `delta base digest ${delta.basePolicyDigest} does not match accepted ${base.digest}`,
    }
  }
  if (delta.sequence !== base.sequence + 1) {
    return {
      valid: false,
      reason: `delta sequence ${delta.sequence} is not base sequence ${base.sequence} + 1`,
    }
  }
  if (delta.resultPolicyDigest !== targetEnvelope.policyDigest) {
    return {
      valid: false,
      reason: `delta result digest ${delta.resultPolicyDigest} does not match target envelope ${targetEnvelope.policyDigest}`,
    }
  }
  if (targetEnvelope.sequence !== delta.sequence) {
    return {
      valid: false,
      reason: `target envelope sequence ${targetEnvelope.sequence} does not match delta sequence ${delta.sequence}`,
    }
  }
  if (targetEnvelope.previousPolicyDigest !== undefined && targetEnvelope.previousPolicyDigest !== base.digest) {
    return {
      valid: false,
      reason: `target envelope previousPolicyDigest ${targetEnvelope.previousPolicyDigest} does not match base ${base.digest}`,
    }
  }

  const applied = applyDeltaOperations(
    JSON.parse(base.signedEnvelopeJson) as Record<string, unknown>,
    delta.operations,
  )
  if (!applied.ok) return { valid: false, reason: applied.reason }
  const appliedEnvelope = applied.payload as unknown as SignedPolicyEnvelope
  if (appliedEnvelope.policyVersion !== targetEnvelope.policyVersion) {
    return { valid: false, reason: "applied delta policyVersion does not match target envelope" }
  }
  if (appliedEnvelope.policyDigest !== targetEnvelope.policyDigest) {
    return { valid: false, reason: "applied delta policyDigest does not match target envelope" }
  }
  if (appliedEnvelope.previousPolicyDigest !== targetEnvelope.previousPolicyDigest) {
    return { valid: false, reason: "applied delta previousPolicyDigest does not match target envelope" }
  }
  return { valid: true }
}
