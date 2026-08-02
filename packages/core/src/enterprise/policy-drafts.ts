/**
 * F3: Policy draft validation (authoring surface).
 *
 * Validates a signed policy candidate against the current chain WITHOUT
 * publishing: strict schema, issuer signature, and chain continuity are all
 * checked against a throwaway copy of the live history. Nothing is written.
 */

import {
  publishPolicyBundle,
  type PolicyBundleRecord,
  type PolicyBundleStore,
} from "../crypto/policy-bundle-store"
import type { SignedPolicyEnvelope } from "../crypto/signed-envelopes"

class DraftStore implements PolicyBundleStore {
  private readonly records = new Map<number, PolicyBundleRecord>()

  constructor(history: readonly PolicyBundleRecord[]) {
    for (const record of history) this.records.set(record.sequence, record)
  }

  put(record: PolicyBundleRecord): void {
    this.records.set(record.sequence, record)
  }

  getBySequence(sequence: number): PolicyBundleRecord | undefined {
    return this.records.get(sequence)
  }

  getByDigest(digest: string): PolicyBundleRecord | undefined {
    return [...this.records.values()].find((record) => record.digest === digest)
  }

  latestActive(): PolicyBundleRecord | undefined {
    return [...this.records.values()]
      .filter((record) => record.status === "ACTIVE")
      .sort((a, b) => b.sequence - a.sequence)[0]
  }

  lastKnownGood(): PolicyBundleRecord | undefined {
    return [...this.records.values()]
      .filter((record) => record.lastKnownGood)
      .sort((a, b) => b.sequence - a.sequence)[0]
  }

  history(): PolicyBundleRecord[] {
    return [...this.records.values()].sort((a, b) => a.sequence - b.sequence)
  }

  update(record: PolicyBundleRecord): void {
    this.records.set(record.sequence, record)
  }
}

export type PolicyDraftValidation =
  | { valid: true; record: PolicyBundleRecord }
  | { valid: false; reason: string }

export function validatePolicyDraft(
  envelope: SignedPolicyEnvelope,
  liveHistory: readonly PolicyBundleRecord[],
  trustedIssuerPublicKeys: Map<string, Uint8Array>,
  now: Date = new Date(),
): PolicyDraftValidation {
  const result = publishPolicyBundle(
    {
      envelope,
      activationTime: now.toISOString(),
      now,
      trustedIssuerPublicKeys,
    },
    new DraftStore(liveHistory),
  )
  if (result.kind === "PUBLISHED") {
    return { valid: true, record: result.record }
  }
  return { valid: false, reason: result.reason }
}
