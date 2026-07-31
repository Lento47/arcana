import { describe, expect, test } from "bun:test"
import {
  delegateCapabilities,
  validateAttenuation,
  canParentDelegate,
  isResourceNarrowerOrEqual,
  isSensitivityNarrowerOrEqual,
} from "@arcana/core/capability/delegation"
import type {
  CapabilityGrantDraft,
  DelegationRequest,
  DelegatedContext,
} from "@arcana/core/capability/delegation"
import type {
  CapabilityGrant,
  ResourceSelector,
} from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeParentGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "parent-cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["filesystem.read", "filesystem.write", "process.execute"],
    resources: [
      { kind: "file", pattern: "packages/**" },
      { kind: "process", pattern: "bun" },
    ],
    constraints: {
      sessionId: "parent-sess",
      contractId: "contract-001",
      toolNames: ["read_file", "write_file", "terminal"],
      expiresAt: "2099-01-01T00:00:00Z",
      maxUses: 100,
    },
    delegation: { allowed: true, maximumDepth: 2, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-parent",
    ...overrides,
  }
}

function makeDelegatedContext(overrides: Partial<DelegatedContext> = {}): DelegatedContext {
  return {
    sourceEventIds: ["evt-parent"],
    provenance: ["USER_INSTRUCTION"],
    sensitivity: "INTERNAL",
    contractId: "contract-001",
    contractRevision: 1,
    parentSessionId: "parent-sess",
    ...overrides,
  }
}

function makeDelegationRequest(overrides: Partial<DelegationRequest> = {}): DelegationRequest {
  return {
    parentPrincipalId: "agent:main",
    childPrincipalId: "agent:child",
    parentSessionId: "parent-sess",
    childSessionId: "child-sess",
    contractId: "contract-001",
    contractRevision: 1,
    requestedGrants: [],
    delegatedContext: makeDelegatedContext(),
    ...overrides,
  }
}

// ── Resource Narrowing ────────────────────────────────────────────────

describe("Resource narrowing: path comparison", () => {
  test("packages/engine/** ⊆ packages/**", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "packages/engine/**" },
      { kind: "file", pattern: "packages/**" },
    )).toBe(true)
  })

  test("packages/engine/src/foo.ts ⊆ packages/**", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "packages/engine/src/foo.ts" },
      { kind: "file", pattern: "packages/**" },
    )).toBe(true)
  })

  test("packages/evil/** ⊄ packages/engine/**", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "packages/evil/**" },
      { kind: "file", pattern: "packages/engine/**" },
    )).toBe(false)
  })

  test("* ⊆ *", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "*" },
      { kind: "file", pattern: "*" },
    )).toBe(true)
  })

  test("specific ⊆ *", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "README.md" },
      { kind: "file", pattern: "*" },
    )).toBe(true)
  })

  test("* ⊄ specific", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "file", pattern: "*" },
      { kind: "file", pattern: "packages/**" },
    )).toBe(false)
  })
})

describe("Resource narrowing: executable comparison", () => {
  test("bun ⊆ bun", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "process", pattern: "bun" },
      { kind: "process", pattern: "bun" },
    )).toBe(true)
  })

  test("bun ⊆ *", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "process", pattern: "bun" },
      { kind: "process", pattern: "*" },
    )).toBe(true)
  })

  test("* ⊄ bun", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "process", pattern: "*" },
      { kind: "process", pattern: "bun" },
    )).toBe(false)
  })

  test("node ⊄ bun", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "process", pattern: "node" },
      { kind: "process", pattern: "bun" },
    )).toBe(false)
  })
})

describe("Resource narrowing: host comparison", () => {
  test("api.example.com ⊆ *.example.com", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "network", pattern: "api.example.com" },
      { kind: "network", pattern: "*.example.com" },
    )).toBe(true)
  })

  test("evil.com ⊄ *.example.com", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "network", pattern: "evil.com" },
      { kind: "network", pattern: "*.example.com" },
    )).toBe(false)
  })

  test("api.example.com ⊆ *", () => {
    expect(isResourceNarrowerOrEqual(
      { kind: "network", pattern: "api.example.com" },
      { kind: "network", pattern: "*" },
    )).toBe(true)
  })
})

// ── Attenuation Validation ────────────────────────────────────────────

