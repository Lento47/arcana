// packages/core/src/capability/delegated-lease.test.ts
// Authority Kernel K8 — delegated lease issuance/verification matrix.
//
// Proves P5 (no amplification) and the revocation story:
//   signature binds everything · expiry bounds staleness · epoch invalidates
//   generations · scope containment refuses amplification.

import { describe, expect, it } from "bun:test"
import {
  generateIssuerKeyPair,
  signLease,
  verifyLease,
  type DelegatedLease,
  type EffectiveScope,
} from "./delegated-lease"

const keys = generateIssuerKeyPair()
const NOW = 1_700_000_000_000
const HOUR = 3_600_000

function baseLease(overrides: Partial<DelegatedLease> = {}): DelegatedLease {
  return {
    issuer: "arcana-root",
    subject: "proxy-edge-1",
    parentCapabilityId: "cap-root",
    effectiveScope: {
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
    },
    issuedAt: NOW,
    expiresAt: NOW + HOUR,
    issuerEpoch: 1,
    policyHash: "policy-v1",
    ...overrides,
  }
}

const parentScope: EffectiveScope = {
  actions: ["process.execute", "filesystem.write", "network.read"],
  resources: [
    { kind: "process", pattern: "*" },
    { kind: "file", pattern: "/repo/**" },
    { kind: "network", pattern: "*" },
  ],
}

describe("delegated lease (K8)", () => {
  it("issues and verifies a well-formed lease within its window", () => {
    const signed = signLease(baseLease(), keys.privateKey)
    const v = verifyLease(signed, {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
      currentIssuerEpoch: 1,
      parentScope,
    })
    expect(v.valid).toBe(true)
    if (v.valid) expect(v.reason).toBe("signature-and-claims-ok")
  })

  it("rejects tampered payloads (any field flip breaks the signature)", () => {
    const signed = signLease(baseLease({ subject: "proxy-edge-1" }), keys.privateKey)
    const tampered: SignedLease = {
      ...signed,
      lease: { ...signed.lease, subject: "proxy-edge-EVIL" },
    }
    const v = verifyLease(tampered, {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
      parentScope,
    })
    expect(v).toEqual({ valid: false, reason: "BAD_SIGNATURE" })
  })

  it("rejects signatures from a different key", () => {
    const other = generateIssuerKeyPair()
    const signed = signLease(baseLease(), other.privateKey) // signed by impostor
    const v = verifyLease(signed, {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
    })
    expect(v.valid).toBe(false)
  })

  it("enforces the temporal window in both directions", () => {
    const signed = signLease(baseLease(), keys.privateKey)
    expect(verifyLease(signed, { issuerPublicKeyPem: keys.publicKey, now: NOW - 1 }).valid).toBe(false)
    expect(verifyLease(signed, { issuerPublicKeyPem: keys.publicKey, now: NOW + HOUR + 1 }).reason).toBe("EXPIRED")
  })

  it("epoch mismatch invalidates a whole generation", () => {
    const signed = signLease(baseLease({ issuerEpoch: 1 }), keys.privateKey)
    const v = verifyLease(signed, {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
      currentIssuerEpoch: 2, // issuer rotated after compromise
    })
    expect(v.valid).toBe(false)
  })

  it("refuses scope amplification against the parent capability", () => {
    const amplifiedActions = baseLease({
      effectiveScope: {
        actions: ["process.execute", "git.push"], // child invents git.push
        resources: [{ kind: "process", pattern: "*" }],
      },
    })
    const v1 = verifyLease(signLease(amplifiedActions, keys.privateKey), {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
      parentScope,
    })
    expect(v1.valid).toBe(false)

    const amplifiedResources = baseLease({
      effectiveScope: {
        actions: ["process.execute"],
        resources: [{ kind: "file", pattern: "/etc/**" }], // not covered by parent
      },
    })
    const v2 = verifyLease(signLease(amplifiedResources, keys.privateKey), {
      issuerPublicKeyPem: keys.publicKey,
      now: NOW + 60_000,
      parentScope,
    })
    expect(v2.valid).toBe(false)
  })

  it("malformed leases fail closed without throwing", () => {
    const garbage = {
      algorithm: "ed25519",
      signature: "AAAA",
      lease: { hello: "world" },
    } as unknown as SignedLease
    const v = verifyLease(garbage, { issuerPublicKeyPem: keys.publicKey, now: NOW })
    expect(v.valid).toBe(false)
  })
})
