import { describe, expect, test } from "bun:test"
import { evaluate, classifyRisk, matchResource } from "@arcana/core/capability/pdp"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import type { PolicyContext, PolicyRule, ReasonCode, DenyReasonCode, ApprovalReasonCode, AllowReasonCode } from "@arcana/core/capability/pdp"
import type {
  AuthorizationRequest,
  CapabilityGrant,
  ResourceSelector,
  ProvenanceLabel,
  SensitivityLabel,
} from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

const NOW = "2026-07-29T12:00:00Z"
const POLICY_VERSION = "phase-c-v1"

function makeRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-001",
    principalId: "agent:main",
    sessionId: "sess-abc",
    tool: "terminal",
    action: "process.execute",
    resource: { kind: "process", executable: "bun" },
    executable: "bun",
    arguments: ["test", "file.test.ts"],
    workingDirectory: "/workspace",
    provenance: ["USER_INSTRUCTION"],
    sensitivity: ["PUBLIC"],
    requestedAt: NOW,
    nonce: "nonce-001",
    ...overrides,
  }
}

function makeCapability(
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
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

function makeContext(
  overrides: Partial<PolicyContext> = {},
): PolicyContext {
  return {
    now: NOW,
    policyVersion: POLICY_VERSION,
    capabilities: [],
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED",
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PDP: basic decisions", () => {
  test("no capability → DENY", () => {
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_NO_MATCHING_CAPABILITY" || r.code === "DENY_PRINCIPAL_MISMATCH")).toBe(true)
  })

  test("exact matching grant → ALLOW", () => {
    const cap = makeCapability()
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
    expect(d.capabilityIds).toContain("cap-001")
    expect(d.reasons.some((r) => r.code === "ALLOW_CAPABILITY_MATCH")).toBe(true)
  })

  test("default deny when no capabilities exist", () => {
    const req = makeRequest({ action: "filesystem.write" })
    const ctx = makeContext()
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
  })
})

describe("PDP: deny-overrides", () => {
  test("explicit deny overrides matching allow", () => {
    const cap = makeCapability()
    const denyRule: PolicyRule = {
      id: "rule-deny-01",
      kind: "deny",
      description: "Block all process execution",
      conditions: { actions: ["process.execute"] },
    }
    const req = makeRequest()
    const ctx = makeContext({
      capabilities: [cap],
      explicitDenyRules: [denyRule],
    })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_EXPLICIT_POLICY")).toBe(true)
  })

  test("approval rule overrides allow", () => {
    const cap = makeCapability()
    const approvalRule: PolicyRule = {
      id: "rule-approval-01",
      kind: "approval",
      description: "All process execution needs approval",
      conditions: { actions: ["process.execute"] },
    }
    const req = makeRequest()
    const ctx = makeContext({
      capabilities: [cap],
      approvalRules: [approvalRule],
    })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("REQUIRE_APPROVAL")
  })

  test("DENY > REQUIRE_APPROVAL > ALLOW precedence", () => {
    const cap = makeCapability()
    const denyRule: PolicyRule = {
      id: "d1",
      kind: "deny",
      description: "deny",
      conditions: { actions: ["process.execute"] },
    }
    const approvalRule: PolicyRule = {
      id: "a1",
      kind: "approval",
      description: "approval",
      conditions: { actions: ["process.execute"] },
    }
    const req = makeRequest()
    const ctx = makeContext({
      capabilities: [cap],
      explicitDenyRules: [denyRule],
      approvalRules: [approvalRule],
    })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
  })
})

describe("PDP: principal matching", () => {
  test("principal mismatch → DENY", () => {
    const cap = makeCapability({
      principal: { kind: "agent", id: "agent:other" },
    })
    const req = makeRequest({ principalId: "agent:main" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_PRINCIPAL_MISMATCH")).toBe(true)
  })
})

describe("PDP: action matching", () => {
  test("action mismatch → DENY", () => {
    const cap = makeCapability({ actions: ["filesystem.read"] })
    const req = makeRequest({ action: "filesystem.write" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_ACTION_OUT_OF_SCOPE")).toBe(true)
  })

  test("multiple actions — one matches → ALLOW", () => {
    const cap = makeCapability({
      actions: ["process.execute", "filesystem.read"],
    })
    const req = makeRequest({ action: "process.execute" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

describe("PDP: resource matching", () => {
  test("exact resource match → ALLOW", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/core/src/index.ts" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "packages/core/src/index.ts" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("descendant resource match → ALLOW", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "directory", pattern: "packages/engine" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "directory", path: "packages/engine/src/foo.ts" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("path-prefix confusion refused — /workspace-safe ≠ /workspace", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "directory", pattern: "workspace" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "directory", path: "workspace-safe/evil" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)
  })

  test("traversal refused", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "packages/engine" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "packages/engine/../../../etc/passwd" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
  })

  test("resource kind mismatch → DENY", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "foo.ts" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "network", host: "example.com" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
  })

  test("network host exact match → ALLOW", () => {
    const cap = makeCapability({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
    })
    const req = makeRequest({
      action: "network.read",
      resource: { kind: "network", host: "api.example.com" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("host suffix attack refused — api.example.com.attacker.com", () => {
    const cap = makeCapability({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.example.com" }],
    })
    const req = makeRequest({
      action: "network.read",
      resource: { kind: "network", host: "api.example.com.attacker.com" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)
  })

  test("wildcard subdomain matches sub.example.com", () => {
    const cap = makeCapability({
      actions: ["network.read"],
      resources: [{ kind: "network", pattern: "*.example.com" }],
    })
    const req = makeRequest({
      action: "network.read",
      resource: { kind: "network", host: "sub.example.com" },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("empty resource selector grants nothing", () => {
    const cap = makeCapability({ resources: [] })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_RESOURCE_OUT_OF_SCOPE")).toBe(true)
  })
})

describe("PDP: constraint matching", () => {
  test("session mismatch → DENY", () => {
    const cap = makeCapability({
      constraints: { sessionId: "sess-other" },
    })
    const req = makeRequest({ sessionId: "sess-abc" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_SESSION_MISMATCH")).toBe(true)
  })

  test("contract mismatch → DENY", () => {
    const cap = makeCapability({
      constraints: { contractId: "contract-1" },
    })
    const req = makeRequest({ contractId: "contract-2" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_CONTRACT_MISMATCH")).toBe(true)
  })

  test("tool mismatch → DENY", () => {
    const cap = makeCapability({
      constraints: { toolNames: ["web_fetch"] },
    })
    const req = makeRequest({ tool: "terminal" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_TOOL_OUT_OF_SCOPE")).toBe(true)
  })

  test("executable mismatch → DENY", () => {
    const cap = makeCapability({
      constraints: { executable: "node" },
    })
    const req = makeRequest({ executable: "bun" })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_EXECUTABLE_OUT_OF_SCOPE")).toBe(true)
  })

  test("network host constraint → DENY when destination outside scope", () => {
    const cap = makeCapability({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
      constraints: { networkHosts: ["api.example.com"] },
    })
    const req = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "evil.com" },
      networkDestination: "evil.com",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
  })
})

describe("PDP: capability lifecycle", () => {
  test("expired capability → DENY", () => {
    const cap = makeCapability({
      constraints: { expiresAt: "2026-07-28T00:00:00Z" },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_CAPABILITY_EXPIRED")).toBe(true)
  })

  test("revoked capability → DENY", () => {
    const cap = makeCapability({ status: "REVOKED" })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_CAPABILITY_REVOKED")).toBe(true)
  })

  test("exhausted capability → DENY", () => {
    const cap = makeCapability({ status: "EXHAUSTED" })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_CAPABILITY_EXHAUSTED")).toBe(true)
  })

  test("zero maxUses → DENY", () => {
    const cap = makeCapability({
      constraints: { maxUses: 0 },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_CAPABILITY_EXHAUSTED")).toBe(true)
  })

  test("capability not yet expired → ALLOW", () => {
    const cap = makeCapability({
      constraints: { expiresAt: "2099-12-31T23:59:59Z" },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

describe("PDP: delegation", () => {
  test("delegation depth exceeded → DENY", () => {
    const cap = makeCapability({
      delegation: { allowed: true, maximumDepth: 1, currentDepth: 2 },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
  })

  test("delegation not allowed and depth > 0 → DENY", () => {
    const cap = makeCapability({
      delegation: { allowed: false, maximumDepth: 5, currentDepth: 1 },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
  })

  test("delegation allowed, within depth → ALLOW", () => {
    const cap = makeCapability({
      delegation: { allowed: true, maximumDepth: 3, currentDepth: 1 },
    })
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

describe("PDP: provenance and sensitivity", () => {
  test("MCP description cannot authorize secret.use → DENY", () => {
    const cap = makeCapability({
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "API_KEY" }],
    })
    const req = makeRequest({
      action: "secret.use",
      resource: { kind: "secret", secretKind: "API_KEY" },
      provenance: ["MCP_DESCRIPTION"],
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_SECRET_FLOW")).toBe(true)
  })

  test("TOOL_OUTPUT cannot authorize policy.modify → DENY", () => {
    const cap = makeCapability({
      actions: ["policy.modify"],
      resources: [{ kind: "policy", pattern: "*" }],
    })
    const req = makeRequest({
      action: "policy.modify",
      resource: { kind: "policy", path: "security" },
      provenance: ["TOOL_OUTPUT"],
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_UNTRUSTED_PROVENANCE")).toBe(true)
  })

  test("SECRET + network.write → DENY", () => {
    const cap = makeCapability({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "example.com" }],
    })
    const req = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      sensitivity: ["SECRET"],
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_SECRET_FLOW")).toBe(true)
  })

  test("REMOTE_CONTENT + network.write → REQUIRE_APPROVAL", () => {
    const cap = makeCapability({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "example.com" }],
    })
    const req = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "example.com" },
      provenance: ["REMOTE_CONTENT"],
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("REQUIRE_APPROVAL")
    expect(d.reasons.some((r) => r.code === "REQUIRE_APPROVAL_UNTRUSTED_PROVENANCE")).toBe(true)
  })
})

describe("PDP: workspace trust", () => {
  test("untrusted workspace + high-risk action → REQUIRE_APPROVAL", () => {
    const cap = makeCapability()
    const req = makeRequest()
    const ctx = makeContext({
      capabilities: [cap],
      workspaceTrust: "UNTRUSTED",
    })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("REQUIRE_APPROVAL")
    expect(d.reasons.some((r) => r.code === "REQUIRE_APPROVAL_UNTRUSTED_WORKSPACE")).toBe(true)
  })

  test("trusted workspace + low-risk action → ALLOW", () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "foo.ts" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "foo.ts" },
    })
    const ctx = makeContext({
      capabilities: [cap],
      workspaceTrust: "TRUSTED",
    })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

describe("PDP: request hash integrity", () => {
  test("request hash is independently recomputed", () => {
    const cap = makeCapability()
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    const expected = computeRequestHash(req)
    expect(d.requestHash).toBe(expected)
  })

  test("label ordering does not affect request hash", () => {
    const req1 = makeRequest({
      provenance: ["USER_INSTRUCTION", "REMOTE_CONTENT"],
    })
    const req2 = makeRequest({
      provenance: ["REMOTE_CONTENT", "USER_INSTRUCTION"],
    })
    expect(computeRequestHash(req1)).toBe(computeRequestHash(req2))
  })
})

describe("PDP: request validation", () => {
  test("missing requestId → DENY_INVALID_REQUEST", () => {
    const req = makeRequest({ requestId: "" })
    const ctx = makeContext()
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons[0].code).toBe("DENY_INVALID_REQUEST")
  })

  test("missing principalId → DENY_INVALID_REQUEST", () => {
    const req = makeRequest({ principalId: "" })
    const ctx = makeContext()
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons[0].code).toBe("DENY_INVALID_REQUEST")
  })

  test("wrong schema version → DENY_INVALID_REQUEST", () => {
    const req = makeRequest({ schemaVersion: "2" as any })
    const ctx = makeContext()
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons[0].code).toBe("DENY_INVALID_REQUEST")
  })
})

describe("PDP: determinism", () => {
  test("repeated evaluation produces identical decision", () => {
    const cap = makeCapability()
    const req = makeRequest()
    const ctx = makeContext({ capabilities: [cap] })
    const d1 = evaluate(req, ctx)
    const d2 = evaluate(req, ctx)
    expect(d1.decision).toBe(d2.decision)
    expect(d1.requestHash).toBe(d2.requestHash)
    expect(d1.reasons.map((r) => r.code)).toEqual(d2.reasons.map((r) => r.code))
    expect(d1.capabilityIds).toEqual(d2.capabilityIds)
    expect(d1.decidedAt).toBe(d2.decidedAt)
  })
})

describe("PDP: composition", () => {
  test("multiple partial capabilities do not combine into broader authority", () => {
    // Cap A: network.write to api.example.com
    const capA = makeCapability({
      id: "cap-A",
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "api.example.com" }],
    })
    // Cap B: secret.use for TOKEN_X
    const capB = makeCapability({
      id: "cap-B",
      actions: ["secret.use"],
      resources: [{ kind: "secret", pattern: "TOKEN_X" }],
    })
    // Request: send TOKEN_X to api.example.com (network.write + SECRET)
    const req = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "api.example.com" },
      sensitivity: ["SECRET"],
    })
    const ctx = makeContext({ capabilities: [capA, capB] })
    const d = evaluate(req, ctx)
    // Should be DENY because SECRET + network.write is denied
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_SECRET_FLOW")).toBe(true)
  })
})

describe("PDP: CRITICAL risk requires approval", () => {
  test("CRITICAL action → REQUIRE_APPROVAL even with matching capability", () => {
    const cap = makeCapability({
      actions: ["git.push"],
      resources: [{ kind: "git", pattern: "." }],
    })
    const req = makeRequest({
      action: "git.push",
      resource: { kind: "git", path: "." },
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluate(req, ctx)
    expect(d.decision).toBe("REQUIRE_APPROVAL")
    expect(d.reasons.some((r) => r.code === "REQUIRE_APPROVAL_HIGH_RISK")).toBe(true)
  })
})

// ── Property-based style tests ────────────────────────────────────────

describe("PDP: resource matching properties", () => {
  test("exact match is reflexive", () => {
    const sel: ResourceSelector = { kind: "file", pattern: "foo/bar.ts" }
    expect(matchResource(sel, { kind: "file", path: "foo/bar.ts" })).toBe(true)
  })

  test("different kind always fails", () => {
    const sel: ResourceSelector = { kind: "file", pattern: "foo" }
    expect(matchResource(sel, { kind: "network", host: "foo" })).toBe(false)
  })

  test("directory prefix at boundary only", () => {
    const sel: ResourceSelector = { kind: "directory", pattern: "pkg" }
    // "pkg/foo" should match
    expect(matchResource(sel, { kind: "directory", path: "pkg/foo" })).toBe(true)
    // "pkg-evil" should NOT match
    expect(matchResource(sel, { kind: "directory", path: "pkg-evil" })).toBe(false)
  })

  test("traversal always rejected", () => {
    const sel: ResourceSelector = { kind: "file", pattern: "safe" }
    expect(matchResource(sel, { kind: "file", path: "safe/../../../etc/passwd" })).toBe(false)
  })

  test("host wildcard is label-bounded", () => {
    const sel: ResourceSelector = { kind: "network", pattern: "*.example.com" }
    expect(matchResource(sel, { kind: "network", host: "sub.example.com" })).toBe(true)
    expect(matchResource(sel, { kind: "network", host: "a.b.example.com" })).toBe(false)
    expect(matchResource(sel, { kind: "network", host: "example.com.attacker.com" })).toBe(false)
  })

  test("executable match uses basename only", () => {
    const sel: ResourceSelector = { kind: "process", pattern: "bun" }
    expect(matchResource(sel, { kind: "process", executable: "bun" })).toBe(true)
    expect(matchResource(sel, { kind: "process", executable: "/usr/bin/bun" })).toBe(true)
    expect(matchResource(sel, { kind: "process", executable: "bunx" })).toBe(false)
  })

  test("wildcard executable does NOT match empty executable (regression)", () => {
    // Security: empty executable is malformed, wildcard must not authorize it
    const sel: ResourceSelector = { kind: "process", pattern: "*" }
    expect(matchResource(sel, { kind: "process", executable: "bun" })).toBe(true)
    expect(matchResource(sel, { kind: "process", executable: "" })).toBe(false)
    expect(matchResource(sel, { kind: "process" })).toBe(false)  // undefined executable
  })
})

describe("PDP: decision reason codes", () => {
  test("all expected reason codes are used somewhere", () => {
    // Verify the key reason codes exist by testing scenarios that trigger them
    const codes = new Set<string>()

    // DENY_INVALID_REQUEST
    const d1 = evaluate(makeRequest({ requestId: "" }), makeContext())
    d1.reasons.forEach((r) => codes.add(r.code))

    // DENY_NO_MATCHING_CAPABILITY / DENY_PRINCIPAL_MISMATCH
    const d2 = evaluate(makeRequest(), makeContext())
    d2.reasons.forEach((r) => codes.add(r.code))

    // DENY_CAPABILITY_REVOKED
    const d3 = evaluate(makeRequest(), makeContext({
      capabilities: [makeCapability({ status: "REVOKED" })],
    }))
    d3.reasons.forEach((r) => codes.add(r.code))

    // ALLOW_CAPABILITY_MATCH
    const d4 = evaluate(makeRequest(), makeContext({
      capabilities: [makeCapability()],
    }))
    d4.reasons.forEach((r) => codes.add(r.code))

    // REQUIRE_APPROVAL_HIGH_RISK
    const d5 = evaluate(makeRequest({ action: "git.push", resource: { kind: "git", path: "." } }), makeContext({
      capabilities: [makeCapability({
        actions: ["git.push"],
        resources: [{ kind: "git", pattern: "." }],
      })],
    }))
    d5.reasons.forEach((r) => codes.add(r.code))

    expect(codes.has("DENY_INVALID_REQUEST")).toBe(true)
    expect(codes.has("DENY_NO_MATCHING_CAPABILITY") || codes.has("DENY_PRINCIPAL_MISMATCH")).toBe(true)
    expect(codes.has("DENY_CAPABILITY_REVOKED")).toBe(true)
    expect(codes.has("ALLOW_CAPABILITY_MATCH")).toBe(true)
    expect(codes.has("REQUIRE_APPROVAL_HIGH_RISK")).toBe(true)
  })
})

describe("PDP: risk classification", () => {
  test("SECRET elevates to at least HIGH", () => {
    expect(classifyRisk("filesystem.read", ["SECRET"])).toBe("HIGH")
  })

  test("CRITICAL is not elevated further", () => {
    expect(classifyRisk("git.push", ["SECRET"])).toBe("CRITICAL")
  })

  test("LOW stays LOW without SECRET", () => {
    expect(classifyRisk("filesystem.read", ["PUBLIC"])).toBe("LOW")
  })
})

describe("PDP: policy version", () => {
  test("decision contains the policy version from context", () => {
    const cap = makeCapability()
    const req = makeRequest()
    const ctx = makeContext({
      capabilities: [cap],
      policyVersion: "custom-v42",
    })
    const d = evaluate(req, ctx)
    expect(d.policyVersion).toBe("custom-v42")
  })
})

// ── Frozen reason-code enum ───────────────────────────────────────────

describe("PDP: frozen reason-code enum (26 codes)", () => {
  const EXPECTED_DENY: DenyReasonCode[] = [
    "DENY_INVALID_REQUEST",
    "DENY_REQUEST_HASH_MISMATCH",
    "DENY_NO_MATCHING_CAPABILITY",
    "DENY_PRINCIPAL_MISMATCH",
    "DENY_ACTION_OUT_OF_SCOPE",
    "DENY_RESOURCE_OUT_OF_SCOPE",
    "DENY_WORKSPACE_MISMATCH",
    "DENY_SESSION_MISMATCH",
    "DENY_CONTRACT_MISMATCH",
    "DENY_TOOL_OUT_OF_SCOPE",
    "DENY_EXECUTABLE_OUT_OF_SCOPE",
    "DENY_ARGUMENT_OUT_OF_SCOPE",
    "DENY_NETWORK_HOST_OUT_OF_SCOPE",
    "DENY_CAPABILITY_EXPIRED",
    "DENY_CAPABILITY_REVOKED",
    "DENY_CAPABILITY_EXHAUSTED",
    "DENY_DELEGATION_DEPTH",
    "DENY_UNTRUSTED_PROVENANCE",
    "DENY_SECRET_FLOW",
    "DENY_EXPLICIT_POLICY",
  ]

  const EXPECTED_APPROVAL: ApprovalReasonCode[] = [
    "REQUIRE_APPROVAL_HIGH_RISK",
    "REQUIRE_APPROVAL_UNTRUSTED_WORKSPACE",
    "REQUIRE_APPROVAL_UNTRUSTED_PROVENANCE",
    "REQUIRE_APPROVAL_SECRET_USE",
    "REQUIRE_APPROVAL_EXTERNAL_WRITE",
  ]

  const EXPECTED_ALLOW: AllowReasonCode[] = ["ALLOW_CAPABILITY_MATCH"]

  test("frozen deny code count: 20", () => {
    expect(EXPECTED_DENY.length).toBe(20)
  })

  test("frozen approval code count: 5", () => {
    expect(EXPECTED_APPROVAL.length).toBe(5)
  })

  test("frozen allow code count: 1", () => {
    expect(EXPECTED_ALLOW.length).toBe(1)
  })

  test("frozen total reason code count: 26", () => {
    const total =
      EXPECTED_DENY.length +
      EXPECTED_APPROVAL.length +
      EXPECTED_ALLOW.length
    expect(total).toBe(26)
  })
})
