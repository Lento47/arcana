import { describe, expect, it } from "bun:test"
import { ApprovalRequiredError, AuthorizationDeniedError } from "../errors.js"
import { governedMastraTool } from "./mastra.js"

const CONTEXT = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  action: "process.execute" as const,
  sensitivity: ["INTERNAL"] as Array<"PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET">,
}

describe("Mastra governed tool adapter (E6)", () => {
  it("maps Mastra tool calls and executes only on ALLOW", async () => {
    const seen: string[] = []
    const tool = governedMastraTool(
      {
        id: "read_file",
        description: "Read a file",
        execute: async (args: { path: string }) => {
          seen.push(args.path)
          return "content"
        },
      },
      {
        context: CONTEXT,
        authorize: async (request) => {
          expect(request.tool).toBe("mastra.read_file")
          expect(request.provenance).toContain("MCP_DESCRIPTION")
          return { decision: "ALLOW" }
        },
        executeExact: async (_request, execute) => execute(),
      },
    )
    expect(await tool.execute({ path: "/workspace/a.ts" })).toBe("content")
    expect(seen).toEqual(["/workspace/a.ts"])
  })

  it("blocks denied Mastra invocations without executing", async () => {
    let executed = false
    const tool = governedMastraTool(
      {
        id: "network_send",
        execute: async () => {
          executed = true
          return {}
        },
      },
      {
        context: { ...CONTEXT, action: "network.write" },
        authorize: async () => ({ decision: "DENY" as const, reason: "remote destination" }),
      },
    )
    await expect(tool.execute({})).rejects.toBeInstanceOf(AuthorizationDeniedError)
    expect(executed).toBe(false)
  })

  it("surfaces REQUIRE_APPROVAL as ApprovalRequiredError", async () => {
    const tool = governedMastraTool(
      {
        id: "read_file",
        execute: async () => "content",
      },
      {
        context: CONTEXT,
        authorize: async () => ({ decision: "REQUIRE_APPROVAL" as const, reason: "manual gate" }),
      },
    )
    await expect(tool.execute({})).rejects.toBeInstanceOf(ApprovalRequiredError)
  })
})
