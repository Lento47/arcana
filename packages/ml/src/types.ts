export type SignalIntent =
  | "chat"
  | "code_edit"
  | "repo_analysis"
  | "research"
  | "debugging"
  | "automation"
  | "review"
  | "unknown"

export type RiskLevel = "low" | "medium" | "high"

export type ExecutionPosture = "observe" | "assist" | "sandbox" | "approval"

export type ModelRouteHint = {
  profile: "fast" | "balanced" | "reasoning" | "code" | "local" | "vision" | "unknown"
  reason: string
}

export type SignalScore = {
  value: number
  reasons: string[]
}

export type TurnSignalInput = {
  prompt: string
  cwd?: string
  availableTools?: string[]
  recentToolCalls?: string[]
  memoryCandidateCount?: number
  sandboxEnabled?: boolean
  userSovereignty?: {
    preferLocal?: boolean
    requireApprovalForWrites?: boolean
    requireApprovalForNetwork?: boolean
  }
}

export type ToolSignalInput = {
  toolName: string
  args?: Record<string, unknown>
  sandboxEnabled?: boolean
  userSovereignty?: TurnSignalInput["userSovereignty"]
}

export type TurnSignal = {
  kind: "turn"
  intent: SignalIntent
  risk: RiskLevel
  executionPosture: ExecutionPosture
  modelRoute: ModelRouteHint
  confidence: SignalScore
  needs: {
    sandbox: boolean
    approval: boolean
    web: boolean
    memory: boolean
  }
  labels: string[]
  reasons: string[]
}

export type ToolSignal = {
  kind: "tool"
  toolName: string
  risk: RiskLevel
  executionPosture: ExecutionPosture
  confidence: SignalScore
  labels: string[]
  reasons: string[]
}

export type SignalEngine = {
  analyzeTurn(input: TurnSignalInput): TurnSignal
  analyzeTool(input: ToolSignalInput): ToolSignal
}
