/**
 * Phase C Wave 5: Positive Utility and Performance
 *
 * Proves the system remains useful for legitimate workflows.
 * Every fixture should ALLOW with executorCalls = 1.
 *
 * Hard gate: benignSuccessRate >= 95%
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { InMemoryGrantStore } from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect, type PreparedEffect } from "@arcana/core/capability/pep"
import { evaluate as evaluatePolicy, type PolicyContext } from "@arcana/core/capability/pdp"
import type { CapabilityGrant, AuthorizationRequest } from "@arcana/core/capability/types"
import { POLICY_VERSION } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "packages/**" }],
    constraints: { sessionId: "sess-1" },
    delegation: { allowed: true, maximumDepth: 3, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-1",
    ...overrides,
  }
}

function makeRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    principalId: "agent",
    sessionId: "sess-1",
    tool: "read_file",
    action: "filesystem.read",
    resource: { kind: "file", path: "packages/engine/src/foo.ts" },
    provenance: ["USER_INSTRUCTION"],
    sensitivity: ["PUBLIC"],
    requestedAt: new Date().toISOString(),
    nonce: `nonce-${Date.now()}`,
    ...overrides,
  }
}

function makeContext(grants: CapabilityGrant[], extras: Partial<PolicyContext> = {}): PolicyContext {
  return {
    now: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    capabilities: grants,
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED",
    ...extras,
  }
}

// ─── Positive Utility Tests ───────────────────────────────────────────

describe("Wave 5: Positive utility — legitimate workflows", () => {
  // G1 — Bounded file read
  it("G1: Bounded file read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    const request = makeRequest({
      principalId: "agent",
      resource: { kind: "file", path: "packages/engine/src/index.ts" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G2 — Bounded file write
  it("G2: Bounded file write → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["filesystem.write"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })

    const request = makeRequest({
      tool: "write_file",
      action: "filesystem.write",
      resource: { kind: "file", path: "packages/engine/src/new.ts" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "written" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G3 — Exact test execution
  it("G3: Exact test execution → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
      constraints: { sessionId: "sess-1", executable: "bun" },
    })

    const request = makeRequest({
      tool: "terminal",
      action: "process.execute",
      resource: { kind: "process", executable: "bun" },
      executable: "bun",
      arguments: ["test", "packages/engine"],
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "tested" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G4 — Bounded directory read
  it("G4: Bounded directory read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      tool: "search_files",
      action: "filesystem.read",
      resource: { kind: "file", path: "packages/engine" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "searched" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G5 — Network read
  it("G5: Network read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.example.com" }],
    })

    const request = makeRequest({
      tool: "web_fetch",
      action: "network.read",
      resource: { kind: "network", host: "api.example.com" },
      networkDestination: "api.example.com",
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "fetched" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G6 — Git commit
  it("G6: Git commit → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["git.commit"],
      resources: [{ kind: "git", pattern: "packages/**" }],
    })

    const request = makeRequest({
      tool: "git_commit",
      action: "git.commit",
      resource: { kind: "git", path: "packages/engine" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "committed" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G7 — Wildcard resource match
  it("G7: Wildcard resource match → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "*" }],
    })

    const request = makeRequest({
      resource: { kind: "file", path: "any/path/file.ts" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G8 — Multiple grants, one matches
  it("G8: Multiple grants, one matches → ALLOW, executor calls = 1", async () => {
    const grants = [
      makeGrant({ id: "g1", actions: ["filesystem.write"], resources: [{ kind: "file", pattern: "packages/core/**" }] }),
      makeGrant({ id: "g2", actions: ["filesystem.read"], resources: [{ kind: "file", pattern: "packages/engine/**" }] }),
      makeGrant({ id: "g3", actions: ["process.execute"], resources: [{ kind: "process", pattern: "*" }] }),
    ]

    const request = makeRequest({
      resource: { kind: "file", path: "packages/engine/src/foo.ts" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext(grants)) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G9 — Subdirectory path match
  it("G9: Subdirectory path match → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      resources: [{ kind: "file", pattern: "packages/engine" }],
    })

    const request = makeRequest({
      resource: { kind: "file", path: "packages/engine/src/deep/file.ts" },
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G10 — Empty provenance (default)
  it("G10: Default provenance USER_INSTRUCTION → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant()

    const request = makeRequest({
      provenance: ["USER_INSTRUCTION"],
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G11 — Tool output with read action
  it("G11: TOOL_OUTPUT + filesystem.read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant()

    const request = makeRequest({
      provenance: ["TOOL_OUTPUT"],
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G12 — Model output with read action
  it("G12: MODEL_OUTPUT + filesystem.read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant()

    const request = makeRequest({
      provenance: ["MODEL_OUTPUT"],
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "read" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G13 — Delegate action
  it("G13: Delegate action → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["delegate"],
      resources: [{ kind: "process", pattern: "*" }],
    })

    const request = makeRequest({
      tool: "delegate_task",
      action: "delegate",
      resource: { kind: "process", executable: "bun" },
      executable: "bun",
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "delegated" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // G14 — Send message
  it("G14: Send message → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      tool: "send_message",
      action: "network.write",
      resource: { kind: "network", host: "telegram" },
      networkDestination: "telegram",
    })

    let executorCalls = 0
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(
        { request, executeExact: () => { executorCalls++; return "sent" } },
        { snapshot: () => Effect.succeed(makeContext([grant])) },
      ),
    )

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })
})
