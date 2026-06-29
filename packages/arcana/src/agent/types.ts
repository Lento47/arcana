export type Role = "system" | "user" | "assistant" | "tool"

export type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export type ToolDef = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AgentConfig = {
  provider?: string
  model?: string
  /** Cheap model for compaction/extraction. Falls back to main model from models.dev. */
  utilityModel?: string
  apiKey?: string
  baseURL?: string
  maxTokens?: number
  temperature?: number
  /** Disable all guardrails for red/blue/purple team testing. ⚠️ UNSAFE. */
  godlike?: boolean
  allowedTools?: string
  safeMode?: boolean
  toolTimeout?: number  // milliseconds, default 30000
  maxToolRounds?: number
  maxHistoryTurns?: number
  maxToolsPerSession?: number
  maxWebFetchesPerSession?: number
  maxTokensPerSession?: number
  /** Opt-in ML response pipeline. Also enabled by ARCANA_ML_RUNTIME=1. */
  mlRuntime?: boolean
  /** Maximum silent quality revisions per final assistant response. Default: 1 when ML runtime is enabled. */
  mlSilentRevisions?: number
  proofGate?: {
    gateShellCommand(
      command: string,
      options?: { cwd?: string; approved?: boolean },
    ): Promise<{ blocked: boolean; risk: string; reasons: string[] }>
    gateFileMutation(
      path: string,
      options?: { operation?: string; approved?: boolean },
    ): Promise<{ blocked: boolean; risk: string; reasons: string[] }>
    recordContextAccess(input: {
      tool: "read" | "grep" | "glob"
      path?: string
      pattern?: string
      summary: string
      exists?: boolean
      bytes_read?: number
      result_count?: number
    }): Promise<void>
    recordFileWrite(input: {
      path: string
      mode: "proposed" | "applied" | "rejected"
      reason: string
      diff_id?: string
      bytes_written?: number
    }): Promise<void>
  }
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>

export type ToolRegistry = Map<string, { def: ToolDef; handler: ToolHandler }>

export type TurnResult = {
  content: string
  toolCalls: number
  inputTokens: number
  outputTokens: number
}
