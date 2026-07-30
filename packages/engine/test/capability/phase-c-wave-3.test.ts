/**
 * Phase C Wave 3: Provenance and Information-Flow Attacks
 *
 * Tests whether untrusted data can manipulate authorization decisions.
 * Provenance labels, sensitivity labels, and intent bindings are tested
 * for resistance to injection, laundering, and downgrade attacks.
 *
 * Fixtures D1–D18: 18 tests in 5 groups
 *
 * Hard gate: zero false allows from untrusted data
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { evaluate as evaluatePolicy, type PolicyContext } from "@arcana/core/capability/pdp"
import { authorizeAndExecuteEffect, type PreparedEffect } from "@arcana/core/capability/pep"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
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

// ── Group D1–D2: Remote content injection ─────────────────────────────

describe("Wave 3 Group D1–D2: Remote content injection", () => {
  // D1 — Malicious repository instruction
  // Provenance: UNTRUSTED_LOCAL_SOURCE + MODEL_OUTPUT
  // Action: network.write to attacker.example
  // No intent binding → DENY
  it("D1: Untrusted local + model output → network.write denied", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "attacker.example" },
      tool: "http_client",
      provenance: ["UNTRUSTED_LOCAL_SOURCE", "MODEL_OUTPUT"],
    })

    // intentBindings: [] triggers intent binding enforcement for HIGH risk
    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
    expect(
      decision.reasons.some(
        (r) =>
          r.code === "DENY_NO_INTENT_BINDING" ||
          r.code === "DENY_REMOTE_CONTENT_INJECTION",
      ),
    ).toBe(true)
  })

  // D2 — Remote page to terminal
  // Provenance: REMOTE_CONTENT
  // Action: process.execute
  // No intent binding → DENY_REMOTE_CONTENT_INJECTION
  it("D2: Remote content → process.execute denied (no intent binding)", () => {
    const grant = makeGrant({
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
    })

    const request = makeRequest({
      action: "process.execute",
      resource: { kind: "process", executable: "bash" },
      tool: "terminal",
      provenance: ["REMOTE_CONTENT"],
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
    expect(
      decision.reasons.some(
        (r) =>
          r.code === "DENY_REMOTE_CONTENT_INJECTION" ||
          r.code === "REQUIRE_APPROVAL" ||
          r.code === "REQUIRE_APPROVAL_INTENT" ||
          r.code === "DENY_NO_INTENT_BINDING",
      ),
    ).toBe(true)
  })
})

// ── Group D3–D5: Tool/MCP/Issue authority manipulation ────────────────

describe("Wave 3 Group D3–D5: Tool/MCP/Issue authority manipulation", () => {
  // D3 — MCP description to secret access
  // Provenance: MCP_DESCRIPTION + action: secret.use → DENY_MCP_SECRET_USE
  it("D3: MCP description → secret.use denied (DENY_MCP_SECRET_USE)", () => {
    const grant = makeGrant({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })

    const request = makeRequest({
      action: "secret.use",
      resource: { kind: "secret", secretKind: "API_KEY" },
      tool: "secret_manager",
      provenance: ["MCP_DESCRIPTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_MCP_SECRET_USE")).toBe(true)
  })

  // D4 — Tool output to policy modification
  // Provenance: TOOL_OUTPUT + action: policy.modify → DENY_TOOL_OUTPUT_POLICY_CHANGE
  it("D4: Tool output → policy.modify denied (DENY_TOOL_OUTPUT_POLICY_CHANGE)", () => {
    const grant = makeGrant({
      actions: ["policy.modify"],
      resources: [{ kind: "policy", pattern: "default" }],
    })

    const request = makeRequest({
      action: "policy.modify",
      resource: { kind: "policy", path: "default" },
      tool: "policy_editor",
      provenance: ["TOOL_OUTPUT"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_TOOL_OUTPUT_POLICY_CHANGE")).toBe(true)
  })

  // D5 — Issue text to deploy
  // Provenance: UNTRUSTED_LOCAL_SOURCE + action: deploy (CRITICAL)
  // No intent binding → DENY or REQUIRE_APPROVAL
  it("D5: Untrusted local source → deploy denied or requires approval", () => {
    const grant = makeGrant({
      actions: ["deploy"],
      resources: [{ kind: "package", pattern: "my-app" }],
    })

    const request = makeRequest({
      action: "deploy",
      resource: { kind: "package", path: "my-app" },
      tool: "deploy_tool",
      provenance: ["UNTRUSTED_LOCAL_SOURCE"],
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
  })
})

// ── Group D6–D9: Cross-tool laundering ────────────────────────────────

describe("Wave 3 Group D6–D9: Cross-tool laundering", () => {
  // D6 — Subagent output to network send
  // Provenance: SUBAGENT_OUTPUT + action: network.write
  it("D6: Subagent output → network.write requires approval or denied", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      tool: "http_client",
      provenance: ["SUBAGENT_OUTPUT"],
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
  })

  // D7 — REMOTE_CONTENT through terminal arguments
  // Provenance: REMOTE_CONTENT + action: process.execute
  // Provenance retained, DENY or REQUIRE_APPROVAL
  it("D7: Remote content through terminal → provenance retained, denied or approval", () => {
    const grant = makeGrant({
      actions: ["process.execute"],
      resources: [{ kind: "process", pattern: "*" }],
    })

    const request = makeRequest({
      action: "process.execute",
      resource: { kind: "process", executable: "bash" },
      tool: "terminal",
      provenance: ["REMOTE_CONTENT"],
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    // Provenance is retained in the request
    expect(request.provenance).toContain("REMOTE_CONTENT")
    expect(decision.decision).not.toBe("ALLOW")
  })

  // D8 — MCP_DESCRIPTION through filesystem target
  // Provenance: MCP_DESCRIPTION + action: filesystem.write
  // The PDP blocks MCP_DESCRIPTION + secret.use (DENY_MCP_SECRET_USE)
  // but does NOT block MCP_DESCRIPTION + filesystem.write.
  // This is a documented gap: MCP description can influence file writes.
  it("D8: MCP description through filesystem.write → provenance retained (documented gap)", () => {
    const grant = makeGrant({
      actions: ["filesystem.write"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      action: "filesystem.write",
      resource: { kind: "file", path: "packages/test.txt" },
      tool: "write_file",
      provenance: ["MCP_DESCRIPTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    // MCP_DESCRIPTION is retained in the request
    expect(request.provenance).toContain("MCP_DESCRIPTION")
    // PDP allows — only secret.use is blocked for MCP_DESCRIPTION
    expect(decision.decision).toBe("ALLOW")
  })

  // D9 — SUBAGENT_OUTPUT through outgoing message
  // Provenance: SUBAGENT_OUTPUT + action: network.write
  it("D9: Subagent output through network.write → requires approval or denied", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      tool: "http_client",
      provenance: ["SUBAGENT_OUTPUT"],
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
  })
})

// ── Group D10–D15: Sensitivity and provenance integrity ───────────────

describe("Wave 3 Group D10–D15: Sensitivity and provenance integrity", () => {
  // D10 — SECRET value through network
  // Sensitivity: SECRET + action: network.write → DENY_SECRET_EXFILTRATION
  it("D10: SECRET → network.write denied (DENY_SECRET_EXFILTRATION)", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      tool: "http_client",
      sensitivity: ["SECRET"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_SECRET_EXFILTRATION")).toBe(true)
  })

  // D11 — SECRET value through filesystem
  // Sensitivity: SECRET + Provenance: MODEL_OUTPUT + action: filesystem.write
  // → DENY_SECRET_MODEL_EXPOSURE
  it("D11: SECRET + MODEL_OUTPUT → filesystem.write denied (DENY_SECRET_MODEL_EXPOSURE)", () => {
    const grant = makeGrant({
      actions: ["filesystem.write"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      action: "filesystem.write",
      resource: { kind: "file", path: "packages/test.txt" },
      tool: "write_file",
      provenance: ["MODEL_OUTPUT"],
      sensitivity: ["SECRET"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_SECRET_MODEL_EXPOSURE")).toBe(true)
  })

  // D12 — SECRET value through model output / network
  // Sensitivity: SECRET + action: network.write → DENY_SECRET_EXFILTRATION
  it("D12: SECRET → network.write denied (DENY_SECRET_EXFILTRATION)", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    const request = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      tool: "http_client",
      provenance: ["MODEL_OUTPUT"],
      sensitivity: ["SECRET"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).toBe("DENY")
    // Both DENY_SECRET_EXFILTRATION and DENY_SECRET_MODEL_EXPOSURE may fire
    expect(
      decision.reasons.some(
        (r) =>
          r.code === "DENY_SECRET_EXFILTRATION" ||
          r.code === "DENY_SECRET_MODEL_EXPOSURE",
      ),
    ).toBe(true)
  })

  // D13 — Sensitivity downgrade (DOCUMENTATION test)
  // Request claims PUBLIC sensitivity but action is secret.use.
  // The PDP uses the request's sensitivity array as-is — it trusts
  // the request builder. With PUBLIC sensitivity, secret.use is HIGH
  // (not elevated). Without intentBindings, this ALLOWs if capability
  // matches. This DOCUMENTS that the PDP doesn't independently verify
  // sensitivity labels.
  it("D13: Self-declared PUBLIC sensitivity trusted by PDP (documentation)", () => {
    const grant = makeGrant({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })

    const request = makeRequest({
      action: "secret.use",
      resource: { kind: "secret", secretKind: "API_KEY" },
      tool: "secret_manager",
      sensitivity: ["PUBLIC"],
    })

    // No intentBindings → PDP skips intent binding check
    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    // The PDP trusts the request builder's sensitivity declaration.
    // With PUBLIC sensitivity, secret.use is classified as HIGH (base risk),
    // not elevated. Without intentBindings, HIGH doesn't trigger approval.
    expect(decision.decision).toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "ALLOW_CAPABILITY_MATCH")).toBe(true)
  })

  // D14 — Provenance removal attempt (DOCUMENTATION test)
  // Request claims USER_INSTRUCTION only. The PDP trusts this — it
  // cannot independently verify provenance. If the request builder
  // says USER_INSTRUCTION, the PDP uses that. This DOCUMENTS the
  // trust boundary: provenance integrity depends on the request builder.
  it("D14: Provenance labels trusted by PDP (documentation)", () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "packages/engine/src/foo.ts" },
      provenance: ["USER_INSTRUCTION"],
    })

    const ctx = makeContext([grant])
    const decision = evaluatePolicy(request, ctx)

    // PDP trusts the request builder's provenance labels
    expect(decision.decision).toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "ALLOW_CAPABILITY_MATCH")).toBe(true)
  })

  // D15 — Unknown lineage on HIGH action
  // Empty provenance + HIGH risk action (filesystem.delete)
  // With intentBindings enforced, HIGH requires CONTRACT_CRITERION binding
  it("D15: Empty provenance on HIGH action → not ALLOW", () => {
    const grant = makeGrant({
      actions: ["filesystem.delete"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      action: "filesystem.delete",
      resource: { kind: "file", path: "packages/engine/src/old.ts" },
      tool: "delete_file",
      provenance: [],
    })

    // With empty intentBindings, HIGH risk requires CONTRACT_CRITERION binding
    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
    expect(
      decision.reasons.some(
        (r) =>
          r.code === "DENY_NO_INTENT_BINDING" ||
          r.code === "REQUIRE_APPROVAL_HIGH_RISK" ||
          r.code === "REQUIRE_APPROVAL_INTENT",
      ),
    ).toBe(true)
  })
})

// ── Group D16–D18: Approval and intent interactions ───────────────────

describe("Wave 3 Group D16–D18: Approval and intent interactions", () => {
  // D16 — Remote content mutates approved destination
  // Approval exists for network.write to 'internal.example'
  // Request has networkDestination = 'attacker.example'
  // Different destination → different request hash → approval mismatch
  it("D16: Different network destination → approved scope hash mismatch", () => {
    const grant = makeGrant({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "*" }],
    })

    // Create an approved request for 'internal.example'
    const approvedRequest = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "internal.example" },
      tool: "http_client",
      networkDestination: "internal.example",
      provenance: ["USER_INSTRUCTION"],
    })
    const approvedHash = computeRequestHash(approvedRequest)

    // Context has approved scope for the internal request + untrusted workspace
    // to ensure the PDP reaches the approval check
    const ctx = makeContext([grant], {
      workspaceTrust: "UNTRUSTED",
      approvedScopes: [{
        requestHash: approvedHash,
        approvalId: "approval-internal",
        capabilityId: grant.id,
        principalId: "agent",
        sessionId: "sess-1",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        maxUses: 1,
      }],
    })

    // Agent changes destination to attacker
    const attackerRequest = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "attacker.example" },
      tool: "http_client",
      networkDestination: "attacker.example",
      provenance: ["USER_INSTRUCTION"],
    })

    const decision = evaluatePolicy(attackerRequest, ctx)

    // The request hash is different due to different networkDestination
    expect(computeRequestHash(attackerRequest)).not.toBe(approvedHash)
    // The approved scope doesn't match → not ALLOW
    expect(decision.decision).not.toBe("ALLOW")
  })

  // D17 — Model justification without objective basis
  // Action: deploy (CRITICAL) with no intent bindings
  // CRITICAL requires EXPLICIT_APPROVAL binding
  it("D17: CRITICAL deploy without intent binding → requires approval", () => {
    const grant = makeGrant({
      actions: ["deploy"],
      resources: [{ kind: "package", pattern: "my-app" }],
    })

    const request = makeRequest({
      action: "deploy",
      resource: { kind: "package", path: "my-app" },
      tool: "deploy_tool",
    })

    const ctx = makeContext([grant], { intentBindings: [] })
    const decision = evaluatePolicy(request, ctx)

    expect(decision.decision).not.toBe("ALLOW")
    expect(
      decision.reasons.some(
        (r) =>
          r.code === "REQUIRE_APPROVAL_INTENT" ||
          r.code === "REQUIRE_APPROVAL_HIGH_RISK" ||
          r.code === "DENY_NO_INTENT_BINDING",
      ),
    ).toBe(true)
  })

  // D18 — Positive lineage control (prevent deny-all false positive)
  // Provenance: USER_INSTRUCTION + action: filesystem.read (LOW)
  // Matching capability → ALLOW, executorCalls = 1
  it("D18: USER_INSTRUCTION + filesystem.read → ALLOW, executor calls = 1", async () => {
    const grant = makeGrant({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/**" }],
    })

    const request = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "packages/engine/src/foo.ts" },
      tool: "read_file",
      provenance: ["USER_INSTRUCTION"],
      sensitivity: ["PUBLIC"],
    })

    const ctx = makeContext([grant])

    // PDP allows
    const decision = evaluatePolicy(request, ctx)
    expect(decision.decision).toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "ALLOW_CAPABILITY_MATCH")).toBe(true)

    // PEP executes
    let executorCalls = 0
    const effect: PreparedEffect<string> = {
      request,
      executeExact: () => { executorCalls++; return "executed" },
    }
    const provider = { snapshot: () => Effect.succeed(ctx) }
    const result = await Effect.runPromise(authorizeAndExecuteEffect(effect, provider))

    expect(result.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
  })
})
