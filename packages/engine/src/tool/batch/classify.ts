/**
 * Tool capability classification for multi-tool admission (Phase 1).
 * Keep aligned with packages/arcana/src/agent/tool-batch/classify.ts.
 */

export type ToolCapability = "read" | "network" | "write" | "verify" | "shell" | "model" | "unknown"

const READ = new Set([
  "read",
  "grep",
  "glob",
  "list",
  "skill",
  "todoread",
  "lsp",
  "codesearch",
])

const NETWORK = new Set(["webfetch", "websearch", "web_fetch", "web_search", "mcp-websearch"])

const WRITE = new Set(["edit", "write", "apply_patch", "multiedit", "delete", "rename"])

const SHELL = new Set(["bash", "shell", "task"])

export function classifyToolName(name: string): ToolCapability {
  const key = name.toLowerCase()
  if (READ.has(key) || key.startsWith("mcp__") && key.includes("search")) return "read"
  if (NETWORK.has(key)) return "network"
  if (WRITE.has(key)) return "write"
  if (SHELL.has(key)) return "shell"
  if (key === "question" || key === "plan" || key.startsWith("todo")) return "unknown"
  // MCP tools default to unknown (serial) until classified
  if (key.startsWith("mcp__") || key.startsWith("mcp_")) return "unknown"
  return "unknown"
}
