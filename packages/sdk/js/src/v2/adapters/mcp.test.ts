import { describe, expect, it } from "bun:test"
import { AuthorizationDeniedError } from "../errors.js"
import { governedMcpTool } from "./mcp.js"

const CONTEXT: {
  principalId: string
  sessionId: string
  workspaceId: string
  action: "process.execute" | "network.write"
  executable?: string
  sensitivity: Array<"PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET">
} = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  action: "process.execute",
  sensitivity: ["INTERNAL"],
}

describe("MCP governed tool adapter (E6)", () => {
  it("maps MCP tool calls with MCP_DESCRIPTION provenance and executes only on ALLOW", async () => {
    const seen: string[] = []
    const tool = governedMcpTool(
      {
        server: "fs-server",
        name: "read",
        schemaDigest: "digest-1",
        execute: async (args: { path: string }) => {
          seen.push(args.path)
          return "content"
        },
      },
      {
        context: CONTEXT,
        authorize: async (request) => {
          expect(request.tool).toBe("mcp.fs-server.read")
          expect(request.provenance).toContain("MCP_DESCRIPTION")
          return { decision: "ALLOW" }
        },
      },
    )
    const result = await tool.execute({ path: "/workspace/a.ts" })
    expect(result).toBe("content")
    expect(seen).toEqual(["/workspace/a.ts"])
  })

  it("blocks denied MCP invocations without executing", async () => {
    let executed = false
    const tool = governedMcpTool(
      {
        server: "network-server",
        name: "send",
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
})
