import { Effect, Schema } from "effect"
import { Config } from "@/config/config"
import { MCP } from "@/mcp"
import * as Tool from "./tool"
import DESCRIPTION from "./mcp.txt"
import { parseMcpConnectSpec, type McpToolAction } from "./mcp-spec"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["connect", "list", "status", "disconnect"]).annotate({
    description: "connect = persist and attach; list/status = show servers; disconnect = disable one server",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Server name. Optional for connect — derived from the URL or package if omitted.",
  }),
  target: Schema.optional(Schema.String).annotate({
    description: "Remote MCP URL or local command line. Preferred for “connect to this MCP …”.",
  }),
  url: Schema.optional(Schema.String).annotate({ description: "Remote MCP HTTP/SSE URL" }),
  command: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Local MCP argv, e.g. [\"npx\", \"-y\", \"@playwright/mcp\"]",
  }),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "HTTP headers for a remote server (Authorization, …)",
  }),
  environment: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Environment variables for a local server",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

function formatStatus(name: string, status: MCP.Status | undefined): string {
  if (!status) return `${name}: unknown`
  switch (status.status) {
    case "connected":
      return `${name}: connected`
    case "disabled":
      return `${name}: disabled`
    case "needs_auth":
      return `${name}: needs authentication`
    case "needs_client_registration":
      return `${name}: needs client registration — ${status.error}`
    case "failed":
      return `${name}: failed — ${status.error}`
  }
}

type Metadata = {
  action: string
  name?: string
  status?: MCP.Status
  servers?: string[]
  tools?: string[]
  authorizationUrl?: string
}

export const McpTool = Tool.define<typeof Parameters, Metadata, MCP.Service | Config.Service>(
  "mcp",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
    const config = yield* Config.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const action = params.action as McpToolAction

          if (action === "list" || action === "status") {
            const statuses = yield* mcp.status()
            const names = Object.keys(statuses)
            if (params.name) {
              const one = statuses[params.name]
              return {
                title: `MCP ${params.name}`,
                output: formatStatus(params.name, one),
                metadata: { action, name: params.name, status: one },
              }
            }
            if (names.length === 0) {
              return {
                title: "MCP servers",
                output: "No MCP servers configured. Use action=connect with a URL or command.",
                metadata: { action, servers: [] },
              }
            }
            return {
              title: "MCP servers",
              output: names.map((name) => formatStatus(name, statuses[name])).join("\n"),
              metadata: { action, servers: names },
            }
          }

          if (action === "disconnect") {
            const name = params.name?.trim()
            if (!name) throw new Error("disconnect requires name")
            yield* ctx.ask({
              permission: "mcp",
              patterns: [name],
              always: [name],
              metadata: { action: "disconnect" },
            })
            yield* mcp.disconnect(name)
            return {
              title: `MCP ${name} disconnected`,
              output: `${name}: disabled for this session`,
              metadata: { action, name },
            }
          }

          const parsed = parseMcpConnectSpec(params)
          if (!parsed.ok) throw new Error(parsed.error)

          yield* ctx.ask({
            permission: "mcp",
            patterns: [parsed.pattern],
            always: [parsed.name, parsed.pattern],
            metadata: {
              action: "connect",
              name: parsed.name,
              type: parsed.spec.type,
            },
          })

          yield* config.update({ mcp: { [parsed.name]: parsed.spec } })
          const added = yield* mcp.add(parsed.name, parsed.spec)
          const statuses = added.status as Record<string, MCP.Status>
          const status = statuses[parsed.name]

          const tools = yield* mcp.tools()
          const listed = Object.keys(tools)

          if (status?.status === "needs_auth") {
            const auth = yield* mcp.startAuth(parsed.name).pipe(Effect.catch(() => Effect.succeed(undefined)))
            const url = auth && "authorizationUrl" in auth ? auth.authorizationUrl : undefined
            return {
              title: `MCP ${parsed.name} needs authentication`,
              output: [
                formatStatus(parsed.name, status),
                url ? `Open this URL to authorize: ${url}` : "Run: arcana mcp auth " + parsed.name,
                "After auth, tools from this server become available.",
              ].join("\n"),
              metadata: { action: "connect", name: parsed.name, status, authorizationUrl: url },
            }
          }

          if (status?.status === "connected") {
            return {
              title: `MCP ${parsed.name} connected`,
              output: [
                formatStatus(parsed.name, status),
                parsed.spec.type === "remote" ? `url: ${parsed.spec.url}` : `command: ${parsed.spec.command.join(" ")}`,
                listed.length
                  ? `tools now available (${listed.length}): ${listed.slice(0, 24).join(", ")}${listed.length > 24 ? "…" : ""}`
                  : "connected, no tools advertised yet — they appear on the next turn",
              ].join("\n"),
              metadata: { action: "connect", name: parsed.name, status, tools: listed },
            }
          }

          return {
            title: `MCP ${parsed.name}`,
            output: [
              formatStatus(parsed.name, status),
              "Config was saved. If this failed, check the URL/command and retry connect.",
            ].join("\n"),
            metadata: { action: "connect", name: parsed.name, status, tools: listed },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
