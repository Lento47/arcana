/**
 * Phase C Wave 2B: Delegation Amplification
 *
 * Tests that child grants cannot exceed parent authority.
 * Every fixture asserts: Authority(child) ⪯ Authority(parent)
 *
 * Hard gate: authority amplifications = 0
 */

import { describe, expect, it } from "bun:test"
import { delegateCapabilities, type CapabilityGrantDraft } from "@arcana/core/capability/delegation"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeParentGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: `parent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: "1",
    principal: { kind: "agent", id: "general" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read", "filesystem.write"],
    resources: [{ kind: "file", pattern: "packages/**" }],
    constraints: { sessionId: "sess-1" },
    delegation: { allowed: true, maximumDepth: 3, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-1",
    ...overrides,
  }
}

function delegate(
  parentGrant: CapabilityGrant,
  childDraft: CapabilityGrantDraft,
  overrides: Record<string, unknown> = {},
) {
  return delegateCapabilities(
    {
      parentPrincipalId: parentGrant.principal.id,
      childPrincipalId: "leaf-agent",
      parentSessionId: parentGrant.constraints.sessionId ?? "sess-1",
      childSessionId: "sess-2",
      contractId: "contract-1",
      contractRevision: 1,
      requestedGrants: [childDraft],
      delegatedContext: {
        sourceEventIds: ["evt-1"],
        provenance: [],
        sensitivity: "PUBLIC",
        contractId: "contract-1",
        contractRevision: 1,
        parentSessionId: parentGrant.constraints.sessionId ?? "sess-1",
      },
      ...overrides,
    },
    [parentGrant],
    "evt-delegate",
  )
}

// ─── C4 — Action amplification ────────────────────────────────────────

describe("Wave 2B: Delegation amplification", () => {
  it("C4: Action amplification → DENY_ACTION_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      actions: ["filesystem.read"],
    })

    const result = delegate(parent, {
      actions: ["filesystem.read", "filesystem.write"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_ACTION_AMPLIFICATION")).toBe(true)
    }
  })

  // C5 — Resource-path broadening
  it("C5: Resource-path broadening → DENY_RESOURCE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_RESOURCE_AMPLIFICATION")).toBe(true)
    }
  })

  // C6 — Prefix-confusion path
  it("C6: Prefix-confusion 'engine-malicious' not under 'engine' → DENY_RESOURCE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine-malicious/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_RESOURCE_AMPLIFICATION")).toBe(true)
    }
  })

  // C7 — Executable broadening
  it("C7: Executable broadening → DENY_EXECUTABLE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
      constraints: { sessionId: "sess-1", executable: "bun" },
    })

    const result = delegate(parent, {
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
      constraints: { executable: "rm" },
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_EXECUTABLE_AMPLIFICATION")).toBe(true)
    }
  })

  // C9 — Tool amplification
  it("C9: Tool amplification → DENY_TOOL_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      constraints: { sessionId: "sess-1", toolNames: ["read_file"] },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { toolNames: ["read_file", "write_file"] },
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_TOOL_AMPLIFICATION")).toBe(true)
    }
  })

  // C10 — Network-host amplification (via resources)
  it("C10: Network-host amplification → DENY_RESOURCE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.example.com" }],
    })

    const result = delegate(parent, {
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.evil.com" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) =>
        r.code === "DENY_RESOURCE_AMPLIFICATION" || r.code === "DENY_NETWORK_AMPLIFICATION",
      )).toBe(true)
    }
  })

  // C11 — Secret amplification (via resources)
  it("C11: Secret amplification → DENY_RESOURCE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })

    const result = delegate(parent, {
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "*" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) =>
        r.code === "DENY_RESOURCE_AMPLIFICATION" || r.code === "DENY_SECRET_AMPLIFICATION",
      )).toBe(true)
    }
  })

  // C12 — Expiry amplification
  it("C12: Expiry amplification → DENY_EXPIRY_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      constraints: { sessionId: "sess-1", expiresAt: "2026-08-01T00:00:00Z" },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { expiresAt: "2026-12-01T00:00:00Z" },
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_EXPIRY_AMPLIFICATION")).toBe(true)
    }
  })

  // C13 — Usage-count amplification
  it("C13: Usage-count amplification → DENY_USE_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      constraints: { sessionId: "sess-1", maxUses: 5 },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { maxUses: 100 },
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_USE_AMPLIFICATION")).toBe(true)
    }
  })

  // C14 — Delegation-depth overflow
  it("C14: Delegation-depth overflow → DENY_DELEGATION_DEPTH", () => {
    const parent = makeParentGrant({
      delegation: { allowed: true, maximumDepth: 2, currentDepth: 2 },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
    }
  })

  // C15 — Child cannot add actions parent doesn't have
  it("C15: Child adds network.write → DENY_ACTION_AMPLIFICATION", () => {
    const parent = makeParentGrant({
      actions: ["filesystem.read"],
    })

    const result = delegate(parent, {
      actions: ["filesystem.read", "network.write"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_ACTION_AMPLIFICATION")).toBe(true)
    }
  })

  // C16 — Valid delegation succeeds
  it("C16: Valid narrow delegation → CREATED", () => {
    const parent = makeParentGrant({
      actions: ["filesystem.read", "filesystem.write"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1", toolNames: ["read_file", "write_file"] },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { toolNames: ["read_file"] },
    })

    expect(result.status).toBe("CREATED")
    if (result.status === "CREATED") {
      const child = result.childGrants[0]
      expect(child.actions).toEqual(["filesystem.read"])
      expect(child.resources).toEqual([{ kind: "file", pattern: "packages/engine/**" }])
      expect(child.delegation.currentDepth).toBe(1)
    }
  })

  // C17 — Delegation not allowed
  it("C17: Parent delegation.allowed = false → DENY_DELEGATION_DEPTH", () => {
    const parent = makeParentGrant({
      delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
    }
  })

  // C18 — Child narrows correctly
  it("C18: Child narrows all dimensions → CREATED with correct attenuation", () => {
    const parent = makeParentGrant({
      actions: ["filesystem.read", "filesystem.write", "process.execute"],
      resources: [
        { kind: "file", pattern: "packages/**" },
        { kind: "process", pattern: "*" },
      ],
      constraints: {
        sessionId: "sess-1",
        toolNames: ["read_file", "write_file", "terminal"],
        executable: "bun",
      },
      delegation: { allowed: true, maximumDepth: 5, currentDepth: 0 },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/src/**" }],
      constraints: { toolNames: ["read_file"], executable: "bun" },
    })

    expect(result.status).toBe("CREATED")
    if (result.status === "CREATED") {
      const child = result.childGrants[0]
      expect(child.actions).toEqual(["filesystem.read"])
      expect(child.principal.id).toBe("leaf-agent")
      expect(child.delegation.currentDepth).toBe(1)
      expect(child.delegation.allowed).toBe(false)
    }
  })

  // C19 — Mixed amplification (multiple vectors)
  it("C19: Multiple amplification vectors → DENY with all applicable codes", () => {
    const parent = makeParentGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { sessionId: "sess-1", toolNames: ["read_file"] },
    })

    const result = delegate(parent, {
      actions: ["filesystem.read", "filesystem.write", "process.execute"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { toolNames: ["read_file", "write_file", "terminal"] },
    })

    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      const codes = result.reasons.map((r) => r.code)
      // Should catch action amplification at minimum
      expect(codes.some((c) => c === "DENY_ACTION_AMPLIFICATION")).toBe(true)
    }
  })

  // C20 — Path traversal in child resource (GAP CLOSED)
  // The delegation system now canonicalizes paths before comparison.
  // 'packages/engine/../../etc/passwd' contains '..' which is rejected
  // by isResourceNarrowerOrEqual, preventing path traversal at delegation time.
  it("C20: Path traversal rejected by delegation canonicalization", () => {
    const parent = makeParentGrant({
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const result = delegate(parent, {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/../../etc/passwd" }],
    })

    // Canonical validation now rejects '..' traversal in child patterns
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      const codes = result.reasons.map((r) => r.code)
      expect(codes.some((c) => c === "DENY_RESOURCE_AMPLIFICATION")).toBe(true)
    }
  })
})
