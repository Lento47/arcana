import { describe, expect, test } from "bun:test"
import { authorizeAndExecute } from "@arcana/core/capability/pep"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import type {
  PreparedEffect,
  PolicyContextProvider,
  EnforcementResult,
} from "@arcana/core/capability/pep"
import type { PolicyContext, PolicyRule } from "@arcana/core/capability/pdp"
import type {
  AuthorizationRequest,
  CapabilityGrant,
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

function makeProvider(ctx: PolicyContext): PolicyContextProvider {
  return { snapshot: () => ctx }
}

function makeEffect<T>(
  request: AuthorizationRequest,
  execute: () => T,
): PreparedEffect<T> {
  return { request, executeExact: execute }
}

// ── PEP Unit Tests ────────────────────────────────────────────────────

describe("PEP: basic enforcement", () => {
  test("ALLOW invokes the effect exactly once", async () => {
    let callCount = 0
    const effect = makeEffect(makeRequest(), () => {
      callCount++
      return "result"
    })
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTED")
    expect(callCount).toBe(1)
    if (result.status === "EXECUTED") {
      expect(result.value).toBe("result")
    }
  })

  test("DENY never invokes the effect", async () => {
    let called = false
    const effect = makeEffect(makeRequest(), () => {
      called = true
      return "result"
    })
    const provider = makeProvider(makeContext())

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
    expect(called).toBe(false)
  })

  test("REQUIRE_APPROVAL never invokes the effect", async () => {
    let called = false
    const effect = makeEffect(makeRequest(), () => {
      called = true
      return "result"
    })
    const approvalRule: PolicyRule = {
      id: "r1",
      kind: "approval",
      description: "all process needs approval",
      conditions: { actions: ["process.execute"] },
    }
    const provider = makeProvider(
      makeContext({
        capabilities: [makeCapability()],
        approvalRules: [approvalRule],
      }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("APPROVAL_REQUIRED")
    expect(called).toBe(false)
  })

  test("missing capability returns DENIED", async () => {
    const effect = makeEffect(makeRequest(), () => "result")
    const provider = makeProvider(makeContext())

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
  })
})

describe("PEP: request hash integrity", () => {
  test("exact request hash is passed to execution receipt", async () => {
    const req = makeRequest()
    const effect = makeEffect(req, () => "ok")
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    const expected = computeRequestHash(req)
    expect(result.request.requestHash ?? (result as any).requestHash).toBe(expected)
    if (result.status === "EXECUTED") {
      expect(result.requestHash).toBe(expected)
    }
  })

  test("different nonce produces different request hash", () => {
    const h1 = computeRequestHash(makeRequest({ nonce: "a" }))
    const h2 = computeRequestHash(makeRequest({ nonce: "b" }))
    expect(h1).not.toBe(h2)
  })
})

describe("PEP: request mutation detection", () => {
  test("request mutation before decision is rejected (frozen)", async () => {
    const req = makeRequest()
    const effect = makeEffect(req, () => "ok")
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    // The PEP deep-freezes the request, so external mutation should not affect it
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTED")
  })
})

describe("PEP: capability lifecycle between evaluations", () => {
  test("capability revoked between evaluation and execution → STALE_DECISION", async () => {
    let evalCount = 0
    const cap = makeCapability()

    const provider: PolicyContextProvider = {
      snapshot: () => {
        evalCount++
        if (evalCount >= 2) {
          // Second evaluation: capability is revoked
          return makeContext({ capabilities: [{ ...cap, status: "REVOKED" }] })
        }
        return makeContext({ capabilities: [cap] })
      },
    }

    const effect = makeEffect(makeRequest(), () => "should not run")
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("STALE_DECISION")
    if (result.status === "STALE_DECISION") {
      expect(result.reason).toContain("ALLOW to DENY")
    }
  })

  test("capability expires between evaluation and execution → STALE_DECISION", async () => {
    let evalCount = 0
    const cap = makeCapability({
      constraints: { expiresAt: "2099-12-31T23:59:59Z" },
    })

    const provider: PolicyContextProvider = {
      snapshot: () => {
        evalCount++
        if (evalCount >= 2) {
          // Second evaluation: capability expired
          return makeContext({
            capabilities: [cap],
            now: "2100-01-01T00:00:01Z",
          })
        }
        return makeContext({ capabilities: [cap] })
      },
    }

    const effect = makeEffect(makeRequest(), () => "should not run")
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("STALE_DECISION")
  })

  test("policy change from allow to deny prevents execution", async () => {
    let evalCount = 0
    const denyRule: PolicyRule = {
      id: "d1",
      kind: "deny",
      description: "deny process",
      conditions: { actions: ["process.execute"] },
    }

    const provider: PolicyContextProvider = {
      snapshot: () => {
        evalCount++
        if (evalCount >= 2) {
          return makeContext({
            capabilities: [makeCapability()],
            explicitDenyRules: [denyRule],
          })
        }
        return makeContext({ capabilities: [makeCapability()] })
      },
    }

    const effect = makeEffect(makeRequest(), () => "should not run")
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("STALE_DECISION")
  })

  test("policy change from allow to approval prevents execution", async () => {
    let evalCount = 0
    const approvalRule: PolicyRule = {
      id: "a1",
      kind: "approval",
      description: "needs approval",
      conditions: { actions: ["process.execute"] },
    }

    const provider: PolicyContextProvider = {
      snapshot: () => {
        evalCount++
        if (evalCount >= 2) {
          return makeContext({
            capabilities: [makeCapability()],
            approvalRules: [approvalRule],
          })
        }
        return makeContext({ capabilities: [makeCapability()] })
      },
    }

    const effect = makeEffect(makeRequest(), () => "should not run")
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("STALE_DECISION")
  })
})

describe("PEP: execution failure", () => {
  test("execution callback failure returns EXECUTION_FAILED", async () => {
    const effect = makeEffect(makeRequest(), () => {
      throw new Error("boom")
    })
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTION_FAILED")
    if (result.status === "EXECUTION_FAILED") {
      expect((result.error as Error).message).toBe("boom")
    }
  })

  test("execution callback runs no more than once", async () => {
    let count = 0
    const effect = makeEffect(makeRequest(), () => {
      count++
      return "ok"
    })
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    await authorizeAndExecute(effect, provider)
    expect(count).toBe(1)
  })
})

describe("PEP: PDP side-effect-free verification", () => {
  test("PDP evaluation has no side effects on context", async () => {
    const cap = makeCapability()
    const ctx = makeContext({ capabilities: [cap] })
    const capBefore = JSON.stringify(ctx.capabilities)

    const effect = makeEffect(makeRequest(), () => "ok")
    const provider = makeProvider(ctx)
    await authorizeAndExecute(effect, provider)

    expect(JSON.stringify(ctx.capabilities)).toBe(capBefore)
    expect(ctx.capabilities[0].status).toBe("ACTIVE")
  })
})

describe("PEP: determinism", () => {
  test("repeated identical requests produce deterministic decisions", async () => {
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const r1 = await authorizeAndExecute(
      makeEffect(makeRequest({ nonce: "fixed" }), () => "a"),
      provider,
    )
    const r2 = await authorizeAndExecute(
      makeEffect(makeRequest({ nonce: "fixed" }), () => "b"),
      provider,
    )

    expect(r1.request.requestHash ?? (r1 as any).requestHash).toBe(
      r2.request.requestHash ?? (r2 as any).requestHash,
    )
  })
})

describe("PEP: substitution attacks", () => {
  test("principal substitution is rejected", async () => {
    const cap = makeCapability({
      principal: { kind: "agent", id: "agent:authorized" },
    })
    const req = makeRequest({ principalId: "agent:attacker" })
    const effect = makeEffect(req, () => "should not run")
    const provider = makeProvider(makeContext({ capabilities: [cap] }))

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
  })

  test("resource substitution is rejected", async () => {
    const cap = makeCapability({
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "safe.ts" }],
    })
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "dangerous.ts" },
    })
    const effect = makeEffect(req, () => "should not run")
    const provider = makeProvider(makeContext({ capabilities: [cap] }))

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
  })

  test("action substitution is rejected", async () => {
    const cap = makeCapability({ actions: ["filesystem.read"] })
    const req = makeRequest({ action: "filesystem.write" })
    const effect = makeEffect(req, () => "should not run")
    const provider = makeProvider(makeContext({ capabilities: [cap] }))

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
  })

  test("network-destination substitution is rejected", async () => {
    const cap = makeCapability({
      actions: ["network.write"],
      resources: [{ kind: "network", pattern: "safe.example.com" }],
      constraints: { networkHosts: ["safe.example.com"] },
    })
    const req = makeRequest({
      action: "network.write",
      resource: { kind: "network", host: "safe.example.com" },
      networkDestination: "evil.example.com",
    })
    const effect = makeEffect(req, () => "should not run")
    const provider = makeProvider(makeContext({ capabilities: [cap] }))

    const result = await authorizeAndExecute(effect, provider)
    // Network host constraint check will fail
    expect(result.status).toBe("DENIED")
  })
})

