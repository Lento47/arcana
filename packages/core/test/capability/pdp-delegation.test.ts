import { describe, expect, test } from "bun:test"
import { evaluate, type PolicyContext } from "../../src/capability/pdp"
import type {
  AuthorizationRequest,
  CapabilityGrant,
} from "../../src/capability/types"

const leafCapability: CapabilityGrant = {
  id: "child-1",
  schemaVersion: "1",
  principal: { kind: "subagent", id: "explore" },
  issuer: { kind: "parent_capability", id: "parent-1" },
  actions: ["filesystem.read"],
  resources: [{ kind: "file", pattern: "**" }],
  constraints: { sessionId: "ses_child" },
  delegation: { allowed: false, maximumDepth: 2, currentDepth: 1 },
  status: "ACTIVE",
  createdEventId: "evt-child-1",
}

const context = (capabilities: CapabilityGrant[]): PolicyContext => ({
  now: "2026-08-19T00:00:00.000Z",
  policyVersion: "test-v1",
  capabilities,
  explicitDenyRules: [],
  approvalRules: [],
  workspaceTrust: "TRUSTED",
})

function request(overrides: Partial<AuthorizationRequest>): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-1",
    principalId: "explore",
    sessionId: "ses_child",
    workspaceId: "ws-1",
    tool: "glob",
    action: "filesystem.read",
    resource: { kind: "file", path: "src/index.ts" },
    provenance: ["SYSTEM_POLICY"],
    sensitivity: ["PUBLIC"],
    requestedAt: "2026-08-19T00:00:00.000Z",
    nonce: "nonce-1",
    ...overrides,
  }
}

describe("PDP leaf capability usability (subagent tools)", () => {
  test("a leaf delegated capability is usable by its principal", () => {
    const decision = evaluate(request({}), context([leafCapability]))
    expect(decision.decision).toBe("ALLOW")
    expect(decision.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(false)
  })

  test("re-delegation from a non-delegatable leaf is still denied", () => {
    const decision = evaluate(
      request({ action: "delegate", tool: "delegate" }),
      context([leafCapability]),
    )
    expect(decision.decision).toBe("DENY")
    expect(decision.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
  })

  test("depth over maximum is denied only for delegation requests", () => {
    const deep: CapabilityGrant = {
      ...leafCapability,
      id: "child-deep",
      delegation: { allowed: true, maximumDepth: 2, currentDepth: 3 },
    }
    const use = evaluate(request({}), context([deep]))
    expect(use.decision).toBe("ALLOW")

    const redelegate = evaluate(request({ action: "delegate", tool: "delegate" }), context([deep]))
    expect(redelegate.decision).toBe("DENY")
    expect(redelegate.reasons.some((r) => r.code === "DENY_DELEGATION_DEPTH")).toBe(true)
  })
})
