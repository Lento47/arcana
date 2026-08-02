/**
 * D-4: Signed Policy Bundle Store (control plane)
 *
 * Versioned, signed policy distribution with:
 *   - sequence + previous-digest chain (no partial activation)
 *   - activation time (STAGED → ACTIVE)
 *   - last-known-good tracking
 *   - explicit, audited rollback (never silent)
 *   - strict schema enforcement (unknown mandatory fields rejected)
 *
 * The signed envelopes are verified with `verifySignedPolicy`; the store is
 * transport-neutral and backed by SQLite in `policy-bundle-store-sqlite.ts`.
 */

import { verifySignedPolicy } from "./verifier"
import { POLICY_REQUIRED_FIELDS, type SignedPolicyEnvelope } from "./signed-envelopes"
import { validateEnvelopePayload } from "./canonical-serializer"

export type PolicyBundleStatus = "STAGED" | "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK" | "FAILED"

export type PolicyBundleRecord = {
  sequence: number
  policyId: string
  policyVersion: string
  digest: string
  previousDigest?: string
  signedEnvelopeJson: string
  activationTime: string
  compatibleFrom: number
  compatibleTo: number
  status: PolicyBundleStatus
  lastKnownGood: boolean
  publishedAt: string
  /** Set when this record superseded the previous active policy. */
  supersedes?: number
  /** Set when this record is the audited rollback target of another. */
  rollbackOf?: number
}

export interface PolicyBundleStore {
  put(record: PolicyBundleRecord): void
  getBySequence(sequence: number): PolicyBundleRecord | undefined
  getByDigest(digest: string): PolicyBundleRecord | undefined
  latestActive(): PolicyBundleRecord | undefined
  lastKnownGood(): PolicyBundleRecord | undefined
  history(): PolicyBundleRecord[]
  update(record: PolicyBundleRecord): void
}

export type PolicyPublishInput = {
  envelope: SignedPolicyEnvelope
  activationTime: string
  compatibleFrom?: number
  compatibleTo?: number
  now?: Date
  trustedIssuerPublicKeys: Map<string, Uint8Array>
}

export type PolicyPublishResult =
  | { kind: "PUBLISHED"; record: PolicyBundleRecord }
  | { kind: "REJECTED"; reason: string }

const ALLOWED_POLICY_FIELDS = new Set([...POLICY_REQUIRED_FIELDS, "previousPolicyDigest"])