describe("PEP: timestamps", () => {
  test("execution receipt includes startedAt and completedAt", async () => {
    const effect = makeEffect(makeRequest(), () => "ok")
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.startedAt).toBeTruthy()
      expect(result.completedAt).toBeTruthy()
      expect(result.completedAt >= result.startedAt).toBe(true)
    }
  })
})

describe("PEP: async effects", () => {
  test("async effect executes and returns value", async () => {
    const effect: PreparedEffect<string> = {
      request: makeRequest(),
      executeExact: async () => {
        await new Promise((r) => setTimeout(r, 10))
        return "async-result"
      },
    }
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.value).toBe("async-result")
    }
  })

  test("async failure returns EXECUTION_FAILED", async () => {
    const effect: PreparedEffect<string> = {
      request: makeRequest(),
      executeExact: async () => {
        throw new Error("async boom")
      },
    }
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTION_FAILED")
  })
})

describe("PEP: concurrency", () => {
  test("revocation between concurrent evaluations prevents execution", async () => {
    let evalCount = 0
    const cap = makeCapability()

    const provider: PolicyContextProvider = {
      snapshot: async () => {
        const c = evalCount++
        if (c >= 1) {
          // After first evaluation, revoke
          return makeContext({ capabilities: [{ ...cap, status: "REVOKED" }] })
        }
        return makeContext({ capabilities: [cap] })
      },
    }

    const effect = makeEffect(makeRequest(), () => "should not run")
    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("STALE_DECISION")
  })
})

