/**
 * D-4: signed policy bundle store tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "./signed-envelopes"
import { signEnvelope } from "./node-enrollment"
import { SqlitePolicyBundleStore } from "./policy-bundle-store-sqlite"
import {
  activateDuePolicyBundles,
  publishPolicyBundle,
  rollbackPolicy,
  type PolicyBundleStore,
} from "./policy-bundle-store"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("77".repeat(32)))
const NOW = new Date("2026-08-02T12:00:00.000Z")
const ISSUER_KEYS = new Map([["issuer-arcana", issuerKey.publicKey]])

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
    issuedAt: "2026-08-02T11:00:00.000Z",
    expiresAt: "2026-08-02T23:00:00.000Z",
    ...(previousPolicyDigest !== undefined ? { previousPolicyDigest } : {}),
    ...overrides,
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

function store(): PolicyBundleStore {
  return new SqlitePolicyBundleStore(new Database(":memory:"))
}

function publish(seq: number, prev?: string, storeImpl: PolicyBundleStore = store(), activation?: string) {
  return publishPolicyBundle(
    {
      envelope: envelope(seq, prev),
      activationTime: activation ?? NOW.toISOString(),
      now: NOW,
      trustedIssuerPublicKeys: ISSUER_KEYS,
    },
    storeImpl,
  )
}

describe("D-4 policy bundle publishing", () => {
  it("publishes a first bundle as ACTIVE with last-known-good", () => {
    const s = store()
    const result = publish(1, undefined, s)
    expect(result.kind).toBe("PUBLISHED")
    if (result.kind !== "PUBLISHED") return
    expect(result.record.status).toBe("ACTIVE")
    expect(result.record.lastKnownGood).toBe(true)
    expect(s.latestActive()?.digest).toBe("digest-1")
    expect(s.lastKnownGood()?.digest).toBe("digest-1")
  })

  it("publishes a chained successor and supersedes the previous", () => {
    const s = store()
    const first = publish(1, undefined, s)
    if (first.kind !== "PUBLISHED") throw new Error("fixture")
    const second = publish(2, first.record.digest, s)
    expect(second.kind).toBe("PUBLISHED")
    if (second.kind !== "PUBLISHED") return
    expect(second.record.status).toBe("ACTIVE")
    expect(s.latestActive()?.sequence).toBe(2)
    expect(s.getBySequence(1)?.status).toBe("SUPERSEDED")
  })

  it("rejects sequence discontinuities and broken chains", () => {
    const s = store()
    publish(1, undefined, s)
    expect(publish(3, "digest-1", s)).toMatchObject({ kind: "REJECTED" })
    expect(publish(2, "wrong-previous", s)).toMatchObject({ kind: "REJECTED" })
  })

  it("rejects an orphan bundle", () => {
    const s = store()
    expect(publish(1, "some-previous", s)).toMatchObject({ kind: "REJECTED" })
  })

  it("rejects unknown mandatory fields (strict schema)", () => {
    const s = store()
    const bad = envelope(1, undefined, { mandatoryExtension: "unrecognized" } as Partial<SignedPolicyEnvelope>)
    const result = publishPolicyBundle(
      {
        envelope: bad,
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(result).toMatchObject({ kind: "REJECTED" })
  })

  it("accepts a registered extension field (E-9 registry gate)", () => {
    const s = store()
    const ext = envelope(1, undefined, { "x-arcana-session": { sessionId: "s-1" } } as Partial<SignedPolicyEnvelope>)
    const result = publishPolicyBundle(
      {
        envelope: ext,
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(result).toMatchObject({ kind: "PUBLISHED" })
  })

  it("rejects an unregistered extension field (E-9 registry gate)", () => {
    const s = store()
    const ext = envelope(1, undefined, { "x-arcana-widget": {} } as Partial<SignedPolicyEnvelope>)
    const result = publishPolicyBundle(
      {
        envelope: ext,
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(result).toMatchObject({ kind: "REJECTED" })
    if (result.kind === "REJECTED") expect(result.reason).toContain("not registered")
  })

  it("rejects an extension field that alters security semantics (E-9 registry gate)", () => {
    const s = store()
    const ext = envelope(1, undefined, { "x-arcana-session": { revoke: true } } as Partial<SignedPolicyEnvelope>)
    const result = publishPolicyBundle(
      {
        envelope: ext,
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(result).toMatchObject({ kind: "REJECTED" })
    if (result.kind === "REJECTED") expect(result.reason).toContain("security")
  })

  it("rejects a forged signature", () => {
    const s = store()
    const forged = envelope(1)
    forged.signature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    const result = publishPolicyBundle(
      {
        envelope: forged,
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(result).toMatchObject({ kind: "REJECTED" })
  })

  it("rejects duplicate sequences with a different digest and is idempotent otherwise", () => {
    const s = store()
    publish(1, undefined, s)
    expect(publish(1, undefined, s)).toMatchObject({ kind: "PUBLISHED" })
    const conflict = publishPolicyBundle(
      {
        envelope: envelope(1, undefined, { policyDigest: "different-digest" }),
        activationTime: NOW.toISOString(),
        now: NOW,
        trustedIssuerPublicKeys: ISSUER_KEYS,
      },
      s,
    )
    expect(conflict).toMatchObject({ kind: "REJECTED" })
  })
})

describe("D-4 staged rollout and rollback", () => {
  it("stays STAGED until activation time, then activates", () => {
    const s = store()
    publish(1, undefined, s)
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString()
    const staged = publish(2, "digest-1", s, future)
    expect(staged.kind).toBe("PUBLISHED")
    if (staged.kind !== "PUBLISHED") return
    expect(staged.record.status).toBe("STAGED")
    expect(s.latestActive()?.sequence).toBe(1)

    const activated = activateDuePolicyBundles(s, new Date(NOW.getTime() + 61 * 60 * 1000))
    expect(activated.map((r) => r.sequence)).toEqual([2])
    expect(s.latestActive()?.sequence).toBe(2)
    expect(s.getBySequence(1)?.status).toBe("SUPERSEDED")
  })

  it("rolls back explicitly and marks the rolled-back bundle", () => {
    const s = store()
    publish(1, undefined, s)
    publish(2, "digest-1", s)
    publish(3, "digest-2", s)

    const rolled = rollbackPolicy(2, s, NOW)
    expect(rolled.kind).toBe("ROLLED_BACK")
    if (rolled.kind !== "ROLLED_BACK") return
    expect(s.latestActive()?.sequence).toBe(2)
    expect(s.getBySequence(3)?.status).toBe("ROLLED_BACK")
    expect(s.getBySequence(3)?.rollbackOf).toBe(2)
    expect(s.lastKnownGood()?.sequence).toBe(2)
  })

  it("rejects rollback to unknown or already-active sequences", () => {
    const s = store()
    publish(1, undefined, s)
    expect(rollbackPolicy(1, s, NOW)).toMatchObject({ kind: "REJECTED" })
    expect(rollbackPolicy(99, s, NOW)).toMatchObject({ kind: "REJECTED" })
  })
})

describe("D-4 SQLite persistence", () => {
  it("survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-policy-"))
    try {
      const dbPath = join(dir, "policy.db")
      const db1 = new Database(dbPath)
      const s1 = new SqlitePolicyBundleStore(db1)
      publish(1, undefined, s1)
      publish(2, "digest-1", s1)
      db1.close()

      const db2 = new Database(dbPath)
      const s2 = new SqlitePolicyBundleStore(db2)
      expect(s2.history()).toHaveLength(2)
      expect(s2.latestActive()?.sequence).toBe(2)
      expect(s2.lastKnownGood()?.digest).toBe("digest-2")
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
