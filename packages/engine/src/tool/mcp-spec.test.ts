import { describe, expect, test } from "bun:test"
import {
  looksLikeMcpUrl,
  nameFromMcpCommand,
  nameFromMcpUrl,
  parseMcpConnectSpec,
  sanitizeMcpName,
} from "./mcp-spec"

describe("mcp connect spec", () => {
  test("sanitizes names", () => {
    expect(sanitizeMcpName("GitHub MCP")).toBe("github-mcp")
    expect(sanitizeMcpName("@@@")).toBe("mcp")
  })

  test("detects remote URLs", () => {
    expect(looksLikeMcpUrl("https://mcp.exa.ai/mcp")).toBe(true)
    expect(looksLikeMcpUrl("npx -y @playwright/mcp")).toBe(false)
  })

  test("names a remote server from the host", () => {
    expect(nameFromMcpUrl("https://mcp.exa.ai/mcp")).toBe("exa")
    expect(nameFromMcpUrl("http://127.0.0.1:3000/mcp")).toBe("local-3000")
  })

  test("names a local server from the package", () => {
    expect(nameFromMcpCommand(["npx", "-y", "@playwright/mcp"])).toBe("playwright")
  })

  test("connect from target URL", () => {
    const parsed = parseMcpConnectSpec({
      action: "connect",
      target: "https://mcp.exa.ai/mcp",
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.name).toBe("exa")
    expect(parsed.spec).toEqual({ type: "remote", url: "https://mcp.exa.ai/mcp" })
  })

  test("connect from target command", () => {
    const parsed = parseMcpConnectSpec({
      action: "connect",
      target: "npx -y @playwright/mcp",
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.name).toBe("playwright")
    expect(parsed.spec).toEqual({ type: "local", command: ["npx", "-y", "@playwright/mcp"] })
  })

  test("rejects missing target", () => {
    const parsed = parseMcpConnectSpec({ action: "connect" })
    expect(parsed.ok).toBe(false)
  })

  test("rejects url and command together", () => {
    const parsed = parseMcpConnectSpec({
      action: "connect",
      url: "https://example.com/mcp",
      command: ["npx", "x"],
    })
    expect(parsed.ok).toBe(false)
  })
})
