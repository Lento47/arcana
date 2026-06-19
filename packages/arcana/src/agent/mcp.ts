/**
 * MCP (Model Context Protocol) connector for arcana CLI.
 * Reads MCP server config from opencode.json, connects, discovers tools,
 * and registers them with the agent runner.
 */
import type { AgentRunner } from "./runner.js"
import type { ToolDef } from "./types.js"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

type McpServerConfig = {
  type?: "local" | "remote"
  command?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

function loadMcpConfig(): Record<string, McpServerConfig> {
  const paths = [
    join(homedir(), ".config", "arcana", "opencode.json"),
    join(homedir(), ".config", "arcana", "opencode.jsonc"),
  ]
  for (const p of paths) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, "utf8")
      const config = JSON.parse(raw) as { mcp?: Record<string, McpServerConfig> }
      return config.mcp ?? {}
    } catch { continue }
  }
  return {}
}

export async function registerMcpTools(runner: AgentRunner, serverFilter?: string[]): Promise<string[]> {
  const config = loadMcpConfig()
  const entries = Object.entries(config)
  if (!entries.length) return []

  const connected: string[] = []
  for (const [name, cfg] of entries) {
    if (serverFilter?.length && !serverFilter.includes(name)) continue
    try {
      let transport
      if (cfg.command) {
        transport = new StdioClientTransport({ command: cfg.command[0]!, args: cfg.command.slice(1), env: cfg.env })
      } else if (cfg.url) {
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: cfg.headers ? { headers: cfg.headers } : undefined })
      } else continue

      const client = new Client({ name: "arcana-cli", version: "0.1.0" }, { capabilities: {} })
      await client.connect(transport)
      const tools = await client.listTools()

      for (const tool of tools.tools) {
        const toolName = `mcp_${name}_${tool.name}`
        const toolDef: ToolDef = {
          type: "function",
          function: {
            name: toolName,
            description: tool.description ?? `MCP tool from ${name}: ${tool.name}`,
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        }
        runner.registerTool(toolName, toolDef, async (args) => {
          const result = await client.callTool({ name: tool.name, arguments: args as Record<string, unknown> })
          const content = result.content as Array<{ text?: string; [key: string]: unknown }>
          if (result.isError) return `MCP error: ${content.map((c) => c.text ?? JSON.stringify(c)).join("\n")}`
          return content.map((c) => c.text ?? JSON.stringify(c)).join("\n")
        })
      }
      connected.push(`${name} (${tools.tools.length} tools)`)
    } catch (e) {
      console.error(`[mcp] Failed to connect to ${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return connected
}
