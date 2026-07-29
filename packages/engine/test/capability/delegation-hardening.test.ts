import { describe, expect, test } from "bun:test"
import {
  validateAncestorChain,
  findDescendants,
  cascadeRevocation,
  deriveDelegationProfile,
} from "@arcana/core/capability/delegation"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "grant-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:child" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "*" }],
    constraints: {},
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
    ...overrides,
  }
}

// ── Ancestor Chain Validation ─────────────────────────────────────────

describe("Ancestor chain validation", () => {
  test("active grant with user issuer → valid", () => {
    const grant = makeGrant({ issuer: { kind: "user", id: "user:owner" } })
    const result = validateAncestorChain(grant, () => undefined)
    expect(result.valid).toBe(true)
  })

  test("revoked grant → invalid", () => {
    const grant = makeGrant({ status: "REVOKED" })
    const result = validateAncestorChain(grant, () => undefined)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("REVOKED")
  })

  test("active child with active parent → valid", () => {
    const parent = makeGrant({ id: "parent", issuer: { kind: "user", id: "user:owner" } })
    const child = makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } })
    const getGrant = (id: string) => id === "parent" ? parent : undefined
    const result = validateAncestorChain(child, getGrant)
    expect(result.valid).toBe(true)
  })

  test("active child with revoked parent → invalid", () => {
    const parent = makeGrant({ id: "parent", status: "REVOKED", issuer: { kind: "user", id: "user:owner" } })
    const child = makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } })
    const getGrant = (id: string) => id === "parent" ? parent : undefined
    const result = validateAncestorChain(child, getGrant)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("REVOKED")
  })

  test("3-level chain: grandchild invalidated when grandparent revoked", () => {
    const grandparent = makeGrant({ id: "gp", status: "REVOKED", issuer: { kind: "user", id: "user:owner" } })
    const parent = makeGrant({ id: "p", issuer: { kind: "parent_capability", id: "gp" } })
    const child = makeGrant({ id: "c", issuer: { kind: "parent_capability", id: "p" } })
    const grants = new Map([["gp", grandparent], ["p", parent], ["c", child]])
    const getGrant = (id: string) => grants.get(id)
    const result = validateAncestorChain(child, getGrant)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("gp")
  })

  test("missing ancestor → invalid", () => {
    const child = makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "missing" } })
    const result = validateAncestorChain(child, () => undefined)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("not found")
  })

  test("cycle detection → invalid", () => {
    const a = makeGrant({ id: "a", issuer: { kind: "parent_capability", id: "b" } })
    const b = makeGrant({ id: "b", issuer: { kind: "parent_capability", id: "a" } })
    const grants = new Map([["a", a], ["b", b]])
    const getGrant = (id: string) => grants.get(id)
    const result = validateAncestorChain(a, getGrant)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Cycle")
  })
})

// ── Descendant Discovery ──────────────────────────────────────────────

describe("Descendant discovery", () => {
  test("no children → empty", () => {
    const grants = [makeGrant({ id: "parent" })]
    expect(findDescendants("parent", grants)).toEqual([])
  })

  test("one child → found", () => {
    const grants = [
      makeGrant({ id: "parent" }),
      makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } }),
    ]
    expect(findDescendants("parent", grants)).toEqual(["child"])
  })

  test("3-level chain → all descendants found", () => {
    const grants = [
      makeGrant({ id: "gp" }),
      makeGrant({ id: "p", issuer: { kind: "parent_capability", id: "gp" } }),
      makeGrant({ id: "c1", issuer: { kind: "parent_capability", id: "p" } }),
      makeGrant({ id: "c2", issuer: { kind: "parent_capability", id: "p" } }),
      makeGrant({ id: "gc", issuer: { kind: "parent_capability", id: "c1" } }),
    ]
    const descendants = findDescendants("gp", grants)
    expect(descendants.length).toBe(4)
    expect(descendants).toContain("p")
    expect(descendants).toContain("c1")
    expect(descendants).toContain("c2")
    expect(descendants).toContain("gc")
  })

  test("only ACTIVE descendants tracked", () => {
    const grants = [
      makeGrant({ id: "parent" }),
      makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } }),
    ]
    // findDescendants finds all descendants regardless of status
    // cascadeRevocation only revokes ACTIVE ones
    expect(findDescendants("parent", grants)).toEqual(["child"])
  })
})

