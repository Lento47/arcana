/**
 * Delegated agent entrypoints (cron, gateway) — always AgentRunner + executeAuthorizedTool.
 *
 * M4 residual surface: unattended/remote sessions must not invent a second tool path.
 * They share the same recursive authorize stack as interactive runs, with safer defaults.
 */
import type { AgentConfig } from "./types.js"
import { AgentRunner } from "./runner.js"
import { registerBuiltinTools } from "./tools.js"
import { registerMcpTools } from "./mcp.js"
import type { MemoryStore } from "@arcana/memory"

export type DelegatedKind = "cron" | "gateway"

export type DelegatedRunnerOptions = {
  kind: DelegatedKind
  config: Pick<
    AgentConfig,
    | "provider"
    | "model"
    | "apiKey"
    | "utilityModel"
    | "baseURL"
    | "maxTokens"
    | "temperature"
    | "godlike"
    | "allowedTools"
    | "safeMode"
    | "toolTimeout"
    | "maxToolRounds"
    | "proofGate"
  >
  memory: MemoryStore
  skillsDirs: string[]
  sessionId: string
  /** When false, skip MCP registration (tests). Default true. */
  enableMcp?: boolean
}

/**
 * Policy profile for delegated (non-interactive) sessions.
 * Cron defaults to safeMode unless explicitly disabled.
 * Gateway keeps caller safeMode but caps tool rounds.
 */
export function delegatedAgentConfig(
  kind: DelegatedKind,
  config: DelegatedRunnerOptions["config"],
): AgentConfig {
  const cronSafe = kind === "cron" ? (config.safeMode ?? true) : config.safeMode
  const maxRounds =
    kind === "cron"
      ? Math.min(config.maxToolRounds ?? 8, 8)
      : Math.min(config.maxToolRounds ?? 12, 12)

  return {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    utilityModel: config.utilityModel,
    baseURL: config.baseURL,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    // Never godlike for unattended unless explicitly set (still discouraged).
    godlike: config.godlike === true && kind === "gateway" ? true : false,
    allowedTools: config.allowedTools,
    safeMode: cronSafe,
    toolTimeout: config.toolTimeout ?? 30_000,
    maxToolRounds: maxRounds,
    proofGate: config.proofGate,
  }
}

/**
 * Create a fully wired AgentRunner for cron/gateway: builtins + MCP handlers.
 * All tool calls (including MCP) still pass through executeAuthorizedTool at invoke time.
 */
export async function createDelegatedRunner(opts: DelegatedRunnerOptions): Promise<{
  runner: AgentRunner
  mcpServers: string[]
}> {
  const agentConfig = delegatedAgentConfig(opts.kind, opts.config)
  const runner = new AgentRunner(agentConfig)
  registerBuiltinTools(runner, opts.memory, opts.skillsDirs ?? [])
  let mcpServers: string[] = []
  if (opts.enableMcp !== false) {
    try {
      mcpServers = await registerMcpTools(runner)
    } catch {
      mcpServers = []
    }
  }
  runner.setSession(opts.sessionId.slice(0, 24))
  return { runner, mcpServers }
}
