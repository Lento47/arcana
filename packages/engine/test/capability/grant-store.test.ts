import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  InMemoryGrantStore,
  SessionPolicyProvider,
} from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { SessionPolicyBinding } from "@arcana/core/capability/grant-store"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

const NOW = "2026-07-29T12:00:00Z"

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["process.execute"],
    resources: [{ kind: "process", pattern: "bun" }],
    constraints: {},
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
    ...overrides,
  }
}

function makeBinding(
  overrides: Partial<SessionPolicyBinding> = {},
): SessionPolicyBinding {
  return {
    principalId: "agent:main",
    sessionId: "sess-abc",
    workspaceId: "ws-1",
    workspaceTrust: "TRUSTED",
    ...overrides,
  }
}

function makeRequest(overrides = {}) {
  return buildAuthorizationRequest({
    toolName: "terminal",
    principalId: "agent:main",
    sessionId: "sess-abc",
    args: {},
    executable: "bun",
    arguments: ["test"],
    workingDirectory: "/workspace",
    ...overrides,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Task 7: no grants → DENY", () => {
  test("empty store returns DENIED", async () => {
    const store = new InMemoryGrantStore()
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })

  test("no grants for this principal → DENIED", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ principal: { kind: "agent", id: "agent:other" } })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: matching grant → EXECUTED", () => {
  test("exact matching grant allows execution", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant()))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "executed" },
      provider,
    ))
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.value).toBe("executed")
    }
  })
})

describe("Task 7: wrong principal → DENY", () => {
  test("grant for different principal is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ principal: { kind: "agent", id: "agent:main" } })))
    const provider = new SessionPolicyProvider(
      store,
      makeBinding({ principalId: "agent:attacker" }),
    )
    const req = makeRequest({ principalId: "agent:attacker" })

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: wrong session → DENY", () => {
  test("session-bound grant does not cross sessions", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ constraints: { sessionId: "sess-other" } })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: wrong workspace → DENY", () => {
  test("workspace-bound grant does not cross workspaces", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ constraints: { workspaceId: "ws-other" } })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: wrong action → DENY", () => {
  test("grant for different action is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ actions: ["filesystem.read"] })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.decision.reasons.some((r) => r.code === "DENY_ACTION_OUT_OF_SCOPE")).toBe(true)
    }
  })
})

describe("Task 7: resource constraint mismatch → DENY", () => {
  test("grant for different resource is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({
      resources: [{ kind: "process", pattern: "node" }],
    })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.decision.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)
    }
  })
})

describe("Task 7: expired grant → DENY", () => {
  test("expired grant is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({
      constraints: { expiresAt: "2026-07-28T00:00:00Z" },
    })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.decision.reasons.some((r) => r.code === "DENY_CAPABILITY_EXPIRED")).toBe(true)
    }
  })
})

describe("Task 7: revoked grant → DENY", () => {
  test("revoked grant is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant()))
    await Effect.runPromise(store.revokeGrant("cap-001", "evt-revoke"))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    // With positive allowlist, revoked grants are invisible to PDP
    // PDP produces DENY_NO_MATCHING_CAPABILITY (no grant in snapshot)
    if (result.status === "DENIED") {
      expect(result.decision.decision).toBe("DENY")
    }
  })

  test("revocation affects next decision immediately", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant()))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    // First call: should succeed
    const r1 = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "first" },
      provider,
    ))
    expect(r1.status).toBe("EXECUTED")

    // Revoke
    await Effect.runPromise(store.revokeGrant("cap-001", "evt-revoke"))

    // Second call: should be denied
    const r2 = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "second" },
      provider,
    ))
    expect(r2.status).toBe("DENIED")
  })
})

describe("Task 7: storage unavailable → DENY", () => {
  test("store returning error effect fails closed", async () => {
    const store = {
      getGrantsForPrincipal() { return Effect.fail({ _tag: "CapabilityGrantStoreError" as const, cause: new Error("DB connection lost") }) },
      getGrantsForWorkspace() { return Effect.fail({ _tag: "CapabilityGrantStoreError" as const, cause: new Error("DB connection lost") }) },
      putGrant() { return Effect.void },
      revokeGrant() { return Effect.succeed(false) },
      exhaustGrant() { return Effect.succeed(false) },
    }
    const provider = new SessionPolicyProvider(store as any, makeBinding())
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: unknown tool → DENY", () => {
  test("tool not covered by any grant is denied", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({
      constraints: { toolNames: ["web_fetch"] },
    })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.decision.reasons.some((r) => r.code === "DENY_TOOL_OUT_OF_SCOPE")).toBe(true)
    }
  })
})

describe("Task 7: approval required → no execution", () => {
  test("CRITICAL action requires approval even with matching grant", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({
      actions: ["git.push"],
      resources: [{ kind: "git", pattern: "*" }],
    })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-abc",
      args: {},
    })

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("APPROVAL_REQUIRED")
  })
})

describe("Task 7: policy version in decisions", () => {
  test("decision carries the current policy version", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant()))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "ok" },
      provider,
    ))
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.decision.policyVersion).toBe("phase-c-v1")
    }
  })
})

describe("Task 7: MCP same semantics", () => {
  test("MCP tool uses same grant resolution as registry tools", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*" }],
    })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = buildAuthorizationRequest({
      toolName: "mcp_server_tool",
      principalId: "agent:main",
      sessionId: "sess-abc",
      args: {},
      provenance: ["MCP_DESCRIPTION"],
    })

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})

describe("Task 7: multiple grants", () => {
  test("first matching grant authorizes", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ id: "cap-wrong", actions: ["filesystem.read"] })))
    await Effect.runPromise(store.putGrant(makeGrant({ id: "cap-right" })))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "ok" },
      provider,
    ))
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.decision.capabilityIds).toContain("cap-right")
    }
  })
})

describe("Task 7: exhausted grant → DENY", () => {
  test("exhausted grant is rejected", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant()))
    await Effect.runPromise(store.exhaustGrant("cap-001"))
    const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
    const req = makeRequest()

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      { request: req, executeExact: () => "should not run" },
      provider,
    ))
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      // With positive allowlist, exhausted grants are invisible to PDP
      expect(result.decision.decision).toBe("DENY")
    }
  })
})
