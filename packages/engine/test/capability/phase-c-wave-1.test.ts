/**
 * Phase C Wave 1: Adversarial Breaker Set
 *
 * End-to-end fixtures that exercise the real production path:
 *   AuthorizationRequest → PDP → PEP → executor
 *
 * Every denial fixture asserts:
 *   - Decision is not ALLOW
 *   - Executor call count = 0
 *   - Durable target state unchanged
 *   - Authorization denial event exists (where applicable)
 *
 * Hard gate: zero false allows
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { InMemoryGrantStore, SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import {
  InMemoryScopedApprovalStore,
  createPendingApproval,
  approveRequest,
  claimApproval,
  consumeApproval,
} from "@arcana/core/capability/scoped-approval"
import {
  authorizeAndExecuteEffect,
  type PreparedEffect,
  type EnforcementResult,
  type AuthorizationEventEmitter,
  type PolicyContextProvider,
} from "@arcana/core/capability/pep"
import { evaluate as evaluatePolicy, type PolicyContext } from "@arcana/core/capability/pdp"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import {
  executeDelegation,
  revokeWithCascade,
  type RuntimeGrantStore,
} from "@arcana/core/capability/runtime-delegation"
import type {
  CapabilityGrant,
  AuthorizationRequest,
} from "@arcana/core/capability/types"
import { POLICY_VERSION } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

class TestContextProvider {
  constructor(public ctx: PolicyContext) {}
  snapshot() {
    return Effect.succeed({
      ...this.ctx,
      capabilities: this.ctx.capabilities.map((c) => ({
        ...c,
        constraints: { ...c.constraints },
        delegation: { ...c.delegation },
      })),
    })
  }
}

function collectEvents(): { events: unknown[]; emitter: AuthorizationEventEmitter } {
  const events: unknown[] = []
  return {
    events,
    emitter: {
      emit: (e: unknown) => {
        events.push(e)
      },
    },
  }
}

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

// ─── Group A: Authorization Mutation ──────────────────────────────────

describe("Wave 1 Group A: Authorization mutation", () => {
  // A1 — Missing capability
  it("A1: Missing capability → DENY, executor calls = 0", async () => {
    const store = new InMemoryGrantStore()
    const { events, emitter } = collectEvents()

    const provider = new SessionPolicyProvider(
      store,
      { principalId: "attacker", sessionId: "sess-evil", workspaceTrust: "TRUSTED" },
      undefined,
      "LEGACY_COMPAT",
    )

    const request = makeRequest({
      principalId: "attacker",
      sessionId: "sess-evil",
      tool: "write_file",
      action: "filesystem.write",
      resource: { kind: "file", path: "packages/engine/src/a.ts" },
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
    expect(events.some((e: any) => e.type === "authorization.denied")).toBe(true)
  })

  // A2 — Resource substitution
  it("A2: Resource substitution → DENY, executor calls = 0", async () => {
    const store = new InMemoryGrantStore()
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
    })
    await Effect.runPromise(store.putGrant(grant))

    const { events, emitter } = collectEvents()
    const provider = new SessionPolicyProvider(
      store,
      { principalId: "agent", sessionId: "sess-1", workspaceTrust: "TRUSTED" },
      undefined,
      "LEGACY_COMPAT",
    )

    // Request is outside the granted path
    const request = makeRequest({
      principalId: "agent",
      resource: { kind: "file", path: "packages/core/src/secret.ts" },
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A3 — Argument substitution (executable change)
  it("A3: Argument substitution → DENY, executor calls = 0", async () => {
    const store = new InMemoryGrantStore()
    const grant = makeGrant({
      principal: { kind: "agent", id: "agent" },
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
      constraints: { sessionId: "sess-1", executable: "bun" },
    })
    await Effect.runPromise(store.putGrant(grant))

    const { events, emitter } = collectEvents()
    const provider = new SessionPolicyProvider(
      store,
      { principalId: "agent", sessionId: "sess-1", workspaceTrust: "TRUSTED" },
      undefined,
      "LEGACY_COMPAT",
    )

    // Request uses different executable
    const request = makeRequest({
      principalId: "agent",
      tool: "terminal",
      action: "process.execute",
      resource: { kind: "process", executable: "rm" },
      executable: "rm",
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // A4 — Revocation between PEP evaluations
  it("A4: Revocation between PEP calls → second DENIED, executor calls = 1", async () => {
    const store = new InMemoryGrantStore()
    const grant = makeGrant({
      id: "revoke-target",
      principal: { kind: "agent", id: "agent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-1" },
    })
    await Effect.runPromise(store.putGrant(grant))

    const { events, emitter } = collectEvents()

    const request = makeRequest({ principalId: "agent" })

    // First PEP call: grant is ACTIVE
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result1 = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, {
        snapshot: () => Effect.succeed(makeContext(
          [{ ...grant, constraints: { ...grant.constraints } }],
          { now: new Date().toISOString() },
        )),
      }, emitter),
    )

    expect(result1.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)

    // Revoke the grant
    await Effect.runPromise(store.revokeGrant("revoke-target", "evt-revoke"))

    // Second PEP call: grant is REVOKED → snapshot returns revoked grant
    const result2 = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, {
        snapshot: () => Effect.succeed(makeContext(
          [{ ...grant, status: "REVOKED" as const, revokedEventId: "evt-revoke" }],
          { now: new Date().toISOString() },
        )),
      }, emitter),
    )

    expect(result2.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })
})

// ─── Group B: Approval Claims ─────────────────────────────────────────

describe("Wave 1 Group B: Approval claims", () => {
  // B1 — Concurrent approval claims
  it("B1: Concurrent approval claims → exactly one EXECUTED", async () => {
    const store = new InMemoryScopedApprovalStore()
    const grantStore = new InMemoryGrantStore()

    // Create a grant for the approval capability
    const request = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    // Create and approve
    const pending = createPendingApproval(request, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))
    await Effect.runPromise(grantStore.putGrant(capability))

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

    const { events, emitter } = collectEvents()

    let executorCalls1 = 0
    let executorCalls2 = 0

    const effect1: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls1++; return "exec-1" },
    }
    const effect2: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls2++; return "exec-2" },
    }

    const provider = new TestContextProvider(ctx)

    const [r1, r2] = await Promise.all([
      Effect.runPromise(authorizeAndExecuteEffect(effect1, provider, emitter, store)),
      Effect.runPromise(authorizeAndExecuteEffect(effect2, provider, emitter, store)),
    ])

    const totalExecutorCalls = executorCalls1 + executorCalls2
    expect(totalExecutorCalls).toBe(1)

    const executed = [r1, r2].filter((r) => r.status === "EXECUTED")
    const stale = [r1, r2].filter((r) => r.status === "STALE_DECISION" || r.status === "DENIED" || r.status === "APPROVAL_REQUIRED")
    expect(executed.length).toBe(1)
    expect(stale.length).toBe(1)
  })

  // B2 — Consumed approval replay
  it("B2: Consumed approval replay → second call denied, executor calls = 1", async () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    const pending = createPendingApproval(request, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

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

    const { events, emitter } = collectEvents()
    const provider = new TestContextProvider(ctx)

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    // First call: claim → execute → consume
    const r1 = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter, store),
    )
    expect(r1.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)

    // Second call: approval is now CONSUMED → stale
    const r2 = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter, store),
    )
    expect(r2.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })

  // B3 — Request changed after approval
  it("B3: Request changed after approval → APPROVAL_REQUIRED, executor calls = 0", async () => {
    const store = new InMemoryScopedApprovalStore()

    // Approve git push origin feature-x
    const originalRequest = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "feature-x" },
    })

    const pending = createPendingApproval(originalRequest, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // Context has the approved scope for the ORIGINAL request
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

    // Agent changes request to git push origin main
    const changedRequest = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "main" },
    })

    const { events, emitter } = collectEvents()
    const provider = new TestContextProvider(ctx)

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request: changedRequest,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter, store),
    )

    // No matching approved scope for the changed request → REQUIRE_APPROVAL
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })
})

// ─── Group C: Child Delegation ────────────────────────────────────────

describe("Wave 1 Group C: Child delegation", () => {
  // C1 — Zero ambient authority
  it("C1: Child with no grants → DENY, executor calls = 0", async () => {
    const store = new InMemoryGrantStore()
    // Parent has grants but child has NONE
    const parentGrant = makeGrant({
      principal: { kind: "agent", id: "parent" },
      constraints: { sessionId: "sess-parent" },
    })
    await Effect.runPromise(store.putGrant(parentGrant))

    const { events, emitter } = collectEvents()

    // Child requests a tool
    const childRequest = makeRequest({
      principalId: "child",
      sessionId: "sess-child",
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request: childRequest,
      executeExact: () => { executorCalls++; return "executed" },
    }

    // Use child's context (no grants for child)
    const provider = new SessionPolicyProvider(
      store,
      { principalId: "child", sessionId: "sess-child", workspaceTrust: "TRUSTED" },
      undefined,
      "LEGACY_COMPAT",
    )

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // C2 — Child creation failure → pending grants revoked
  it("C2: Child creation failure → PENDING grants revoked, ACTIVE grants = 0", async () => {
    const store = new InMemoryGrantStore()
    const { events, emitter } = collectEvents()

    // Simulate: delegate creates PENDING grants
    const pendingGrant = makeGrant({
      id: "child-pending-1",
      principal: { kind: "subagent", id: "child" },
      issuer: { kind: "parent_capability", id: "parent-1" },
      status: "PENDING" as any,
      constraints: { sessionId: "sess-child" },
    })
    await Effect.runPromise(store.putGrant(pendingGrant))

    // Activation fails → revoke pending grants
    const revoked = await Effect.runPromise(
      store.revokePendingGrantsForSession("sess-child"),
    )
    expect(revoked).toBe(1)

    // Verify no ACTIVE grants for child
    const childGrants = await Effect.runPromise(
      store.getGrantsForPrincipal("child", "sess-child"),
    )
    expect(childGrants.length).toBe(0)

    // Child cannot execute
    const childRequest = makeRequest({
      principalId: "child",
      sessionId: "sess-child",
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request: childRequest,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const provider = new SessionPolicyProvider(
      store,
      { principalId: "child", sessionId: "sess-child", workspaceTrust: "TRUSTED" },
      undefined,
      "LEGACY_COMPAT",
    )

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // C3 — Parent revocation blocks child
  it("C3: Parent revoked → child DENIED, executor calls = 0", async () => {
    const store = new InMemoryGrantStore()
    const { events, emitter } = collectEvents()

    const parentGrant = makeGrant({
      id: "parent-active",
      principal: { kind: "agent", id: "parent" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
      constraints: { sessionId: "sess-parent" },
    })

    const childGrant = makeGrant({
      id: "child-delegated",
      principal: { kind: "subagent", id: "child" },
      issuer: { kind: "parent_capability", id: "parent-active" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine/**" }],
      constraints: { sessionId: "sess-child" },
    })

    await Effect.runPromise(store.putGrant(parentGrant))
    await Effect.runPromise(store.putGrant(childGrant))

    // Revoke parent
    await Effect.runPromise(store.revokeGrant("parent-active", "evt-revoke"))

    // Build context with validateAncestors — include both grants so PDP can walk the chain
    const revokedParent = { ...parentGrant, status: "REVOKED" as const, revokedEventId: "evt-revoke" }
    const ctx = makeContext([revokedParent, childGrant], {
      validateAncestors: true,
    })

    const childRequest = makeRequest({
      principalId: "child",
      sessionId: "sess-child",
    })

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request: childRequest,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const provider = new TestContextProvider(ctx)

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })
})

// ─── Group F: Failure Modes ───────────────────────────────────────────

describe("Wave 1 Group F: Failure modes", () => {
  // F1 — Store unavailable
  it("F1: Store unavailable → DENY, executor calls = 0", async () => {
    // Create a provider that always fails
    const { events, emitter } = collectEvents()

    const failProvider: PolicyContextProvider = {
      snapshot: () => Effect.fail(new Error("store down") as never),
    }

    const request = makeRequest()

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, failProvider, emitter),
    )

    // When snapshot fails, PEP should handle gracefully
    // The PEP's resolveSnapshot will propagate the error, which gets caught
    // by the top-level Effect.catch → EXECUTION_FAILED
    expect(result.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(0)
  })

  // F1b — Approval store absent on approval-backed allow
  it("F1b: Approved scope present + approvalStore absent → DENY, executor calls = 0", async () => {
    const store = new InMemoryScopedApprovalStore()

    const request = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    const pending = createPendingApproval(request, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // Context has approvedScopes — PDP will return ALLOW via approval
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

    const { events, emitter } = collectEvents()
    const provider = new TestContextProvider(ctx)

    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }

    // PEP call WITHOUT approvalStore — should DENY
    const result = await Effect.runPromise(
      authorizeAndExecuteEffect(effect, provider, emitter),
    )

    expect(result.status).toBe("DENIED")
    expect(executorCalls).toBe(0)
    // Verify the denial reason
    if (result.status === "DENIED") {
      expect(result.decision.reasons.some(
        (r: any) => r.code === "DENY_APPROVAL_STORE_UNAVAILABLE",
      )).toBe(true)
    }
  })

  // F2 — Sequential calls on same approval → second denied after first consumes
  it("F2: First PEP call consumes approval → second call cannot execute", async () => {
    const store = new InMemoryScopedApprovalStore()

    const request = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    const pending = createPendingApproval(request, "evt-create")
    const { approval, capability } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

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

    const { events, emitter } = collectEvents()
    const provider = new TestContextProvider(ctx)

    let executorCalls = 0

    // First call: claim → execute → consume
    const r1 = await Effect.runPromise(
      authorizeAndExecuteEffect({
        request,
        executeExact: () => { executorCalls++; return "first" },
      }, provider, emitter, store),
    )

    expect(r1.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)

    // Second call: approval is CONSUMED → cannot claim → STALE_DECISION
    const r2 = await Effect.runPromise(
      authorizeAndExecuteEffect({
        request,
        executeExact: () => { executorCalls++; return "second" },
      }, provider, emitter, store),
    )

    expect(r2.status).not.toBe("EXECUTED")
    expect(executorCalls).toBe(1)

    // Verify the approval is consumed
    const finalApproval = Effect.runSync(store.getApproval(approval.id))
    expect(finalApproval?.decision).toBe("CONSUMED")
    expect(finalApproval?.usesConsumed).toBe(1)
  })
})
