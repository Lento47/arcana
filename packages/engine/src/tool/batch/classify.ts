/**
 * Tool capability classification for multi-tool admission (Phase 1).
 * Keep aligned with packages/arcana/src/agent/tool-batch/classify.ts.
 */

export type ToolCapability = "read" | "network" | "write" | "verify" | "shell" | "task" | "model" | "unknown"

const READ = new Set([
  "read",
  "grep",
  "search",
  "content_search",
  "glob",
  "list",
  "skill",
  "todoread",
  "lsp",
  "codesearch",
])

/** MCP tool names matching this pattern are read-only (parallel dispatch). */
const MCP_READ_PATTERN = /search|read|list|get|query|fetch|find|lookup|describe/

const NETWORK = new Set(["webfetch", "websearch", "web_fetch", "web_search", "mcp-websearch"])

const WRITE = new Set(["edit", "write", "apply_patch", "multiedit", "delete", "rename"])

const SHELL = new Set(["bash", "shell"])

/**
 * Subagent delegations get their own pool, not the shell's single permit.
 * A wave of tasks sharing `shell` serialized to one — the operator saw a stack
 * of "alive" cards but only one child ever moved. Three run; the rest wait on
 * the pool (the queue is the semaphore, and the TUI card is their waiting
 * room), and the wave is still bounded so a fan-out cannot stampede the host.
 */
const TASK = new Set(["task"])

export function classifyToolName(name: string): ToolCapability {
  const key = name.toLowerCase()
  if (READ.has(key)) return "read"
  if (key.startsWith("mcp__") && MCP_READ_PATTERN.test(key)) return "read"
  if (NETWORK.has(key)) return "network"
  if (WRITE.has(key)) return "write"
  if (SHELL.has(key)) return "shell"
  if (TASK.has(key)) return "task"
  if (key === "question" || key === "plan" || key.startsWith("todo")) return "unknown"
  // MCP tools default to unknown (serial) until classified
  if (key.startsWith("mcp__") || key.startsWith("mcp_")) return "unknown"
  return "unknown"
}