export function publishPolicyBundle(
  input: PolicyPublishInput,
  store: PolicyBundleStore,
): PolicyPublishResult {
  const now = input.now ?? new Date()
  const envelope = input.envelope

  // Strict schema: unknown fields are rejected so a node can never silently
  // ignore a mandatory semantic it does not understand.
  const unknownFields = Object.keys(envelope).filter((key) => !ALLOWED_POLICY_FIELDS.has(key))
  if (unknownFields.length > 0) {
    return {
      kind: "REJECTED",
      reason: `unsupported policy fields: ${unknownFields.join(", ")}`,
    }
  }
  const schemaIssues = validateEnvelopePayload(
    envelope as unknown as Record<string, unknown>,
    POLICY_REQUIRED_FIELDS,
  )
  if (schemaIssues.length > 0) {
    return {
      kind: "REJECTED",
      reason: `policy schema invalid: ${schemaIssues.map((i) => i.field).join(", ")}`,
    }
  }

  const verified = verifySignedPolicy(
    envelope as unknown as Record<string, unknown>,
    input.trustedIssuerPublicKeys,
    new Map(),
    now.getTime(),
  )
  if (!verified.valid) {
    return { kind: "REJECTED", reason: `policy signature verification failed: ${verified.detail}` }
  }

  const duplicate = store.getBySequence(envelope.sequence)
  if (duplicate) {
    if (duplicate.digest === envelope.policyDigest) {
      return { kind: "PUBLISHED", record: duplicate }
    }
    return { kind: "REJECTED", reason: `sequence ${envelope.sequence} already used with a different digest` }
  }

  const latest = store.latestActive()
  if (latest) {
    if (envelope.sequence !== latest.sequence + 1) {
      return {
        kind: "REJECTED",
        reason: `sequence discontinuity: expected ${latest.sequence + 1}, got ${envelope.sequence}`,
      }
    }
    if ((envelope.previousPolicyDigest ?? undefined) !== latest.digest) {
      return {
        kind: "REJECTED",
        reason: "previousPolicyDigest does not match the latest active bundle",
      }
    }
  } else if (envelope.previousPolicyDigest !== undefined) {
    return { kind: "REJECTED", reason: "orphan policy bundle: previousPolicyDigest set but store is empty" }
  }

  const activationMs = new Date(input.activationTime).getTime()
  const status: PolicyBundleStatus = activationMs <= now.getTime() ? "ACTIVE" : "STAGED"
  const record: PolicyBundleRecord = {
    sequence: envelope.sequence,
    policyId: envelope.policyId,
    policyVersion: envelope.policyVersion,
    digest: envelope.policyDigest,
    previousDigest: envelope.previousPolicyDigest,
    signedEnvelopeJson: JSON.stringify(envelope),
    activationTime: input.activationTime,
    compatibleFrom: input.compatibleFrom ?? 1,
    compatibleTo: input.compatibleTo ?? 1,
    status,
    lastKnownGood: status === "ACTIVE",
    publishedAt: now.toISOString(),
    supersedes: latest?.sequence,
  }

  store.put(record)
  if (status === "ACTIVE" && latest) {
    store.update({ ...latest, status: "SUPERSEDED", lastKnownGood: false })
  }
  return { kind: "PUBLISHED", record }
}

export type PolicyRollbackResult =
  | { kind: "ROLLED_BACK"; record: PolicyBundleRecord }
  | { kind: "REJECTED"; reason: string }

/**
 * Explicit, audited rollback to a previously active sequence. The target must
 * exist; the current active bundle is marked ROLLED_BACK with `rollbackOf`
 * pointing at the target. Rollback never happens silently.
 */
export function rollbackPolicy(
  toSequence: number,
  store: PolicyBundleStore,
  now: Date = new Date(),
): PolicyRollbackResult {
  const current = store.latestActive()
  if (!current) {
    return { kind: "REJECTED", reason: "no active policy to roll back" }
  }
  if (toSequence === current.sequence) {
    return { kind: "REJECTED", reason: `policy ${toSequence} is already active` }
  }
  const target = store.getBySequence(toSequence)
  if (!target) {
    return { kind: "REJECTED", reason: `policy sequence ${toSequence} not found` }
  }
  if (target.status === "ROLLED_BACK" || target.status === "FAILED") {
    return { kind: "REJECTED", reason: `policy ${toSequence} is in status ${target.status}` }
  }

  store.update({
    ...current,
    status: "ROLLED_BACK",
    lastKnownGood: false,
    rollbackOf: toSequence,
  })
  const activated: PolicyBundleRecord = {
    ...target,
    status: "ACTIVE",
    lastKnownGood: true,
  }
  store.update(activated)
  return { kind: "ROLLED_BACK", record: activated }
}

/**
 * Activate bundles whose activation time has arrived (staged rollout).
 * Returns the newly activated records.
 */
export function activateDuePolicyBundles(
  store: PolicyBundleStore,
  now: Date = new Date(),
): PolicyBundleRecord[] {
  const activated: PolicyBundleRecord[] = []
  for (const record of store.history()) {
    if (record.status !== "STAGED") continue
    if (new Date(record.activationTime).getTime() > now.getTime()) continue
    const current = store.latestActive()
    if (current && record.previousDigest !== current.digest) continue
    const next: PolicyBundleRecord = { ...record, status: "ACTIVE", lastKnownGood: true }
    store.update(next)
    if (current) store.update({ ...current, status: "SUPERSEDED", lastKnownGood: false })
    activated.push(next)
  }
  return activated
}
