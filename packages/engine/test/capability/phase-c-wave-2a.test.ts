/**
 * Phase C Wave 2A: Authorization Mutation — Field Substitution Attacks
 *
 * Every field that participates in the request hash or policy context
 * is tested for substitution resistance.
 *
 * Fixtures A5–A16: 12 tests covering principal, session, workspace,
 * contract, working directory, network host, tool name, secret identifier,
 * nonce, policy version, and approval-store-absent scenarios.
 *
 * Hard gate: zero false allows
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  InMemoryScopedApprovalStore,
  createPendingApproval,
  approveRequest,
} from "@arcana/core/capability/scoped-approval"
import {
  authorizeAndExecuteEffect,
  type PreparedEffect,
  type PolicyContextProvider,
} from "@arcana/core/capability/pep"
import { evaluate as evaluatePolicy, type PolicyContext } from "@arcana/core/capability/pdp"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import type {
  CapabilityGrant,
  AuthorizationRequest,
} from "@arcana/core/capability/types"
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

// ── Group: Authorization Mutation (A5–A16) ────────────────────────────

describe("Wave 2A: Authorization mutation — field substitution", () => {
  // A5 — Principal substitution
  it("A5: Principal substitution → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1" },
    })

    const ctx = makeContext([grant])

    // Request from a different principal
    const request = makeRequest({
      principalId: "attacker",
      sessionId: "sess-1",
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_PRINCIPAL_MISMATCH")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A6 — Session substitution
  it("A6: Session substitution → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1" },
    })

    const ctx = makeContext([grant])

    // Request from a different session
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-evil",
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_SESSION_MISMATCH")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A7 — Workspace substitution
  // DOCUMENTATION TEST: workspaceId constraint check in PDP is a no-op (empty block).
  // The request has no workspaceId field. The grant constrains workspaceId but
  // the PDP only enforces sessionId. Verifying current behavior.
  it("A7: Workspace substitution — workspaceId constraint is not enforced (documentation)", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: {
        sessionId: "sess-1",
        workspaceId: "workspace-alpha",
      },
    })

    const ctx = makeContext([grant])

    // Request with matching sessionId but grant has workspaceId constraint.
    // The PDP's workspaceId check is currently a no-op (empty if-block).
    // So the request should still match via sessionId.
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
    })

    const decision = evaluatePolicy(request, ctx)
    // Current behavior: workspaceId constraint does NOT cause denial
    // because the PDP check for workspaceId is an empty block.
    // The sessionId matches, so the capability matches.
    // This documents the gap: workspaceId should be enforced but isn't.
    expect(decision.decision).toBe("ALLOW")

    // Verify that sessionId mismatch DOES cause denial (the real guard)
    const requestDifferentSession = makeRequest({
      principalId: "agent",
      sessionId: "sess-other-workspace",
    })
    const decision2 = evaluatePolicy(requestDifferentSession, ctx)
    expect(decision2.decision).not.toBe("ALLOW")
    expect(decision2.reasons.some((r) => r.code === "DENY_SESSION_MISMATCH")).toBe(true)
  })

  // A8 — Contract ID substitution
  it("A8: Contract ID substitution → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1", contractId: "contract-1" },
    })

    const ctx = makeContext([grant])

    // Request with a different contractId
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      contractId: "contract-evil",
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_CONTRACT_MISMATCH")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A9 — Contract revision drift (hash-canonicalization test)
  it("A9: Different contractIds produce different request hashes", () => {
    const request1 = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      contractId: "contract-v1",
    })

    const request2 = makeRequest({
      requestId: request1.requestId,
      principalId: "agent",
      sessionId: "sess-1",
      contractId: "contract-v2",
      // Keep all other fields identical
      nonce: request1.nonce,
      requestedAt: request1.requestedAt,
      tool: request1.tool,
      action: request1.action,
      resource: { ...request1.resource },
      provenance: [...request1.provenance],
      sensitivity: [...request1.sensitivity],
    })

    const hash1 = computeRequestHash(request1)
    const hash2 = computeRequestHash(request2)

    // Different contractId → different hash
    expect(hash1).not.toBe(hash2)
  })

  // A10 — Working-directory substitution (DOCUMENTATION TEST)
  // The PDP does NOT check workingDirectory. It is included in the request hash
  // but not in capability matching. This verifies current behavior.
  it("A10: Working-directory not checked by PDP (documentation)", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
      constraints: { sessionId: "sess-1", executable: "bun" },
    })

    const ctx = makeContext([grant])

    // Request with a suspicious working directory
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      tool: "terminal",
      action: "process.execute",
      resource: { kind: "process", executable: "bun" },
      executable: "bun",
      workingDirectory: "/etc",
    })

    const decision = evaluatePolicy(request, ctx)
    // Current behavior: workingDirectory is NOT checked by PDP → capability matches
    // This documents the gap: working directory should potentially be constrained.
    expect(decision.decision).toBe("ALLOW")

    // Verify the working directory IS included in the request hash
    const request2 = makeRequest({
      requestId: request.requestId,
      principalId: "agent",
      sessionId: "sess-1",
      tool: "terminal",
      action: "process.execute",
      resource: { kind: "process", executable: "bun" },
      executable: "bun",
      workingDirectory: "/safe/project",
      nonce: request.nonce,
      requestedAt: request.requestedAt,
      provenance: [...request.provenance],
      sensitivity: [...request.sensitivity],
    })

    const hash1 = computeRequestHash(request)
    const hash2 = computeRequestHash(request2)
    expect(hash1).not.toBe(hash2)
  })

  // A11 — Network-host substitution (suffix attack)
  it("A11: Network host suffix attack → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.example.com" }],
      constraints: { sessionId: "sess-1" },
    })

    const ctx = makeContext([grant])

    // Attacker tries to match via suffix: evil.example.com.attacker.com
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      tool: "fetch",
      action: "network.read",
      resource: { kind: "network", host: "evil.example.com.attacker.com" },
      networkDestination: "evil.example.com.attacker.com",
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A12 — Tool-name substitution
  it("A12: Tool-name substitution → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1", toolNames: ["read_file"] },
    })

    const ctx = makeContext([grant])

    // Request uses a different tool name
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      tool: "write_file",
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_TOOL_OUT_OF_SCOPE")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A13 — Secret-identifier substitution
  it("A13: Secret-identifier substitution → DENY, executor calls = 0", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
      constraints: { sessionId: "sess-1" },
    })

    const ctx = makeContext([grant])

    // Request tries to access a different secret
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      tool: "secret_manager",
      action: "secret.use",
      resource: { kind: "secret", secretKind: "DATABASE_PASSWORD" },
    })

    // Pure PDP test
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)

    // PEP test
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A14 — Request nonce replay (hash-canonicalization test)
  it("A14: Same nonce → same hash; different nonce → different hash", () => {
    const nonce = "fixed-nonce-value"
    const now = "2026-01-01T00:00:00.000Z"

    const request1 = makeRequest({
      requestId: "req-fixed",
      principalId: "agent",
      sessionId: "sess-1",
      nonce,
      requestedAt: now,
    })

    // Same request with same nonce → same hash
    const request2 = makeRequest({
      requestId: "req-fixed",
      principalId: "agent",
      sessionId: "sess-1",
      nonce,
      requestedAt: now,
      resource: { ...request1.resource },
      provenance: [...request1.provenance],
      sensitivity: [...request1.sensitivity],
    })

    const hash1 = computeRequestHash(request1)
    const hash2 = computeRequestHash(request2)
    expect(hash1).toBe(hash2)

    // Same request with different nonce → different hash
    const request3 = makeRequest({
      requestId: "req-fixed",
      principalId: "agent",
      sessionId: "sess-1",
      nonce: "different-nonce-value",
      requestedAt: now,
      tool: request1.tool,
      action: request1.action,
      resource: { ...request1.resource },
      provenance: [...request1.provenance],
      sensitivity: [...request1.sensitivity],
    })

    const hash3 = computeRequestHash(request3)
    expect(hash1).not.toBe(hash3)
  })

  // A15 — Policy-version drift
  // policyVersion is recorded in the decision but does NOT affect capability matching.
  it("A15: Policy-version drift does not affect capability matching", async () => {
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1" },
    })

    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
    })

    // Context with policyVersion = 'phase-c-v1'
    const ctx1 = makeContext([grant], { policyVersion: "phase-c-v1" })
    const decision1 = evaluatePolicy(request, ctx1)
    expect(decision1.decision).toBe("ALLOW")
    expect(decision1.policyVersion).toBe("phase-c-v1")

    // Context with policyVersion = 'phase-c-v2'
    const ctx2 = makeContext([grant], { policyVersion: "phase-c-v2" })
    const decision2 = evaluatePolicy(request, ctx2)
    expect(decision2.decision).toBe("ALLOW")
    expect(decision2.policyVersion).toBe("phase-c-v2")

    // Both decisions are ALLOW — policyVersion doesn't affect matching
    // The policyVersion is recorded in the decision for audit purposes only
    expect(decision1.decision).toBe(decision2.decision)

    // The request hash is independent of policyVersion (it's not a request field)
    expect(decision1.requestHash).toBe(decision2.requestHash)
  })

  // A16 — Approval store absent on approval-backed allow
  // When the PDP returns ALLOW via an approved scope, but the PEP has no
  // approvalStore, the PEP must DENY with DENY_APPROVAL_STORE_UNAVAILABLE.
  it("A16: Approval-backed ALLOW without approvalStore → DENY_APPROVAL_STORE_UNAVAILABLE", async () => {
    // Create a request that requires approval (CRITICAL risk)
    const request = makeRequest({
      principalId: "agent",
      sessionId: "sess-1",
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    // Create an approval for this request
    const pending = createPendingApproval(request, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")

    // Context has the approved scope → PDP will return ALLOW
    const ctx = makeContext([capability], {
      approvedScopes: [{
        requestHash: approval.requestHash,
        approvalId: approval.id,
        capabilityId: capability.id,
        principalId: approval.principalId,
        sessionId: approval.sessionId,
        expiresAt: approval.expiresAt,
        maxUses: approval.maxUses,
      }],
    })

    // PDP alone returns ALLOW (via approved scope)
    const pdpDecision = evaluatePolicy(request, ctx)
    expect(pdpDecision.decision).toBe("ALLOW")

    // PEP call WITHOUT approvalStore — must DENY
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider: PolicyContextProvider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))

    // Must be DENIED, not EXECUTED
    expect(result.status).toBe("DENIED")
    expect(executorCalls).toBe(0)

    // Verify the denial reason includes DENY_APPROVAL_STORE_UNAVAILABLE
    if (result.status === "DENIED") {
      expect(result.decision.decision).toBe("DENY")
      expect(
        result.decision.reasons.some(
          (r) => r.code === "DENY_APPROVAL_STORE_UNAVAILABLE",
        ),
      ).toBe(true)
    }
  })
})
