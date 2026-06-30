import {
  analyzeTurn,
  evaluateResponsePostflight,
  prepareResponsePreflight,
  type ResponsePipelinePostflight,
  type ResponsePipelinePreflight,
} from "@arcana/ml"
import type { AgentConfig, ChatMessage } from "./types.js"

export type MlRuntimeState = {
  enabled: boolean
  request: string
  preflight: ResponsePipelinePreflight | null
  maxSilentRevisions: number
  thinkingStyle?: "quick" | "balanced" | "deep" | "staged"
  turnSignal?: ReturnType<typeof analyzeTurn>
}

function parseEnvFlag(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "on" || value === "yes"
}

export function isMlRuntimeEnabled(config: AgentConfig): boolean {
  return config.mlRuntime === true || (config.mlRuntime !== false && parseEnvFlag(process.env.ARCANA_ML_RUNTIME))
}

export function getLastUserRequest(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === "user") return message.content
  }
  return ""
}

export function appendMlPromptAddendum(messages: ChatMessage[], addendum: string): ChatMessage[] {
  const content = addendum.trim()
  if (!content) return messages
  const mlMessage: ChatMessage = { role: "system", content }
  const [first, ...rest] = messages
  if (first?.role === "system") return [first, mlMessage, ...rest]
  return [mlMessage, ...messages]
}


export function prepareMlRuntime(
  messages: ChatMessage[],
  config: AgentConfig,
  sandboxEnabled: boolean,
  availableTools?: string[],
): MlRuntimeState {
  const enabled = isMlRuntimeEnabled(config)
  const request = getLastUserRequest(messages)
  const maxSilentRevisions = Math.max(0, Math.floor(config.mlSilentRevisions ?? 1))

  if (!enabled || !request.trim()) {
    return { enabled: false, request, preflight: null, maxSilentRevisions: 0 }
  }

  const priorTurnCount = messages.filter((m) => m.role === "user").length
  const hasToolHistory = messages.some((m) => m.role === "tool")

  const turnSignal = analyzeTurn({
    prompt: request,
    availableTools,
    sandboxEnabled,
    userSovereignty: {
      requireApprovalForWrites: true,
      requireApprovalForNetwork: true,
    },
  })

  const preflight = prepareResponsePreflight({
    request,
    reservedOutputTokens: config.maxTokens ?? 4096,
    availableTools,
    priorTurnCount,
    hasToolHistory,
    machine: {
      operation: "agent response preflight",
      persistent: false,
      canRegenerate: true,
      needsCache: false,
      containsUserData: false,
    },
    explicitConstraints: [
      "Preserve the user's request and do not rewrite their intent.",
      "Avoid generic AI filler; prefer concrete files, commands, tradeoffs, and validation when applicable.",
      "Do not write persistent ML state or raw prompt/response logs.",
      sandboxEnabled ? "Sandbox is enabled for tool execution." : "Sandbox is not enabled for tool execution.",
    ],
  })

  return {
    enabled: true,
    request,
    preflight,
    maxSilentRevisions: Math.min(maxSilentRevisions, preflight.thinking.budget.maxSilentRevisions),
    thinkingStyle: preflight.thinking.budget.style,
    turnSignal,
  }
}

export function applyMlPreflight(messages: ChatMessage[], state: MlRuntimeState): ChatMessage[] {
  if (!state.enabled || !state.preflight) return messages
  return appendMlPromptAddendum(messages, state.preflight.promptAddendum)
}

export function getMlRuntimeModelOverrides(state: MlRuntimeState): Partial<{
  maxTokens: number
  temperature: number
  maxToolRounds: number
}> {
  if (!state.enabled || !state.preflight) return {}
  const { budget } = state.preflight.thinking
  return {
    maxTokens: budget.reasoningTokens,
    temperature: budget.temperature,
    maxToolRounds: budget.maxToolRounds,
  }
}

export function evaluateMlFinalResponse(state: MlRuntimeState, response: string): ResponsePipelinePostflight | null {
  if (!state.enabled || !state.preflight || !state.request.trim()) return null
  return evaluateResponsePostflight({
    request: state.request,
    response,
    expectation: state.preflight.expectation,
  })
}

export function buildMlRevisionMessages(state: MlRuntimeState, draft: string, revisionPrompt: string): ChatMessage[] {
  const systemContent = [
    state.preflight?.promptAddendum,
    revisionPrompt,
    "Return the revised answer only. Do not mention this revision step.",
  ].filter(Boolean).join("\n\n")

  return [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: [
        "Original user request:",
        state.request,
        "",
        "Draft answer:",
        draft,
        "",
        "Revise the draft to satisfy the original request and quality requirements.",
      ].join("\n"),
    },
  ]
}
