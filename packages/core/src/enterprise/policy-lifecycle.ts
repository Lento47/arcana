/**
 * F3: Central policy lifecycle — promotion, approval, diff.
 *
 * Built on the D-4 signed policy bundle store:
 * - Promotion copies a validated bundle across environments transactionally
 *   (target store re-validates signature + chain continuity on publish).
 * - Promotion requires an explicit approver with the policy.publish
 *   permission; the request and approval are audited per tenant.
 * - Diff reports structural changes between two bundles.
 */

import {
  publishPolicyBundle,
  type PolicyBundleRecord,
  type PolicyBundleStore,
} from "../crypto/policy-bundle-store"
import type { SignedPolicyEnvelope } from "../crypto/signed-envelopes"
import type { IdentityStore, Permission } from "./identity"

export type PolicyPromotionInput = {
  tenantId: string
  sourceStore: PolicyBundleStore
  targetStore: PolicyBundleStore
  sourceSequence: number
  targetEnvironment: string
  requestedBy: string
  approvedBy: string
  approverHasPermission: boolean
  activationTime?: string
  now?: Date
  trustedIssuerPublicKeys: Map<string, Uint8Array>
}

export type PolicyPromotionResult =
  | { kind: "PROMOTED"; record: PolicyBundleRecord; promotionId: string }
  | { kind: "REJECTED"; reason: string }

export function promotePolicyBundle(
  input: PolicyPromotionInput,
  identity: IdentityStore,
): PolicyPromotionResult {
  const now = input.now ?? new Date()
  const source = input.sourceStore.getBySequence(input.sourceSequence)
  if (!source) {
    return { kind: "REJECTED", reason: `source policy ${input.sourceSequence} not found` }
  }
  if (source.status !== "ACTIVE" && source.status !== "STAGED") {
    return { kind: "REJECTED", reason: `source policy is ${source.status}, not promotable` }
  }
  if (!input.approverHasPermission) {
    identity.recordAudit({
      tenantId: input.tenantId,
      id: `promo-${now.getTime()}-denied`,
      actorUserId: input.approvedBy,
      action: "policy.publish",
      resource: `promote:${source.policyId}@${input.sourceSequence}`,
      outcome: "DENIED",
      at: now.toISOString(),
    })
    return { kind: "REJECTED", reason: `approver ${input.approvedBy} lacks policy.publish` }
  }

  const envelope = JSON.parse(source.signedEnvelopeJson) as SignedPolicyEnvelope
  const published = publishPolicyBundle(
    {
      envelope,
      activationTime: input.activationTime ?? now.toISOString(),
      now,
      trustedIssuerPublicKeys: input.trustedIssuerPublicKeys,
    },
    input.targetStore,
  )
  if (published.kind !== "PUBLISHED") {
    identity.recordAudit({
      tenantId: input.tenantId,
      id: `promo-${now.getTime()}-failed`,
      actorUserId: input.approvedBy,
      action: "policy.publish",
      resource: `promote:${source.policyId}@${input.sourceSequence}`,
      outcome: "DENIED",
      at: now.toISOString(),
    })
    return { kind: "REJECTED", reason: `target validation failed: ${published.reason}` }
  }

  identity.recordAudit({
    tenantId: input.tenantId,
    id: `promo-${now.getTime()}-allowed`,
    actorUserId: input.approvedBy,
    action: "policy.publish",
    resource: `promote:${source.policyId}@${input.sourceSequence}->${input.targetEnvironment}`,
    outcome: "ALLOWED",
    at: now.toISOString(),
  })

  return {
    kind: "PROMOTED",
    record: published.record,
    promotionId: `promo-${now.getTime()}-${source.sequence}`,
  }
}

export type PolicyDiff = {
  sequenceChanged: boolean
  versionChanged: boolean
  digestChanged: boolean
  activationChanged: boolean
  previousDigestChanged: boolean
  changes: string[]
}

export function diffPolicyBundles(
  before: PolicyBundleRecord | undefined,
  after: PolicyBundleRecord | undefined,
): PolicyDiff {
  if (!before || !after) {
    return {
      sequenceChanged: before?.sequence !== after?.sequence,
      versionChanged: before?.policyVersion !== after?.policyVersion,
      digestChanged: before?.digest !== after?.digest,
      activationChanged: before?.activationTime !== after?.activationTime,
      previousDigestChanged: before?.previousDigest !== after?.previousDigest,
      changes: ["bundle added or removed"],
    }
  }
  const changes: string[] = []
  if (before.sequence !== after.sequence) {
    changes.push(`sequence ${before.sequence} -> ${after.sequence}`)
  }
  if (before.policyVersion !== after.policyVersion) {
    changes.push(`version ${before.policyVersion} -> ${after.policyVersion}`)
  }
  if (before.digest !== after.digest) {
    changes.push(`digest ${before.digest.slice(0, 12)}… -> ${after.digest.slice(0, 12)}…`)
  }
  if (before.activationTime !== after.activationTime) {
    changes.push(`activation ${before.activationTime} -> ${after.activationTime}`)
  }
  if (before.previousDigest !== after.previousDigest) {
    changes.push("previous digest changed")
  }
  return {
    sequenceChanged: before.sequence !== after.sequence,
    versionChanged: before.policyVersion !== after.policyVersion,
    digestChanged: before.digest !== after.digest,
    activationChanged: before.activationTime !== after.activationTime,
    previousDigestChanged: before.previousDigest !== after.previousDigest,
    changes,
  }
}

export function requiredPermissionFor(action: "policy.publish" | "policy.rollback"): Permission {
  return action
}
