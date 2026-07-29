import { describe, expect, test } from "bun:test"
import {
  toolToAction,
  buildAuthorizationRequest,
  authorizeTool,
} from "@arcana/core/capability/pep-integration"
import type { ToolCallContext } from "@arcana/core/capability/pep-integration"
import type { PolicyContext } from "@arcana/core/capability/pdp"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── P0 Tool Names (from security-boundary audit) ──────────────────────

const P0_TOOLS = [
  "terminal",
  "write_file",
  "patch",
  "send_message",
  "web_fetch",
  "delegate_task",
  "cronjob",
  "git_commit",
  "git_autocommit",
  "env_install",
  "env_write",
  "env_clean",
  "skill_create",
]

// ── Helpers ───────────────────────────────────────────────────────────

const NOW = "2026-07-29T12:00:00Z"

function makeCapability(): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: [
      "process.execute",
      "filesystem.read",
      "filesystem.write",
      "filesystem.delete",
      "network.read",
      "network.write",
      "secret.use",
      "git.commit",
      "delegate",
    ],
    resources: [
      { kind: "process", pattern: "bun" },
      { kind: "file", pattern: "/*" },
      { kind: "directory", pattern: "/*" },
      { kind: "network", pattern: "*" },
      { kind: "git", pattern: "*" },
      { kind: "secret", pattern: "*" },
    ],
    constraints: {},
    delegation: { allowed: true, maximumDepth: 3, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
  }
}

function makeContext(): PolicyContext {
  return {
    now: NOW,
    policyVersion: "phase-c-v1",
    capabilities: [makeCapability()],
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED",
  }
}

function makeToolCtx(toolName: string): ToolCallContext {
  return {
    toolName,
    principalId: "agent:main",
    sessionId: "sess-abc",
    args: { command: "bun test" },
    executable: "bun",
    arguments: ["test"],
    workingDirectory: "/workspace",
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("P0 tool mapping", () => {
  test("every P0 tool maps to a valid action", () => {
    for (const tool of P0_TOOLS) {
      const { action, resourceKind } = toolToAction(tool)
      expect(action).toBeTruthy()
      expect(resourceKind).toBeTruthy()
    }
  })

  test("terminal → process.execute", () => {
    expect(toolToAction("terminal").action).toBe("process.execute")
  })

  test("write_file → filesystem.write", () => {
    expect(toolToAction("write_file").action).toBe("filesystem.write")
  })

  test("patch → filesystem.write", () => {
    expect(toolToAction("patch").action).toBe("filesystem.write")
  })

  test("send_message → network.write", () => {
    expect(toolToAction("send_message").action).toBe("network.write")
  })

  test("delegate_task → delegate", () => {
    expect(toolToAction("delegate_task").action).toBe("delegate")
  })

  test("git_commit → git.commit", () => {
    expect(toolToAction("git_commit").action).toBe("git.commit")
  })

  test("env_install → process.execute", () => {
    expect(toolToAction("env_install").action).toBe("process.execute")
  })
})

describe("P0 authorization request construction", () => {
  test("every P0 tool produces a valid AuthorizationRequest", () => {
    for (const tool of P0_TOOLS) {
      const req = buildAuthorizationRequest(makeToolCtx(tool))
      expect(req.schemaVersion).toBe("1")
      expect(req.requestId).toBeTruthy()
      expect(req.principalId).toBe("agent:main")
      expect(req.sessionId).toBe("sess-abc")
      expect(req.action).toBeTruthy()
      expect(req.resource.kind).toBeTruthy()
      expect(req.requestedAt).toBeTruthy()
      expect(req.nonce).toBeTruthy()
    }
  })

  test("different tools produce different nonces", () => {
    const reqs = P0_TOOLS.map((t) =>
      buildAuthorizationRequest(makeToolCtx(t)),
    )
    const nonces = new Set(reqs.map((r) => r.nonce))
    expect(nonces.size).toBe(P0_TOOLS.length)
  })
})

describe("P0 PEP integration", () => {
  test("authorized terminal command executes via PEP", async () => {
    let executed = false
    const result = await authorizeTool(
      makeToolCtx("terminal"),
      () => {
        executed = true
        return "output"
      },
      { snapshot: () => makeContext() },
    )
    expect(result.status).toBe("EXECUTED")
    expect(executed).toBe(true)
  })

  test("unauthorized terminal command does not execute", async () => {
    let executed = false
    const result = await authorizeTool(
      makeToolCtx("terminal"),
      () => {
        executed = true
        return "output"
      },
      {
        snapshot: () => ({
          ...makeContext(),
          capabilities: [],
        }),
      },
    )
    expect(result.status).toBe("DENIED")
    expect(executed).toBe(false)
  })

  test("unauthorized filesystem write does not execute", async () => {
    let executed = false
    const result = await authorizeTool(
      makeToolCtx("write_file"),
      () => {
        executed = true
        return "written"
      },
      {
        snapshot: () => ({
          ...makeContext(),
          capabilities: [
            {
              ...makeCapability(),
              actions: ["filesystem.read"],
            },
          ],
        }),
      },
    )
    expect(result.status).toBe("DENIED")
    expect(executed).toBe(false)
  })

  test("all P0 tools can be authorized through the PEP", async () => {
    const ctx = makeContext()
    for (const tool of P0_TOOLS) {
      const result = await authorizeTool(
        makeToolCtx(tool),
        () => "ok",
        { snapshot: () => ctx },
      )
      expect(["EXECUTED", "REQUIRE_APPROVAL"]).toContain(result.status)
    }
  })

  test("missing authorization context defaults to deny", async () => {
    const result = await authorizeTool(
      makeToolCtx("terminal"),
      () => "should not run",
      {
        snapshot: () => ({
          ...makeContext(),
          capabilities: [],
        }),
      },
    )
    expect(result.status).toBe("DENIED")
  })
})

describe("P0 bypass prevention", () => {
  test("every P0 tool has a valid action mapping", () => {
    for (const tool of P0_TOOLS) {
      const { action } = toolToAction(tool)
      expect(action).not.toBe("")
      expect(action).not.toBe(undefined as any)
    }
  })

  test("P0 inventory has at least 13 tools", () => {
    expect(P0_TOOLS.length).toBeGreaterThanOrEqual(13)
  })
})
