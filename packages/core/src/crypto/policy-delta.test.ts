/**
 * D-4: policy delta tests.
 */

import { describe, expect, it } from "bun:test"
import type { PolicyBundleRecord } from "./policy-bundle-store"
import type { SignedPolicyEnvelope } from "./signed-envelopes"
import {
  applyDeltaOperations,
  buildPolicyDelta,
  buildPolicyDeltaOperations,
  verifyPolicyDelta,
} from "./policy-delta"

function envelope(overrides: Partial<SignedPolicyEnvelope> = {}): SignedPolicyEnvelope {
  return {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence: 1,
    policyId: "policy-root",
    policyVersion: "1.0.1",
    policyDigest: "digest-1",
    issuedAt: "2026-08-02T12:00:00.000Z",
    expiresAt: "2026-08-02T13:00:00.000Z",
    signatureAlgorithm: "Ed25519",
    signature: "sig",
    ...overrides,
  }
}

function record(sequence: number, signedEnvelopeJson: string): PolicyBundleRecord {
  const parsed = JSON.parse(signedEnvelopeJson) as SignedPolicyEnvelope
  return {
    sequence,
    policyId: parsed.policyId,
    policyVersion: parsed.policyVersion,
    digest: parsed.policyDigest,
    previousDigest: parsed.previousPolicyDigest,
    signedEnvelopeJson,
    activationTime: "2026-08-02T12:00:00.000Z",
    compatibleFrom: 1,
    compatibleTo: 1,
    status: "ACTIVE",
    lastKnownGood: true,
    publishedAt: "2026-08-02T12:00:00.000Z",
  }
}

const beforeEnvelope = envelope()
const afterEnvelope = envelope({
  sequence: 2,
  policyVersion: "1.0.2",
  policyDigest: "digest-2",
  previousPolicyDigest: "digest-1",
  expiresAt: "2026-08-02T14:00:00.000Z",
})
const before = record(1, JSON.stringify(beforeEnvelope))
const after = record(2, JSON.stringify(afterEnvelope))

describe("D-4 policy delta", () => {
  it("builds operations that reproduce the target envelope fields", () => {
    const operations = buildPolicyDeltaOperations(before, after)
    expect(operations.map((op) => op.path).sort()).toEqual([
      "expiresAt",
      "policyDigest",
      "policyVersion",
      "previousPolicyDigest",
    ])
    const applied = applyDeltaOperations(
      JSON.parse(before.signedEnvelopeJson) as Record<string, unknown>,
      operations,
    )
    expect(applied.ok).toBe(true)
    if (applied.ok) {
      expect(applied.payload.policyVersion).toBe("1.0.2")
      expect(applied.payload.policyDigest).toBe("digest-2")
      expect(applied.payload.previousPolicyDigest).toBe("digest-1")
    }
  })

  it("builds and verifies a valid delta", () => {
    const delta = buildPolicyDelta(before, after, new Date("2026-08-02T12:00:00.000Z"))
    expect(delta.basePolicyDigest).toBe("digest-1")
    expect(delta.resultPolicyDigest).toBe("digest-2")
    expect(delta.sequence).toBe(2)
    const verification = verifyPolicyDelta(delta, before, afterEnvelope)
    expect(verification).toEqual({ valid: true })
  })

  it("fails closed on wrong base, wrong sequence, or tampered operations", () => {
    const delta = buildPolicyDelta(before, after)
    expect(verifyPolicyDelta(delta, undefined, afterEnvelope)).toMatchObject({ valid: false })

    const wrongBase = record(1, JSON.stringify(envelope({ policyDigest: "digest-other" })))
    expect(verifyPolicyDelta(delta, wrongBase, afterEnvelope)).toMatchObject({ valid: false })

    const tampered = {
      ...delta,
      operations: [{ op: "replace" as const, path: "policyVersion", value: "9.9.9" }],
    }
    expect(verifyPolicyDelta(tampered, before, afterEnvelope)).toMatchObject({ valid: false })

    const wrongResult = { ...delta, resultPolicyDigest: "digest-evil" }
    expect(verifyPolicyDelta(wrongResult, before, afterEnvelope)).toMatchObject({ valid: false })
  })

  it("rejects invalid delta operations", () => {
    expect(
      applyDeltaOperations(
        JSON.parse(before.signedEnvelopeJson) as Record<string, unknown>,
        [{ op: "replace", path: "missing.parent.value", value: 1 }],
      ),
    ).toMatchObject({ ok: false })
    expect(
      applyDeltaOperations(
        JSON.parse(before.signedEnvelopeJson) as Record<string, unknown>,
        [{ op: "remove", path: "doesNotExist" }],
      ),
    ).toMatchObject({ ok: false })
  })
})
