/**
 * D-9: Offline and partition policy tests.
 */

import { describe, expect, it } from "bun:test"
import {
  classifyOfflineRequest,
  computeEffectiveOfflineExpiry,
  DEFAULT_OFFLINE_LEASE_CONFIG,
  evaluateOfflineRequest,
  type OfflineCapableGrant,
  type OfflineLeaseConfig,
  type OfflineNodeState,
  type OfflineRequestContext,
} from "./offline-policy"

const NOW = new Date("2026-08-02T12:00:00.000Z")

const CONFIG: OfflineLeaseConfig = {
  maxOfflineDurationMs: 24 * 60 * 60 * 1000,
  maxConsequentialOfflineMs: 60 * 60 * 1000,
  policyLeaseMs: 60 * 60 * 1000,
  revocationLeaseMs: 30 * 60 * 1000,
  leaseGraceMs: 5 * 60 * 1000,
}

function grant(overrides: Partial<OfflineCapableGrant> = {}): OfflineCapableGrant {
  return {
    offlineEnabled: true,
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function node(overrides: Partial<OfflineNodeState> = {}): OfflineNodeState {
  return {
    connectivity: "ONLINE",
    enforcement: "ONLINE",
    offlineElapsedMs: 0,
    policyFreshnessMs: 1,
    revocationFreshnessMs: 1,
    ...overrides,
  }
}

function request(overrides: Partial<OfflineRequestContext> = {}): OfflineRequestContext {
  return {
    riskClass: "LOW",
    consequential: false,
    approvalRequired: false,
    ...overrides,
  }
}

describe("D-9 offline policy: ONLINE", () => {
  it("allows within grant expiry", () => {
    const result = evaluateOfflineRequest(request(), grant(), node(), NOW, CONFIG)
    expect(result).toMatchObject({ decision: "ALLOW", effectiveExpiresAt: "2099-01-01T00:00:00.000Z" })
  })

  it("denies an expired grant", () => {
    const result = evaluateOfflineRequest(
      request(),
      grant({ expiresAt: "2026-01-01T00:00:00.000Z" }),
      node(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "GRANT_EXPIRED" })
  })
})

describe("D-9 offline policy: QUARANTINED", () => {
  it("denies everything, including read-only LOW", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "LOW", consequential: false }),
      grant(),
      node({ connectivity: "OFFLINE", enforcement: "QUARANTINED" }),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "QUARANTINED" })
  })
})

describe("D-9 offline policy: OFFLINE_READ_ONLY", () => {
  const readOnlyNode = () =>
    node({
      connectivity: "OFFLINE",
      enforcement: "OFFLINE_READ_ONLY",
      offlineElapsedMs: 2 * 60 * 60 * 1000,
    })

  it("allows non-consequential reads with fresh leases", () => {
    const result = evaluateOfflineRequest(request(), grant(), readOnlyNode(), NOW, CONFIG)
    expect(result).toMatchObject({ decision: "ALLOW", reason: "read-only offline" })
  })

  it("denies consequential effects", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "HIGH", consequential: true }),
      grant(),
      readOnlyNode(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "READ_ONLY_MODE" })
  })

  it("denies reads when the policy lease is stale", () => {
    const result = evaluateOfflineRequest(
      request(),
      grant(),
      { ...readOnlyNode(), policyFreshnessMs: 0 },
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "POLICY_LEASE_STALE" })
  })
})

