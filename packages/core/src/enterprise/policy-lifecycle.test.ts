/**
 * F3: policy lifecycle tests (promotion, approval, diff).
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "../crypto/signed-envelopes"
import { signEnvelope } from "../crypto/node-enrollment"
import { SqlitePolicyBundleStore } from "../crypto/policy-bundle-store-sqlite"
import { publishPolicyBundle, type PolicyBundleStore } from "../crypto/policy-bundle-store"
import { SqliteIdentityStore } from "./identity-sqlite"
import {
  diffPolicyBundles,
  promotePolicyBundle,
  requiredPermissionFor,
} from "./policy-lifecycle"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("71".repeat(32)))
const ISSUER_KEYS = new Map([["issuer-arcana", issuerKey.publicKey]])
const NOW = new Date("2026-08-02T12:00:00.000Z")

function envelope(sequence: number, previousPolicyDigest?: string, digest = `digest-${sequence}`): SignedPolicyEnvelope {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    policyId: "policy-root",
    policyVersion: `1.0.${sequence}`,
    policyDigest: digest,
    issuedAt: "2026-08-02T11:00:00.000Z",
    expiresAt: "2026-08-02T23:00:00.000Z",
    ...(previousPolicyDigest !== undefined ? { previousPolicyDigest } : {}),
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

function seededStore(sequences: Array<{ seq: number; prev?: string }>): PolicyBundleStore {
  const store = new SqlitePolicyBundleStore(new Database(":memory:"))
  for (const { seq, prev } of sequences) {
    publishPolicyBundle(
      { envelope: envelope(seq, prev), activationTime: NOW.toISOString(), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS },
      store,
    )
  }
  return store
}

describe("F3 policy promotion", () => {
  it("promotes a validated bundle with approver permission and audits it", () => {
    const source = seededStore([{ seq: 1 }])
    const target = new SqlitePolicyBundleStore(new Database(":memory:"))
    const identity = new SqliteIdentityStore(new Database(":memory:"))

    const result = promotePolicyBundle(
      {
        tenantId: "tenant-a",
        sourceStore: source,
        targetStore: target,
        sourceSequence: 1,
        targetEnvironment: "prod",
        requestedBy: "u-owner",
        approvedBy: "u-admin",
        approverHasPermission: true,
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      identity,
    )
    expect(result.kind).toBe("PROMOTED")
    if (result.kind !== "PROMOTED") return
    expect(target.latestActive()?.digest).toBe("digest-1")
    expect(target.latestActive()?.sequence).toBe(1)
    expect(identity.auditLog("tenant-a").some((e) => e.outcome === "ALLOWED")).toBe(true)
  })

  it("rejects promotion without approver permission and audits the denial", () => {
    const source = seededStore([{ seq: 1 }])
    const target = new SqlitePolicyBundleStore(new Database(":memory:"))
    const identity = new SqliteIdentityStore(new Database(":memory:"))

    const result = promotePolicyBundle(
      {
        tenantId: "tenant-a",
        sourceStore: source,
        targetStore: target,
        sourceSequence: 1,
        targetEnvironment: "prod",
        requestedBy: "u-owner",
        approvedBy: "u-member",
        approverHasPermission: false,
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      identity,
    )
    expect(result).toMatchObject({ kind: "REJECTED" })
    expect(target.latestActive()).toBeUndefined()
    expect(identity.auditLog("tenant-a").some((e) => e.outcome === "DENIED")).toBe(true)
  })

  it("rejects promotion that would break the target chain", () => {
    const source = seededStore([{ seq: 1 }, { seq: 2, prev: "digest-1" }])
    // Target has a DIFFERENT seq-1 policy, so promoting source seq-2 breaks
    // the previous-digest chain.
    const target = new SqlitePolicyBundleStore(new Database(":memory:"))
    publishPolicyBundle(
      { envelope: envelope(1, undefined, "other-digest"), activationTime: NOW.toISOString(), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS },
      target,
    )
    const identity = new SqliteIdentityStore(new Database(":memory:"))

    const result = promotePolicyBundle(
      {
        tenantId: "tenant-a",
        sourceStore: source,
        targetStore: target,
        sourceSequence: 2,
        targetEnvironment: "prod",
        requestedBy: "u-owner",
        approvedBy: "u-admin",
        approverHasPermission: true,
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      identity,
    )
    expect(result.kind).toBe("REJECTED")
    expect(target.latestActive()?.digest).toBe("other-digest")
  })
})

describe("F3 policy diff", () => {
  it("reports no changes for identical bundles", () => {
    const a = seededStore([{ seq: 1 }]).getBySequence(1)!
    const diff = diffPolicyBundles(a, { ...a })
    expect(diff.changes).toEqual([])
    expect(diff.digestChanged).toBe(false)
  })

  it("reports structural changes", () => {
    const a = seededStore([{ seq: 1 }]).getBySequence(1)!
    const b = seededStore([{ seq: 1 }, { seq: 2, prev: "digest-1" }]).getBySequence(2)!
    const diff = diffPolicyBundles(a, b)
    expect(diff.sequenceChanged).toBe(true)
    expect(diff.digestChanged).toBe(true)
    expect(diff.previousDigestChanged).toBe(true)
    expect(diff.changes.length).toBeGreaterThan(0)
  })

  it("maps required permissions for policy actions", () => {
    expect(requiredPermissionFor("policy.publish")).toBe("policy.publish")
    expect(requiredPermissionFor("policy.rollback")).toBe("policy.rollback")
  })
})
