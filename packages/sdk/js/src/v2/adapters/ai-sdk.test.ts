import { describe, expect, it } from "bun:test"
import {
  AuthorizationDeniedError,
  ApprovalRequiredError,
} from "../errors.js"
import { governedTool, type AuthorizeFn } from "./ai-sdk.js"
import type { GovernanceContext } from "../governance.js"

const CONTEXT: GovernanceContext = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  action: "process.execute",
  executable: "bun",
  provenance: ["USER_INSTRUCTION"],
  sensitivity: ["INTERNAL"],
}

describe("AI SDK governed tool adapter (E6)", () => {
  it("executes only after ALLOW and binds the exact request", async () => {
    const executed: string[] = []
    const exactRequests: string[] = []
    const authorize: AuthorizeFn = async (request) => {
      exactRequests.push(request.requestHash)
      return { decision: "ALLOW" }
    }
    const tool = governedTool(
      {
        name: "run",
        execute: async (args: { command: string }) => {
          executed.push(args.command)
          return { ok: true }
        },
      },
      {
        context: CONTEXT,
        authorize,
        executeExact: async (request, execute) => {
          exactRequests.push(`${request.requestHash}:exact`)
          return execute()
        },
      },
    )

    const result = await tool.execute({ command: "bun test" })
    expect(result).toEqual({ ok: true })
    expect(executed).toEqual(["bun test"])
    expect(exactRequests.length).toBe(2)
    expect(exactRequests[1]).toBe(`${exactRequests[0]}:exact`)
  })

  it("throws a stable error on DENY without executing", async () => {
    let executed = false
    const tool = governedTool(
      {
        name: "rm",
        execute: async () => {
          executed = true
          return {}
        },
      },
      {
        context: { ...CONTEXT, action: "filesystem.delete" },
        authorize: async (request) => ({
          decision: "DENY" as const,
          reason: "outside workspace",
        }),
      },
    )
    await expect(tool.execute({ path: "/etc/passwd" })).rejects.toBeInstanceOf(AuthorizationDeniedError)
    expect(executed).toBe(false)
  })

  it("surfaces REQUIRE_APPROVAL as ApprovalRequiredError", async () => {
    const tool = governedTool(
      {
        name: "push",
        execute: async () => ({}),
      },
      {
        context: { ...CONTEXT, action: "git.push" },
        authorize: async () => ({ decision: "REQUIRE_APPROVAL" as const, reason: "exact approval" }),
      },
    )
    await expect(tool.execute({})).rejects.toBeInstanceOf(ApprovalRequiredError)
  })
})