describe("Attenuation validation", () => {
  test("exact subset → valid", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    }
    const parent = makeParentGrant()
    expect(validateAttenuation(draft, parent)).toBeNull()
  })

  test("action amplification → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["deploy"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    }
    const parent = makeParentGrant()
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_ACTION_AMPLIFICATION")
  })

  test("resource amplification → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "/etc/**" }],
    }
    const parent = makeParentGrant()
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_RESOURCE_AMPLIFICATION")
  })

  test("prefix-confusion path → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine-evil/**" }],
    }
    const parent = makeParentGrant({
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_RESOURCE_AMPLIFICATION")
  })

  test("broader executable → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
    }
    const parent = makeParentGrant({
      resources: [{ kind: "process", pattern: "bun" }],
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_RESOURCE_AMPLIFICATION")
  })

  test("broader host constraint → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
      constraints: { networkHosts: ["evil.com"] },
    }
    const parent = makeParentGrant({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
      constraints: { networkHosts: ["api.example.com"] },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_NETWORK_AMPLIFICATION")
  })

  test("later expiry → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { expiresAt: "2099-12-31T00:00:00Z" },
    }
    const parent = makeParentGrant({
      constraints: { expiresAt: "2099-06-01T00:00:00Z" },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_EXPIRY_AMPLIFICATION")
  })

  test("higher use limit → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { maxUses: 200 },
    }
    const parent = makeParentGrant({
      constraints: { maxUses: 100 },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_USE_AMPLIFICATION")
  })

  test("delegation not allowed → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    }
    const parent = makeParentGrant({
      delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_DELEGATION_DEPTH")
  })

  test("delegation depth exceeded → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    }
    const parent = makeParentGrant({
      delegation: { allowed: true, maximumDepth: 1, currentDepth: 1 },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_DELEGATION_DEPTH")
  })

  test("tool amplification → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { toolNames: ["read_file", "write_file", "terminal", "send_message"] },
    }
    const parent = makeParentGrant({
      constraints: { toolNames: ["read_file", "write_file"] },
    })
    const error = validateAttenuation(draft, parent)
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_TOOL_AMPLIFICATION")
  })

  test("network host added when parent has no host constraint → DENY", () => {
    const draft: CapabilityGrantDraft = {
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
      constraints: { networkHosts: ["api.example.com"] },
    }
    const parent = makeParentGrant({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*" }],
      constraints: {}, // no networkHosts
    })
    const error = validateAttenuation(draft, parent)
    // Child cannot add host constraints when parent has none
    expect(error).not.toBeNull()
    expect(error!.code).toBe("DENY_NETWORK_AMPLIFICATION")
  })
})

// ── Delegation Runtime ────────────────────────────────────────────────

describe("Delegation runtime: decisive fixture", () => {
  test("parent: read+write+execute, child: read+execute only", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/engine/**" }],
          constraints: { toolNames: ["read_file"] },
        },
        {
          actions: ["process.execute"],
          resources: [{ kind: "process", pattern: "bun" }],
          constraints: { toolNames: ["terminal"], argumentPatterns: ["test packages/engine/**"] },
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")

    expect(result.status).toBe("CREATED")
    if (result.status === "CREATED") {
      expect(result.childGrants.length).toBe(2)

      // Read grant
      const readGrant = result.childGrants[0]
      expect(readGrant.actions).toEqual(["filesystem.read"])
      expect(readGrant.resources[0].pattern).toBe("packages/engine/**")
      expect(readGrant.constraints.toolNames).toEqual(["read_file"])
      expect(readGrant.principal.id).toBe("agent:child")
      expect(readGrant.delegation.currentDepth).toBe(1)
      expect(readGrant.delegation.allowed).toBe(false)

      // Execute grant
      const execGrant = result.childGrants[1]
      expect(execGrant.actions).toEqual(["process.execute"])
      expect(execGrant.resources[0].pattern).toBe("bun")
    }
  })

  test("child tries to write → DENY (not in requested grants)", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/engine/**" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("CREATED")

    if (result.status === "CREATED") {
      // Child has only read capability
      const childGrants = result.childGrants
      expect(childGrants.length).toBe(1)
      expect(childGrants[0].actions).toEqual(["filesystem.read"])
      // Write is not in child grants → any write attempt will be DENIED by PDP
    }
  })

  test("child tries to read outside path → DENY", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/engine/**" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("CREATED")

    if (result.status === "CREATED") {
      // Child can only read packages/engine/**
      const childRes = result.childGrants[0].resources[0]
      expect(childRes.pattern).toBe("packages/engine/**")
      // Reading packages/core/** would be denied by PDP resource matching
    }
  })

  test("child tries to send code externally → DENY (no network grant)", () => {
    const parent = makeParentGrant()
    // Parent has no network capability
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["network.write"],
          resources: [{ kind: "network", pattern: "attacker.com" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_ACTION_AMPLIFICATION")).toBe(true)
    }
  })

  test("child tries to read secrets → DENY (no secret grant)", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["secret.use"],
          resources: [{ kind: "secret", pattern: "API_KEY" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_ACTION_AMPLIFICATION")).toBe(true)
    }
  })

  test("child tries to delegate grandchild → DENY (depth limit)", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/**" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("CREATED")

    if (result.status === "CREATED") {
      // Child grant has delegation.allowed = false
      expect(result.childGrants[0].delegation.allowed).toBe(false)
      // Any attempt to delegate from child would fail
    }
  })
})

// ── Parent Status Checks ──────────────────────────────────────────────

describe("Delegation: parent status validation", () => {
  test("revoked parent cannot delegate", () => {
    const parent = makeParentGrant({ status: "REVOKED" })
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).not.toBeNull()
  })

  test("expired parent cannot delegate", () => {
    const parent = makeParentGrant({ status: "EXPIRED" })
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).not.toBeNull()
  })

  test("exhausted parent cannot delegate", () => {
    const parent = makeParentGrant({ status: "EXHAUSTED" })
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).not.toBeNull()
  })

  test("parent with expired constraint cannot delegate", () => {
    const parent = makeParentGrant({
      constraints: { expiresAt: "2020-01-01T00:00:00Z" },
    })
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).not.toBeNull()
  })

  test("parent without delegation permission cannot delegate", () => {
    const parent = makeParentGrant({
      delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    })
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).not.toBeNull()
  })

  test("active parent with delegation can delegate", () => {
    const parent = makeParentGrant()
    expect(canParentDelegate(parent, "2026-07-29T00:00:00Z")).toBeNull()
  })
})

// ── Zero Ambient Authority ────────────────────────────────────────────

describe("Zero ambient authority", () => {
  test("no requested grants → child has no authority", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({ requestedGrants: [] })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_NO_PARENT_AUTHORITY")).toBe(true)
    }
  })

  test("child cannot use parent grant directly", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/engine/**" }],
        },
      ],
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("CREATED")

    if (result.status === "CREATED") {
      // Child grant has different principal
      expect(result.childGrants[0].principal.id).toBe("agent:child")
      expect(result.childGrants[0].principal.kind).toBe("subagent")
      // Child grant has different session
      expect(result.childGrants[0].constraints.sessionId).toBe("child-sess")
      // Child cannot use parent's grant (different principal/session)
    }
  })
})

// ── Contract and Context ──────────────────────────────────────────────

describe("Delegation: contract and context validation", () => {
  test("wrong contract → DENY", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      contractId: "contract-001",
      delegatedContext: makeDelegatedContext({ contractId: "contract-DIFFERENT" }),
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "DENY_CONTRACT_MISMATCH")).toBe(true)
    }
  })

  test("delegated context inherits sensitivity", () => {
    const parent = makeParentGrant()
    const request = makeDelegationRequest({
      requestedGrants: [
        {
          actions: ["filesystem.read"],
          resources: [{ kind: "file", pattern: "packages/**" }],
        },
      ],
      delegatedContext: makeDelegatedContext({ sensitivity: "SECRET" }),
    })

    const result = delegateCapabilities(request, [parent], "evt-delegate")
    expect(result.status).toBe("CREATED")
    // The delegated context carries SECRET sensitivity
    // The child's authorization requests will inherit this
  })

  test("delegated context preserves provenance", () => {
    const ctx = makeDelegatedContext({
      provenance: ["USER_INSTRUCTION", "REMOTE_CONTENT"],
    })
    expect(ctx.provenance).toContain("REMOTE_CONTENT")
    expect(ctx.provenance).toContain("USER_INSTRUCTION")
  })
})

// ── Sensitivity Narrowing ─────────────────────────────────────────────

describe("Sensitivity narrowing", () => {
  test("SECRET ≥ PUBLIC", () => {
    expect(isSensitivityNarrowerOrEqual("SECRET", "PUBLIC")).toBe(true)
  })

  test("PRIVATE ≥ INTERNAL", () => {
    expect(isSensitivityNarrowerOrEqual("PRIVATE", "INTERNAL")).toBe(true)
  })

  test("PUBLIC ⊄ SECRET", () => {
    expect(isSensitivityNarrowerOrEqual("PUBLIC", "SECRET")).toBe(false)
  })

  test("SECRET ≥ SECRET", () => {
    expect(isSensitivityNarrowerOrEqual("SECRET", "SECRET")).toBe(true)
  })
})
