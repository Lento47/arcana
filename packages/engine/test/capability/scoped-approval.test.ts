import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  createPendingApproval,
  approveRequest,
  claimApproval,
  consumeApproval,
  validateApprovalMatch,
  checkApprovedScope,
  InMemoryScopedApprovalStore,
} from "@arcana/core/capability/scoped-approval"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { AuthorizationRequest } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeRequest(overrides: Record<string, unknown> = {}): AuthorizationRequest {
  return buildAuthorizationRequest({
    toolName: "git_push",
    principalId: "agent:main",
    sessionId: "sess-001",
    args: {},
    ...overrides,
  })
}

// ── Decisive Fixture: git push origin feature-x ───────────────────────

describe("Decisive fixture: scoped approval for git push", () => {
  test("PDP returns REQUIRE_APPROVAL → user approves → single-use execution", () => {
    const store = new InMemoryScopedApprovalStore()

    // Step 1: Agent requests git push origin feature-x
    const request = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: { remote: "origin", branch: "feature-x" },
    })

    // Step 2: PDP returns REQUIRE_APPROVAL
    // The runtime creates a pending approval
    const pending = createPendingApproval(request, "evt-create", 3600)
    Effect.runSync(store.putApproval(pending))
    expect(pending.decision).toBe("PENDING")
    expect(pending.requestHash).toBe(computeRequestHash(request))

    // Step 3: User approves the exact request
    const { approval, capability } = approveRequest(pending, "evt-approve", 300)
    Effect.runSync(store.updateApproval(approval.id, approval))
    expect(approval.decision).toBe("APPROVED")
    expect(capability.constraints.maxUses).toBe(1)
    expect(capability.actions).toContain("git.push")

    // Step 4: Agent retries the SAME request → approval matches
    const validation = validateApprovalMatch(approval, request, new Date().toISOString())
    expect(validation.valid).toBe(true)

    // Step 5: Execute once → claim → consume
    const claimed = claimApproval(approval, "evt-claim", "exec-1", new Date().toISOString())
    expect(claimed).not.toBeNull()
    expect(claimed!.decision).toBe("CLAIMED")

    const consumed = consumeApproval(claimed!, "evt-consume", new Date().toISOString())
    expect(consumed).not.toBeNull()
    expect(consumed!.decision).toBe("CONSUMED")
    expect(consumed!.maxUses).toBe(1)
    expect(consumed!.usesConsumed).toBe(1)

    // Step 6: Second execution → DENY (already consumed)
    const secondAttempt = consumeApproval(consumed!, "evt-consume-2", new Date().toISOString())
    expect(secondAttempt).toBeNull()
  })

  test("agent changes request to git push origin main → DENY_REQUEST_HASH_MISMATCH", () => {
    const store = new InMemoryScopedApprovalStore()

    // Original request: git push origin feature-x
    const originalRequest = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: { remote: "origin", branch: "feature-x" },
    })

    // Create and approve
    const pending = createPendingApproval(originalRequest, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // Agent changes request to git push origin main
    const modifiedRequest = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: { remote: "origin", branch: "main" },
    })

    // Validation fails — request hash mismatch
    const validation = validateApprovalMatch(approval, modifiedRequest, new Date().toISOString())
    expect(validation.valid).toBe(false)
    expect(validation.reason).toBe("DENY_REQUEST_HASH_MISMATCH")
  })

  test("agent retries approved feature-x push → first ALLOW, second DENY", () => {
    const store = new InMemoryScopedApprovalStore()

    const request = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: { remote: "origin", branch: "feature-x" },
    })

    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // First execution → claim → consume
    const claimed = claimApproval(approval, "evt-claim-1", "exec-1", new Date().toISOString())
    expect(claimed).not.toBeNull()

    const first = consumeApproval(claimed!, "evt-consume-1", new Date().toISOString())
    expect(first).not.toBeNull()
    expect(first!.decision).toBe("CONSUMED")

    // Second execution → DENY
    const second = consumeApproval(first!, "evt-consume-2", new Date().toISOString())
    expect(second).toBeNull()
  })

  test("changing principal invalidates approval (hash mismatch)", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")

    // Different principal → different request hash
    const differentRequest = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:EVIL",
      sessionId: "sess-001",
      args: {},
    })

    const validation = validateApprovalMatch(approval, differentRequest, new Date().toISOString())
    expect(validation.valid).toBe(false)
    // Hash check fires first (includes principal)
    expect(validation.reason).toBe("DENY_REQUEST_HASH_MISMATCH")
  })

  test("changing session invalidates approval (hash mismatch)", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")

    // Different session → different request hash
    const differentRequest = buildAuthorizationRequest({
      toolName: "git_push",
      principalId: "agent:main",
      sessionId: "sess-DIFFERENT",
      args: {},
    })

    const validation = validateApprovalMatch(approval, differentRequest, new Date().toISOString())
    expect(validation.valid).toBe(false)
    // Hash check fires first (includes session)
    expect(validation.reason).toBe("DENY_REQUEST_HASH_MISMATCH")
  })

  test("changing resource kind invalidates approval", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")

    const differentRequest = buildAuthorizationRequest({
      toolName: "terminal",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: { command: "git push origin main" },
    })

    const validation = validateApprovalMatch(approval, differentRequest, new Date().toISOString())
    expect(validation.valid).toBe(false)
  })

  test("expired approval → invalid", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve", 300)

    // Simulate: now is AFTER the expiry
    const futureTime = new Date(Date.parse(approval.expiresAt) + 10000).toISOString()
    const validation = validateApprovalMatch(approval, request, futureTime)
    expect(validation.valid).toBe(false)
    expect(validation.reason).toContain("expired")
  })

  test("PENDING approval → not valid for execution", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")

    const validation = validateApprovalMatch(pending, request, new Date().toISOString())
    expect(validation.valid).toBe(false)
    expect(validation.reason).toContain("PENDING")
  })

  test("REJECTED approval → not valid for execution", () => {
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const rejected = { ...pending, decision: "REJECTED" as const }

    const validation = validateApprovalMatch(rejected, request, new Date().toISOString())
    expect(validation.valid).toBe(false)
    expect(validation.reason).toContain("REJECTED")
  })
})

// ── checkApprovedScope ────────────────────────────────────────────────

describe("checkApprovedScope: PDP integration", () => {
  test("approved request → hasApproval = true", () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest()

    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    const result = Effect.runSync(checkApprovedScope(request, store, new Date().toISOString()))
    expect(result.hasApproval).toBe(true)
    expect(result.approval!.id).toBe(approval.id)
  })

  test("no approval found → hasApproval = false", () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest()

    const result = Effect.runSync(checkApprovedScope(request, store, new Date().toISOString()))
    expect(result.hasApproval).toBe(false)
    expect(result.reason).toContain("No approval found")
  })

  test("consumed approval → hasApproval = false", () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest()

    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    const claimed = claimApproval(approval, "evt-claim", "exec-1", new Date().toISOString())!
    const consumed = consumeApproval(claimed, "evt-consume", new Date().toISOString())!
    Effect.runSync(store.putApproval(consumed))

    const result = Effect.runSync(checkApprovedScope(request, store, new Date().toISOString()))
    expect(result.hasApproval).toBe(false)
  })
})