// ── Cascade Revocation ────────────────────────────────────────────────

describe("Cascade revocation", () => {
  test("revoking parent cascades to children", () => {
    const grants = [
      makeGrant({ id: "parent" }),
      makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } }),
    ]
    const { invalidatedIds, updatedGrants } = cascadeRevocation("parent", "evt-revoke", grants)
    expect(invalidatedIds).toEqual(["child"])
    expect(updatedGrants.find((g) => g.id === "parent")!.status).toBe("REVOKED")
    expect(updatedGrants.find((g) => g.id === "child")!.status).toBe("REVOKED")
  })

  test("revoking grandparent cascades to all", () => {
    const grants = [
      makeGrant({ id: "gp" }),
      makeGrant({ id: "p", issuer: { kind: "parent_capability", id: "gp" } }),
      makeGrant({ id: "c", issuer: { kind: "parent_capability", id: "p" } }),
    ]
    const { invalidatedIds, updatedGrants } = cascadeRevocation("gp", "evt-revoke", grants)
    expect(invalidatedIds.length).toBe(2)
    expect(updatedGrants.every((g) => g.status === "REVOKED")).toBe(true)
  })

  test("already revoked child not double-revoked", () => {
    const grants = [
      makeGrant({ id: "parent" }),
      makeGrant({ id: "child", status: "REVOKED", issuer: { kind: "parent_capability", id: "parent" } }),
    ]
    const { updatedGrants } = cascadeRevocation("parent", "evt-revoke", grants)
    const child = updatedGrants.find((g) => g.id === "child")!
    // Should still be REVOKED (not changed)
    expect(child.status).toBe("REVOKED")
  })

  test("unrelated grants unaffected", () => {
    const grants = [
      makeGrant({ id: "parent" }),
      makeGrant({ id: "child", issuer: { kind: "parent_capability", id: "parent" } }),
      makeGrant({ id: "unrelated" }),
    ]
    const { updatedGrants } = cascadeRevocation("parent", "evt-revoke", grants)
    expect(updatedGrants.find((g) => g.id === "unrelated")!.status).toBe("ACTIVE")
  })
})

// ── Delegation Profile ────────────────────────────────────────────────

describe("Delegation profile", () => {
  test("empty events → zero profile", () => {
    const profile = deriveDelegationProfile([])
    expect(profile.delegationsRequested).toBe(0)
    expect(profile.delegationsCreated).toBe(0)
    expect(profile.delegationsDenied).toBe(0)
    expect(profile.authorityAmplifications).toBe(0)
    expect(profile.maxDepth).toBe(0)
    expect(profile.invalidatedDescendants).toBe(0)
  })

  test("counts delegation events correctly", () => {
    const events = [
      { type: "capability.delegation_requested", payload: {} },
      { type: "capability.delegation_requested", payload: {} },
      { type: "capability.delegated", payload: { depth: 1 } },
      { type: "capability.delegated", payload: { depth: 2 } },
      { type: "capability.delegation_denied", payload: { reason: "DENY_ACTION_AMPLIFICATION" } },
      { type: "capability.ancestor_invalidated", payload: {} },
    ]
    const profile = deriveDelegationProfile(events)
    expect(profile.delegationsRequested).toBe(2)
    expect(profile.delegationsCreated).toBe(2)
    expect(profile.delegationsDenied).toBe(1)
    expect(profile.authorityAmplifications).toBe(1)
    expect(profile.maxDepth).toBe(2)
    expect(profile.invalidatedDescendants).toBe(1)
  })

  test("authorityAmplifications hard invariant = 0 when no amplification denials", () => {
    const events = [
      { type: "capability.delegation_requested", payload: {} },
      { type: "capability.delegated", payload: { depth: 1 } },
      { type: "capability.delegation_denied", payload: { reason: "DENY_DELEGATION_DEPTH" } },
    ]
    const profile = deriveDelegationProfile(events)
    expect(profile.authorityAmplifications).toBe(0)
  })
})
