/**
 * Phase C Wave 4: Workspace, MCP, Evidence, and Recovery
 *
 * Tests workspace containment, MCP trust, and crash recovery.
 *
 * Groups:
 * 4A — Workspace containment
 * 4B — MCP trust
 * 4C — Evidence and crash recovery
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { InMemoryGrantStore } from "@arcana/core/capability/grant-store"
import { evaluate as evaluatePolicy, type PolicyContext } from "@arcana/core/capability/pdp"
import type { CapabilityGrant, AuthorizationRequest } from "@arcana/core/capability/types"
import { POLICY_VERSION } from "@arcana/core/capability/types"
import { canonicalizePath, isSegmentSubset, validateCanonicalResource, isCanonicalResourceNarrowerOrEqual } from "@arcana/core/capability/canonical-resource"
import {
  InMemoryScopedApprovalStore,
  createPendingApproval,
  approveRequest,
  claimApproval,
  consumeApproval,
} from "@arcana/core/capability/scoped-approval"
import {
  InMemoryChildLaunchBarrier,
} from "@arcana/core/capability/child-launch-barrier"

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

// ─── 4A: Workspace Containment ────────────────────────────────────────

describe("Wave 4A: Workspace containment", () => {
  it("E1: Same principal + same session + wrong workspace → DENY_WORKSPACE_MISMATCH", () => {
    const grant = makeGrant({
      constraints: { sessionId: "sess-1", workspaceId: "workspace-alpha" },
    })

    const request = makeRequest({
      workspaceId: "workspace-beta" as any,
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_WORKSPACE_MISMATCH")).toBe(true)
  })

  it("E2: Matching workspace → ALLOW", () => {
    const grant = makeGrant({
      constraints: { sessionId: "sess-1", workspaceId: "workspace-alpha" },
    })

    const request = makeRequest({
      workspaceId: "workspace-alpha" as any,
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("ALLOW")
  })

  it("E3: Grant without workspaceId + request with workspaceId → ALLOW (backward compatible)", () => {
    const grant = makeGrant({
      constraints: { sessionId: "sess-1" },
    })

    const request = makeRequest({
      workspaceId: "workspace-alpha" as any,
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("ALLOW")
  })

  it("E4: Prefix-confusion directory → isSegmentSubset prevents escape", () => {
    // 'packages/engine-malicious' is NOT under 'packages/engine'
    expect(isSegmentSubset("packages/engine-malicious", "packages/engine")).toBe(false)
    // 'packages/engine/src' IS under 'packages/engine'
    expect(isSegmentSubset("packages/engine/src", "packages/engine")).toBe(true)
    // 'packages/engine' IS under 'packages'
    expect(isSegmentSubset("packages/engine", "packages")).toBe(true)
  })

  it("E5: Symlink-like path with .. → canonicalizePath rejects", () => {
    const canonical = canonicalizePath("packages/engine/../../etc/passwd")
    expect(canonical).toBe("")
  })

  it("E6: Canonical path normalization", () => {
    // '..' traversal is rejected (returns empty string)
    expect(canonicalizePath("packages/engine/../core")).toBe("")
    expect(canonicalizePath("packages/engine/./src")).toBe("packages/engine/src")
    expect(canonicalizePath("packages/engine/")).toBe("packages/engine")
    expect(canonicalizePath("packages\\\\engine\\\\src")).toBe("packages/engine/src")
    expect(canonicalizePath("packages//engine//src")).toBe("packages/engine/src")
  })

  it("E7: validateCanonicalResource rejects traversal", () => {
    expect(validateCanonicalResource({ kind: "file", path: "packages/engine/../../etc" })).not.toBeNull()
    expect(validateCanonicalResource({ kind: "file", path: "packages/engine/src" })).toBeNull()
    expect(validateCanonicalResource({ kind: "file" })).toBeNull()
  })

  it("E8: isCanonicalResourceNarrowerOrEqual prevents prefix confusion", () => {
    // 'packages/engine/src' ⊆ 'packages/engine' → true
    expect(isCanonicalResourceNarrowerOrEqual(
      { kind: "file", path: "packages/engine/src" },
      { kind: "file", path: "packages/engine" },
    )).toBe(true)

    // 'packages/engine-malicious' ⊆ 'packages/engine' → false
    expect(isCanonicalResourceNarrowerOrEqual(
      { kind: "file", path: "packages/engine-malicious" },
      { kind: "file", path: "packages/engine" },
    )).toBe(false)

    // '..' traversal in child → false
    expect(isCanonicalResourceNarrowerOrEqual(
      { kind: "file", path: "packages/engine/../../etc" },
      { kind: "file", path: "packages" },
    )).toBe(false)

    // Wildcard parent → true
    expect(isCanonicalResourceNarrowerOrEqual(
      { kind: "file", path: "packages/engine/src" },
      { kind: "file", path: "*" },
    )).toBe(true)
  })

  it("E9: Segment-based comparison prevents prefix confusion", () => {
    // These are the critical prefix-confusion cases
    expect(isSegmentSubset("packages/core", "packages/co")).toBe(false)
    expect(isSegmentSubset("packages/core", "packages/core")).toBe(true)
    expect(isSegmentSubset("packages/core/src", "packages/core")).toBe(true)
    expect(isSegmentSubset("packages/core-evil", "packages/core")).toBe(false)
  })
})

// ─── 4B: MCP Trust ────────────────────────────────────────────────────

describe("Wave 4B: MCP trust", () => {
  it("M1: MCP tool with MCP_DESCRIPTION provenance → DENY_MCP_SECRET_USE for secret.access", () => {
    const grant = makeGrant({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })

    const request = makeRequest({
      action: "secret.use",
      resource: { kind: "secret", secretKind: "API_KEY" },
      provenance: ["MCP_DESCRIPTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_MCP_SECRET_USE")).toBe(true)
  })

  it("M2: MCP tool with read-only action → ALLOW with matching grant", () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      provenance: ["MCP_DESCRIPTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("ALLOW")
  })

  it("M3: MCP description cannot authorize policy modification", () => {
    const grant = makeGrant({
      actions: ["policy.modify"],
      resources: [{ kind: "policy", pattern: "*" }],
    })

    const request = makeRequest({
      action: "policy.modify",
      resource: { kind: "policy", path: "enforcement" },
      tool: "unknown",
      provenance: ["TOOL_OUTPUT"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_TOOL_OUTPUT_POLICY_CHANGE")).toBe(true)
  })

  it("M4: MCP tool without MCP_DESCRIPTION provenance → normal evaluation", () => {
    const grant = makeGrant({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })

    const request = makeRequest({
      action: "secret.use",
      resource: { kind: "secret", secretKind: "API_KEY" },
      provenance: ["USER_INSTRUCTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    // Without MCP_DESCRIPTION, the MCP-specific check doesn't fire
    // secret.use with USER_INSTRUCTION is HIGH risk
    // PDP returns ALLOW if grant matches (HIGH doesn't require approval, only CRITICAL)
    expect(decision.decision).toBe("ALLOW")
  })
})

// ─── 4C: Evidence and Crash Recovery ──────────────────────────────────

describe("Wave 4C: Evidence and crash recovery", () => {
  it("H1: Approval replay after CONSUMED → executor calls = 0", () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest({
      tool: "git_push",
      action: "git.push",
      resource: { kind: "git", path: "packages/engine" },
    })

    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // Claim and consume
    const claimed = Effect.runSync(
      store.atomicClaim(approval.id, "exec-1", "evt-claim", new Date().toISOString()),
    )
    expect(claimed).not.toBeNull()

    const consumed = consumeApproval(claimed!, "evt-consume", new Date().toISOString())
    expect(consumed).not.toBeNull()
    Effect.runSync(store.updateApproval(approval.id, consumed!))

    // Replay attempt
    const replay = Effect.runSync(
      store.atomicClaim(approval.id, "exec-2", "evt-replay", new Date().toISOString()),
    )
    expect(replay).toBeNull()
  })

  it("H2: Restart after CLAIMED → approval remains CLAIMED", () => {
    const store = new InMemoryScopedApprovalStore()
    const request = makeRequest()
    const pending = createPendingApproval(request, "evt-create")
    const { approval } = approveRequest(pending, "evt-approve")
    Effect.runSync(store.putApproval(approval))

    // Claim
    const claimed = Effect.runSync(
      store.atomicClaim(approval.id, "exec-1", "evt-claim", new Date().toISOString()),
    )
    expect(claimed).not.toBeNull()
    Effect.runSync(store.updateApproval(approval.id, claimed!))

    // "Restart" — read the approval back
    const stored = Effect.runSync(store.getApproval(approval.id))
    expect(stored?.decision).toBe("CLAIMED")
    expect(stored?.claimExecutionId).toBe("exec-1")

    // Cannot claim again (already CLAIMED)
    const retry = Effect.runSync(
      store.atomicClaim(approval.id, "exec-2", "evt-retry", new Date().toISOString()),
    )
    expect(retry).toBeNull()
  })

  it("H3: Child barrier blocks until READY", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-h3", "agent:child", "sess-parent", ["g1", "g2"]),
    )

    // Start waiting in background
    const waitPromise = Effect.runPromise(
      barrier.waitUntilReady("child-h3", 500),
    )

    // Mark ready after short delay
    setTimeout(() => {
      Effect.runSync(barrier.markReady("child-h3", ["g1", "g2"]))
    }, 50)

    const result = await Promise.race([
      waitPromise.then(() => "READY" as const),
      new Promise<"TIMEOUT">((r) => setTimeout(() => r("TIMEOUT"), 400)),
    ])

    expect(result).toBe("READY")
  })

  it("H4: Child barrier blocks on FAILED", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-h4", "agent:child", "sess-parent", ["g1"]),
    )

    Effect.runSync(barrier.markFailed("child-h4", "activation failed"))

    const err = await Effect.runPromise(
      Effect.flip(barrier.waitUntilReady("child-h4", 100)),
    )

    expect(err._tag).toBe("ChildLaunchError")
    expect(err.reason).toBe("activation failed")
  })

  it("H5: Stale PENDING grants → revoked on recovery", () => {
    const store = new InMemoryGrantStore()

    // Create stale PENDING grants
    const pending1 = makeGrant({
      id: "stale-1",
      status: "PENDING" as any,
      constraints: { sessionId: "sess-stale" },
    })
    const pending2 = makeGrant({
      id: "stale-2",
      status: "PENDING" as any,
      constraints: { sessionId: "sess-stale" },
    })
    Effect.runSync(store.putGrant(pending1))
    Effect.runSync(store.putGrant(pending2))

    // Recovery: revoke all PENDING for session
    const revoked = Effect.runSync(
      store.revokePendingGrantsForSession("sess-stale"),
    )
    expect(revoked).toBe(2)

    // Verify grants are REVOKED
    const g1 = Effect.runSync(store.getGrantById("stale-1"))
    const g2 = Effect.runSync(store.getGrantById("stale-2"))
    expect(g1?.status).toBe("REVOKED")
    expect(g2?.status).toBe("REVOKED")

    // No ACTIVE grants for this session
    const active = Effect.runSync(
      store.getGrantsForPrincipal("child", "sess-stale"),
    )
    expect(active.length).toBe(0)
  })

  it("H6: PENDING grants filtered by store → never reach PDP", () => {
    const store = new InMemoryGrantStore()

    // Create PENDING grant
    const pending = makeGrant({
      status: "PENDING" as any,
      principal: { kind: "agent", id: "child" },
      constraints: { sessionId: "sess-child" },
    })
    Effect.runSync(store.putGrant(pending))

    // Store filters PENDING — returns empty for ACTIVE grants
    const active = Effect.runSync(
      store.getGrantsForPrincipal("child", "sess-child"),
    )
    expect(active.length).toBe(0)

    // PDP with empty capabilities → DENY
    const request = makeRequest({
      principalId: "child",
      sessionId: "sess-child",
    })
    const ctx = makeContext([])
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).toBe("DENY")
  })

  it("H7: REVOKED grant with revokedEventId → PDP denies", () => {
    const grant = makeGrant({
      status: "REVOKED",
      revokedEventId: "evt-revoke",
    })

    const request = makeRequest()
    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_CAPABILITY_REVOKED")).toBe(true)
  })

  it("H8: EXHAUSTED grant → PDP denies", () => {
    const grant = makeGrant({
      status: "EXHAUSTED",
    })

    const request = makeRequest()
    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_CAPABILITY_EXHAUSTED")).toBe(true)
  })

  it("H9: EXPIRED grant → PDP denies", () => {
    const grant = makeGrant({
      constraints: { sessionId: "sess-1", expiresAt: "2020-01-01T00:00:00Z" },
    })

    const request = makeRequest()
    const ctx = makeContext([grant], { now: "2026-01-01T00:00:00Z" })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_CAPABILITY_EXPIRED")).toBe(true)
  })
})