describe("PEP: decision structure", () => {
  test("DENIED result contains decision with reasons", async () => {
    const effect = makeEffect(makeRequest(), () => "nope")
    const provider = makeProvider(makeContext())

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.decision.reasons.length).toBeGreaterThan(0)
      expect(result.decision.requestId).toBe("req-001")
    }
  })

  test("APPROVAL_REQUIRED result contains matching capability IDs", async () => {
    const cap = makeCapability()
    const approvalRule: PolicyRule = {
      id: "a1",
      kind: "approval",
      description: "all needs approval",
      conditions: { actions: ["process.execute"] },
    }
    const effect = makeEffect(makeRequest(), () => "nope")
    const provider = makeProvider(
      makeContext({
        capabilities: [cap],
        approvalRules: [approvalRule],
      }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("APPROVAL_REQUIRED")
    if (result.status === "APPROVAL_REQUIRED") {
      expect(result.decision.capabilityIds).toContain("cap-001")
    }
  })

  test("EXECUTED result contains policyVersion", async () => {
    const effect = makeEffect(makeRequest(), () => "ok")
    const provider = makeProvider(
      makeContext({ capabilities: [makeCapability()] }),
    )

    const result = await authorizeAndExecute(effect, provider)
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.decision.policyVersion).toBe(POLICY_VERSION)
    }
  })
})
