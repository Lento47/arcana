import { generateText, streamText, type CoreMessage, type CoreTool } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { resolveProvider } from "./providers.js"
import type { AgentConfig, ChatMessage, TurnResult, ToolDef, ToolHandler, ToolRegistry } from "./types.js"
import { redactSecrets, checkDangerousCommand, RateLimiter, auditLog } from "./guard.js"
import { toolHistory } from "./tools.js"
import { checkSandboxPath, checkSandboxNetwork, type SandboxConfig } from "./sandbox.js"

const MAX_TOOL_ROUNDS = 10
const MAX_HISTORY_TURNS = 20  // keep system + last N turns, summarize older
const TOOL_RESULT_MAX = 2000  // truncate large tool outputs to this many chars

/** Map arcana provider ids to AI SDK language model constructors. */
async function resolveModel(config: AgentConfig, tools: ToolDef[]) {
  const profile = await resolveProvider(config.provider)
  const key = (profile.envKey ? process.env[profile.envKey] : undefined) ?? config.apiKey
  if (!key) {
    throw new Error(
      `No API key for provider "${config.provider}". Set ${profile.envKey ?? "ARCANA_API_KEY"} (or ARCANA_API_KEY / OPENAI_API_KEY).`,
    )
  }

  const modelId = config.model || profile.defaultModel || "gpt-4o"
  const aiTools: Record<string, CoreTool> = {}
  for (const t of tools) {
    aiTools[t.function.name] = {
      description: t.function.description,
      parameters: t.function.parameters as any,
    }
  }

  // Map known providers to their native SDKs; fall back to OpenAI-compatible
  const p = config.provider.toLowerCase()
  if (p === "openai") {
    const openai = createOpenAI({ apiKey: key, baseURL: config.baseURL })
    return { model: openai(modelId), tools: aiTools }
  }
  if (p === "anthropic") {
    const anthropic = createAnthropic({ apiKey: key, baseURL: config.baseURL })
    return { model: anthropic(modelId), tools: aiTools }
  }
  if (p === "google" || p === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey: key, baseURL: config.baseURL })
    return { model: google(modelId), tools: aiTools }
  }
  // OpenAI-compatible fallback — covers DeepSeek, Groq, Together, xAI, Mistral, etc.
  const compat = createOpenAICompatible({
    apiKey: key,
    baseURL: profile.baseURL ?? `https://api.${config.provider}.com/v1`,
    name: config.provider,
  })
  return { model: compat(modelId), tools: aiTools }
}

function toCoreMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages.map((m) => {
    if (m.role === "tool") return { role: "tool" as const, content: [{ type: "text" as const, text: (m.content ?? "").slice(0, TOOL_RESULT_MAX) }], toolCallId: m.tool_call_id!, toolName: (m as any).toolName ?? m.tool_call_id ?? "" }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant" as const,
        content: m.tool_calls.map((tc: any) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        })),
      }
    }
    return { role: m.role as "system" | "user" | "assistant", content: m.content ?? "" }
  })
}

export class AgentRunner {
  private tools: ToolRegistry = new Map()
  private limiter = new RateLimiter()
  private sessionId: string | null = null
  readonly sandbox: SandboxConfig | null = null

  constructor(private readonly config: AgentConfig, sandbox?: SandboxConfig) {
    this.sandbox = sandbox ?? null
  }

  /** Set session ID for audit logging. */
  setSession(id: string) { this.sessionId = id }

  registerTool(name: string, def: ToolDef, handler: ToolHandler): void {
    this.tools.set(name, { def, handler })
  }

  getToolDefs(): ToolDef[] {
    return [...this.tools.values()].map((t) => t.def)
  }

