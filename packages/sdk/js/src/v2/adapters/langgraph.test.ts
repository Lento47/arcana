import { describe, expect, it } from "bun:test"
import { ApprovalRequiredError, AuthorizationDeniedError } from "../errors.js"
import { governedLangGraphTool } from "./langgraph.js"

const CONTEXT = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  action: "process.execute" as const,
  sensitivity: ["INTERNAL"] as Array<"PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET">,
}

describe("LangGraph governed tool adapter (E6)", () => {
  it("maps LangGraph tool calls and executes only on ALLOW", async () => {
    const seen: string[] = []
    const tool = governedLangGraphTool(
      {
        name: "search",
        description: "Search the workspace",
        invoke: async (args: { query: string }) => {
          seen.push(args.query)
          return ["result"]
        },
      },
      {
        context: CONTEXT,
        authorize: async (request) => {
          expect(request.tool).toBe("langgraph.search")
          expect(request.provenance).toContain("MCP_DESCRIPTION")
          return { decision: "ALLOW" }
        },
      },
    )
    expect(await tool.invoke({ query: "arcana" })).toEqual(["result"])
    expect(seen).toEqual(["arcana"])
  })

  it("blocks denied LangGraph invocations without executing", async () => {
    let executed = false
    const tool = governedLangGraphTool(
      {
        name: "write",
        invoke: async () => {
          executed = true
          return {}
        },
      },
      {
        context: { ...CONTEXT, action: "network.write" },
        authorize: async () => ({ decision: "DENY" as const, reason: "remote destination" }),
      },
    )
    await expect(tool.invoke({})).rejects.toBeInstanceOf(AuthorizationDeniedError)
    expect(executed).toBe(false)
  })

  it("surfaces REQUIRE_APPROVAL as ApprovalRequiredError", async () => {
    const tool = governedLangGraphTool(
      {
        name: "search",
        invoke: async () => ["result"],
      },
      {
        context: CONTEXT,
        authorize: async () => ({ decision: "REQUIRE_APPROVAL" as const, reason: "manual gate" }),
      },
    )
    await expect(tool.invoke({})).rejects.toBeInstanceOf(ApprovalRequiredError)
  })
})