describe("D-9 offline policy: OFFLINE_RESTRICTED", () => {
  const restrictedNode = () =>
    node({
      connectivity: "OFFLINE",
      enforcement: "OFFLINE_RESTRICTED",
      offlineElapsedMs: 10 * 60 * 1000,
    })

  it("denies grants that are not offlineEnabled", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "MODERATE", consequential: true }),
      grant({ offlineEnabled: false }),
      restrictedNode(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "OFFLINE_GRANT_DISABLED" })
  })

  it("allows an offline-enabled grant within its lease", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "MODERATE", consequential: true }),
      grant(),
      restrictedNode(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "ALLOW", reason: "offline-restricted grant" })
  })

  it("caps the effective expiry at the offline lease end", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "MODERATE", consequential: true }),
      grant({ expiresAt: "2099-01-01T00:00:00.000Z" }),
      restrictedNode(),
      NOW,
      CONFIG,
    )
    expect(result.decision).toBe("ALLOW")
    if (result.decision !== "ALLOW") return
    const leaseEnd = NOW.getTime() + (CONFIG.maxOfflineDurationMs - 10 * 60 * 1000)
    expect(new Date(result.effectiveExpiresAt).getTime()).toBe(leaseEnd)
  })

  it("denies approval-required effects while offline", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "CRITICAL", consequential: true, approvalRequired: true }),
      grant(),
      restrictedNode(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "APPROVAL_REQUIRED_OFFLINE" })
  })

  it("denies consequential effects after the consequential window", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "HIGH", consequential: true }),
      grant(),
      node({
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        offlineElapsedMs: 61 * 60 * 1000,
      }),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "CONSEQUENTIAL_OFFLINE" })
  })

  it("denies when the per-grant offline duration override is exhausted", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "MODERATE", consequential: true }),
      grant({ offlineMaxDurationMs: 5 * 60 * 1000 }),
      restrictedNode(),
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "OFFLINE_DURATION_EXCEEDED" })
  })

  it("denies consequential effects when the revocation lease is stale", () => {
    const result = evaluateOfflineRequest(
      request({ riskClass: "MODERATE", consequential: true }),
      grant(),
      { ...restrictedNode(), revocationFreshnessMs: 0 },
      NOW,
      CONFIG,
    )
    expect(result).toMatchObject({ decision: "DENY", reason: "REVOCATION_LEASE_STALE" })
  })
})

describe("D-9 effective offline expiry", () => {
  it("defaults match the design doc", () => {
    expect(DEFAULT_OFFLINE_LEASE_CONFIG.maxOfflineDurationMs).toBe(24 * 60 * 60 * 1000)
    expect(DEFAULT_OFFLINE_LEASE_CONFIG.maxConsequentialOfflineMs).toBe(60 * 60 * 1000)
    expect(DEFAULT_OFFLINE_LEASE_CONFIG.policyLeaseMs).toBe(60 * 60 * 1000)
    expect(DEFAULT_OFFLINE_LEASE_CONFIG.revocationLeaseMs).toBe(30 * 60 * 1000)
    expect(DEFAULT_OFFLINE_LEASE_CONFIG.leaseGraceMs).toBe(5 * 60 * 1000)
  })

  it("takes the minimum of grant expiry and lease end", () => {
    const earlyExpiry = computeEffectiveOfflineExpiry(
      grant({ expiresAt: "2026-08-02T12:10:00.000Z" }),
      node({ connectivity: "OFFLINE", enforcement: "OFFLINE_RESTRICTED", offlineElapsedMs: 0 }),
      NOW,
      CONFIG,
    )
    expect(earlyExpiry).toBe("2026-08-02T12:10:00.000Z")
  })
})

describe("D-9 offline request classification (D-7 model)", () => {
  it("classifies filesystem.read as LOW, non-consequential, not approval-required", () => {
    const classification = classifyOfflineRequest(
      { action: "filesystem.read" },
      { action: "filesystem.read", resource: "packages/arcana" },
    )
    expect(classification).toEqual({
      riskClass: "LOW",
      consequential: false,
      approvalRequired: false,
    })
  })

  it("classifies unknown actions conservatively as CRITICAL, consequential, approval-required", () => {
    const classification = classifyOfflineRequest(
      { action: "process.execute" },
      { action: "process.execute", resource: "packages/arcana" },
    )
    expect(classification).toEqual({
      riskClass: "CRITICAL",
      consequential: true,
      approvalRequired: true,
    })
  })

  it("keeps every non-read action id on the conservative path (no silent allowlist)", () => {
    for (const actionId of [
      "filesystem.write",
      "process.execute",
      "network.write",
      "secret.read",
      "git.push",
    ]) {
      const classification = classifyOfflineRequest(
        { action: actionId },
        { action: actionId, resource: "packages/arcana" },
      )
      expect(classification).toMatchObject({
        riskClass: "CRITICAL",
        consequential: true,
        approvalRequired: true,
      })
    }
  })

  it("is deterministic and ignores grant metadata the D-7 model does not carry", () => {
    const a = classifyOfflineRequest(
      { action: "filesystem.read" },
      { action: "filesystem.read", resource: "a" },
    )
    const b = classifyOfflineRequest(
      { action: "filesystem.read" },
      { action: "filesystem.read", resource: "b" },
    )
    expect(a).toEqual(b)
  })
})
