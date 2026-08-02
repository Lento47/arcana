/**
 * F3: policy draft validation tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "../crypto/signed-envelopes"
import { signEnvelope } from "../crypto/node-enrollment"
import { SqlitePolicyBundleStore } from "../crypto/policy-bundle-store-sqlite"
import { publishPolicyBundle } from "../crypto/policy-bundle-store"
import { validatePolicyDraft } from "./policy-drafts"

const issuerKey = ed25519.keygen(new Uint8Array(32).fill(0x5a))
const trustedIssuerPublicKeys = new Map([["issuer-arcana", issuerKey.publicKey]])

function envelope(
  sequence: number,
  previousPolicyDigest?: string,
  overrides: Partial<SignedPolicyEnvelope> = {},
): SignedPolicyEnvelope {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    policyId: "policy-root",
    policyVersion: `1.0.${sequence}`,
    policyDigest: `digest-${sequence}`,
    issuedAt: "2026-08-02T11:59:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...(previousPolicyDigest !== undefined ? { previousPolicyDigest } : {}),
    ...overrides,
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

describe("F3 policy draft validation", () => {
  it("validates a chained candidate without publishing anything", () => {
    const store = new SqlitePolicyBundleStore(new Database(":memory:"))
    expect(
      publishPolicyBundle(
        { envelope: envelope(1), activationTime: "2026-08-02T12:00:00.000Z", trustedIssuerPublicKeys },
        store,
      ).kind,
    ).toBe("PUBLISHED")

    const draft = validatePolicyDraft(
      envelope(2, "digest-1"),
      store.history(),
      trustedIssuerPublicKeys,
      new Date("2026-08-02T12:00:00.000Z"),
    )
    expect(draft.valid).toBe(true)
    if (draft.valid) expect(draft.record.sequence).toBe(2)
    // Nothing was persisted: live store still has only sequence 1.
    expect(store.latestActive()?.sequence).toBe(1)
  })

  it("rejects forged signatures, schema violations, and broken chains", () => {
    const store = new SqlitePolicyBundleStore(new Database(":memory:"))
    expect(
      publishPolicyBundle(
        { envelope: envelope(1), activationTime: "2026-08-02T12:00:00.000Z", trustedIssuerPublicKeys },
        store,
      ).kind,
    ).toBe("PUBLISHED")

    const forged = envelope(2, "digest-1")
    forged.signature = "A".repeat(64)
    expect(validatePolicyDraft(forged, store.history(), trustedIssuerPublicKeys).valid).toBe(false)

    const chainGap = validatePolicyDraft(
      envelope(3, "digest-2"),
      store.history(),
      trustedIssuerPublicKeys,
    )
    expect(chainGap.valid).toBe(false)

    const unknownIssuer = validatePolicyDraft(
      envelope(2, "digest-1", { issuerId: "issuer-evil" }),
      store.history(),
      trustedIssuerPublicKeys,
    )
    expect(unknownIssuer.valid).toBe(false)
  })
})
