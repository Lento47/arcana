import type { ConfigMCPV1 } from "@arcana/core/v1/config/mcp"

export type McpToolAction = "connect" | "list" | "disconnect" | "status"

export type McpConnectInput = {
  action: McpToolAction
  name?: string
  /** URL or command line. Preferred field for “connect to this MCP …”. */
  target?: string
  url?: string
  command?: string[]
  headers?: Record<string, string>
  environment?: Record<string, string>
}

export type ParsedMcpSpec =
  | { ok: true; name: string; spec: ConfigMCPV1.Info; pattern: string }
  | { ok: false; error: string }

const NAME_RE = /[^a-z0-9-]+/g

export function sanitizeMcpName(raw: string): string {
  const cleaned = raw.toLowerCase().replace(NAME_RE, "-").replace(/^-+|-+$/g, "").slice(0, 40)
  return cleaned || "mcp"
}

export function looksLikeMcpUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!URL.canParse(trimmed)) return false
  const protocol = new URL(trimmed).protocol
  return protocol === "http:" || protocol === "https:"
}

export function nameFromMcpUrl(url: string): string {
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^www\./, "")
  const port = parsed.port && parsed.port !== "80" && parsed.port !== "443" ? `-${parsed.port}` : ""
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) {
    return sanitizeMcpName(`local${port}`)
  }
  const labels = host.split(".").filter(Boolean)
  const label = labels.length >= 2 ? labels[labels.length - 2]! : labels[0] ?? "mcp"
  return sanitizeMcpName(`${label}${port}`)
}

export function nameFromMcpCommand(command: string[]): string {
  const token = [...command].reverse().find((part) => part && !part.startsWith("-")) ?? "mcp"
  const pkg = token.replace(/^@/, "").split("/")[0] ?? "mcp"
  return sanitizeMcpName(pkg)
}

export function splitCommandLine(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function parseMcpConnectSpec(input: McpConnectInput): ParsedMcpSpec {
  if (input.action !== "connect") {
    return { ok: false, error: "parseMcpConnectSpec is only for action=connect" }
  }

  const url = input.url?.trim() || (input.target && looksLikeMcpUrl(input.target) ? input.target.trim() : "")
  const command =
    input.command && input.command.length > 0
      ? input.command
      : input.target && !looksLikeMcpUrl(input.target)
        ? splitCommandLine(input.target)
        : []

  if (url && command.length > 0) {
    return { ok: false, error: "Provide either a URL or a local command, not both" }
  }
  if (!url && command.length === 0) {
    return { ok: false, error: "Provide a remote MCP URL or a local command (npx/uvx/bunx/…)" }
  }

  if (url) {
    if (!looksLikeMcpUrl(url)) return { ok: false, error: `Invalid MCP URL: ${url}` }
    const name = input.name?.trim() ? sanitizeMcpName(input.name) : nameFromMcpUrl(url)
    const headers = input.headers && Object.keys(input.headers).length > 0 ? input.headers : undefined
    return {
      ok: true,
      name,
      spec: { type: "remote", url, ...(headers ? { headers } : {}) },
      pattern: url,
    }
  }

  const name = input.name?.trim() ? sanitizeMcpName(input.name) : nameFromMcpCommand(command)
  const environment =
    input.environment && Object.keys(input.environment).length > 0 ? input.environment : undefined
  return {
    ok: true,
    name,
    spec: { type: "local", command, ...(environment ? { environment } : {}) },
    pattern: command.join(" "),
  }
}