  async run(
    messages: ChatMessage[],
    onChunk?: (text: string) => void,
  ): Promise<TurnResult> {
    // Cap history: keep system message + last MAX_HISTORY_TURNS user/assistant/tool messages.
    // Dropped turns are compacted via LLM into a 2-3 sentence summary prefix.
    const systemMsg = messages.find((m) => m.role === "system")
    const rest = messages.filter((m) => m.role !== "system")
    let history: ChatMessage[]
    if (rest.length > MAX_HISTORY_TURNS) {
      const kept = rest.slice(-MAX_HISTORY_TURNS)
      const dropped = rest.slice(0, -MAX_HISTORY_TURNS)
      // Summarize dropped turns into a compact context prefix
      let compactionNote = ""
      try {
        const cheapModel = this.config.utilityModel ?? "gpt-4o-mini"
        const { model } = await resolveModel({ ...this.config, model: cheapModel } as AgentConfig, [])
        const summaryPrompt = "Summarize these conversation turns into 2-3 sentences. Include key decisions, facts, and context. Be dense."
        const summaryMsgs: ChatMessage[] = [
          { role: "system", content: summaryPrompt },
          { role: "user", content: dropped.filter((m) => m.role !== "tool").map((m) => `${m.role}: ${(m.content ?? "").slice(0, 300)}`).join("\n") },
        ]
        const compacted = await generateText({ model, messages: toCoreMessages(summaryMsgs), maxTokens: 200, temperature: 0.3 })
        compactionNote = compacted.text
      } catch { /* compaction is best-effort */ }
      history = systemMsg
        ? [systemMsg, { role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
        : [{ role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
    } else {
      history = systemMsg ? [systemMsg, ...rest] : rest
    }
    let totalInput = 0
    let totalOutput = 0
    let toolCalls = 0
    let finalContent = ""

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { model, tools } = await resolveModel(this.config, this.getToolDefs())
      const coreMessages = toCoreMessages(history)
      const hasTools = Object.keys(tools).length > 0

      if (onChunk && !hasTools) {
        // Streaming path: no tools → stream tokens directly
        const result = await streamText({
          model,
          messages: coreMessages,
          maxTokens: this.config.maxTokens ?? 4096,
          temperature: this.config.temperature ?? 0.7,
          tools: hasTools ? tools : undefined,
          maxSteps: 1,
        })
        let content = ""
        for await (const chunk of result.textStream) {
          content += chunk
          onChunk(chunk)
        }
        await result.finishReason // consume stream
        const usage = await result.usage
        totalInput += usage?.promptTokens ?? 0
        totalOutput += usage?.completionTokens ?? 0
        finalContent = content
        history.push({ role: "assistant", content })
        break
      }

      // Buffered path (tools possible)
      const result = await generateText({
        model,
        messages: coreMessages,
        maxTokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.7,
        tools: hasTools ? tools : undefined,
        maxSteps: 1,
      })

      totalInput += result.usage?.promptTokens ?? 0
      totalOutput += result.usage?.completionTokens ?? 0

      const toolRequests = result.toolCalls
      const text = result.text

      if (!toolRequests.length) {
        finalContent = text
        if (onChunk) onChunk(text)
        history.push({ role: "assistant", content: text })
        break
      }

      // Build assistant message with tool calls
      const toolCallsList = toolRequests.map((tc) => ({
        id: tc.toolCallId,
        type: "function" as const,
        function: { name: tc.toolName, arguments: JSON.stringify(tc.args) },
      }))
      history.push({ role: "assistant", content: text || null, tool_calls: toolCallsList as any })
      toolCalls += toolRequests.length

      for (const tc of toolRequests) {
        const entry = this.tools.get(tc.toolName)
        let resultStr: string
        if (!entry) {
          resultStr = `Unknown tool: ${tc.toolName}`
        } else {
          try {
            // Sandbox: path jail for file tools
            if (this.sandbox) {
              const args = tc.args as Record<string, unknown>
              const path = args.path ?? args.filePath ?? args.filepath ?? args.file
              if (path && (tc.toolName === "write" || tc.toolName === "edit" || tc.toolName === "read" || tc.toolName === "apply_patch")) {
                const blocked = checkSandboxPath(this.sandbox, String(path), tc.toolName)
                if (blocked) { resultStr = blocked; history.push({ role: "tool", tool_call_id: tc.toolCallId, content: blocked, toolName: tc.toolName } as any); continue }
              }
              // Sandbox: network jail
              const url = args.url as string
              if (url && (tc.toolName === "web_fetch" || tc.toolName === "web_search")) {
                const blocked = checkSandboxNetwork(this.sandbox, url)
                if (blocked) { resultStr = blocked; history.push({ role: "tool", tool_call_id: tc.toolCallId, content: blocked, toolName: tc.toolName } as any); continue }
              }
            }

            // Guard: rate limit (skip in godlike mode)
            if (!this.config.godlike) {
              const warn = this.limiter.check(tc.toolName)
              if (warn) resultStr = warn
            }

            // Guard: dangerous command check (skip in godlike mode)
            if (!this.config.godlike && (tc.toolName === "shell" || tc.toolName.includes("bash"))) {
              const args = tc.args as Record<string, unknown>
              const cmd = String(args.command ?? args.cmd ?? "")
              const blocked = checkDangerousCommand(cmd)
              if (blocked) { resultStr = blocked; auditLog({ tool: tc.toolName, args: tc.args, result: blocked, session: this.sessionId ?? undefined, ts: new Date().toISOString() }); history.push({ role: "tool", tool_call_id: tc.toolCallId, content: blocked, toolName: tc.toolName } as any); continue }
            }

            // Execute (redact secrets only if not godlike)
            const rawArgs = JSON.stringify(tc.args)
            resultStr = await entry.handler(tc.args as Record<string, unknown>)
            resultStr = this.config.godlike ? resultStr : redactSecrets(resultStr)
            if (!this.config.godlike) auditLog({ tool: tc.toolName, args: tc.args, result: resultStr.slice(0, 200), session: this.sessionId ?? undefined, ts: new Date().toISOString() })
            toolHistory.push({ name: tc.toolName, ts: Date.now() })
          } catch (e) {
            resultStr = `Tool error: ${String(e)}`
            auditLog({ tool: tc.toolName, args: tc.args, result: `ERROR: ${e}`, session: this.sessionId ?? undefined, ts: new Date().toISOString() })
          }
        }
        // Truncate large tool results to keep context manageable
        const truncated = resultStr.length > TOOL_RESULT_MAX
          ? resultStr.slice(0, TOOL_RESULT_MAX) + `\n...(truncated ${resultStr.length - TOOL_RESULT_MAX} chars)`
          : resultStr
        history.push({ role: "tool", tool_call_id: tc.toolCallId, content: truncated, toolName: tc.toolName } as any)
      }
    }

    return { content: finalContent, toolCalls, inputTokens: totalInput, outputTokens: totalOutput }
  }
}
