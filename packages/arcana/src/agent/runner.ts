import { generateText, streamText, type ModelMessage } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { resolveProvider } from "./providers.js"
import type { AgentConfig, ChatMessage, TurnResult, ToolDef, ToolHandler, ToolRegistry } from "./types.js"
import { redactSecrets, checkDangerousCommand, RateLimiter, auditLog } from "./guard.js"
import { toolHistory } from "./tools.js"
import { checkSandboxPath, checkSandboxNetwork, type SandboxConfig } from "./sandbox.js"
import { applyMlPreflight, buildMlRevisionMessages, evaluateMlFinalResponse, prepareMlRuntime } from "./ml-runtime.js"

const TOOL_RESULT_MAX = 2000  // truncate large tool outputs to this many chars

/** Map arcana provider ids to AI SDK language model constructors. */
async function resolveModel(config: AgentConfig, tools: ToolDef[]) {
  if (!config.provider) {
    throw new Error(
      "No provider configured. Set a provider in ~/.arcana/config.json, pass --provider, or set a provider env key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.).",
    )
  }
  const profile = await resolveProvider(config.provider)
  const key = (profile.envKey ? process.env[profile.envKey] : undefined) ?? config.apiKey
  if (!key) {
    throw new Error(
      `No API key for provider "${config.provider}". Set ${profile.envKey ?? "ARCANA_API_KEY"} (or set the env var from models.dev).`,
    )
  }

  const modelId = config.model || profile.defaultModel
  if (!modelId) {
    throw new Error(
      `No model configured for provider "${config.provider}". Set a model in ~/.arcana/config.json or pass --model.`,
    )
  }
  const aiTools: Record<string, any> = {}
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

function toCoreMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "tool") return {
      role: "tool" as const,
      content: [{
        type: "tool-result" as const,
        toolCallId: m.tool_call_id!,
        toolName: (m as any).toolName ?? m.tool_call_id ?? "",
        output: { type: "text" as const, value: (m.content ?? "").slice(0, TOOL_RESULT_MAX) },
      }],
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant" as const,
        content: m.tool_calls.map((tc: any) => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        })),
      }
    }
    return { role: m.role as "system" | "user" | "assistant", content: m.content ?? "" }
  })
}

export class AgentRunner {
  private tools: ToolRegistry = new Map()
  private limiter: RateLimiter
  private sessionId: string | null = null
  readonly sandbox: SandboxConfig | null = null

  readonly config: AgentConfig

  constructor(config: AgentConfig, sandbox?: SandboxConfig) {
    this.config = config
    this.sandbox = sandbox ?? null
    this.limiter = new RateLimiter(this.config.maxToolsPerSession, this.config.maxWebFetchesPerSession)
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
    const systemMsg = messages.find((m) => m.role === "system")
    const rest = messages.filter((m) => m.role !== "system")
    let history: ChatMessage[]
    if (rest.length > (this.config.maxHistoryTurns ?? 20)) {
      const userIndices: number[] = []
      for (let i = rest.length - 1; i >= 0 && userIndices.length < 3; i--) {
        if (rest[i]!.role === "user") userIndices.push(i)
      }
      userIndices.sort((a, b) => a - b)
      const keepFromIdx = userIndices[0]!
      const kept = rest.slice(keepFromIdx)
      const dropped = rest.slice(0, keepFromIdx)
      let compactionNote = ""
      try {
        const cheapModel = this.config.utilityModel || this.config.model
        const { model } = await resolveModel({ ...this.config, model: cheapModel } as AgentConfig, [])
        const summaryPrompt = "Summarize these conversation turns into 2-3 sentences capturing key decisions, facts, and context. Prioritize information still relevant to the current task."
        const summaryMsgs: ChatMessage[] = [
          { role: "system", content: summaryPrompt },
          { role: "user", content: dropped.filter((m) => m.role !== "tool").map((m) => `${m.role}: ${(m.content ?? "").slice(0, 300)}`).join("\n") },
        ]
        const compacted = await generateText({ model, messages: toCoreMessages(summaryMsgs), maxOutputTokens: 200, temperature: 0.3 })
        compactionNote = compacted.text
      } catch {}
      history = systemMsg
        ? [systemMsg, { role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
        : [{ role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
    } else {
      history = systemMsg ? [systemMsg, ...rest] : rest
    }

    const mlRuntime = prepareMlRuntime(history, this.config, Boolean(this.sandbox))
    history = applyMlPreflight(history, mlRuntime)

    let totalInput = 0
    let totalOutput = 0
    let toolCalls = 0
    let finalContent = ""

    const toolResultCache = new Map<string, { result: string; ts: number }>()
    // Only read-only/idempotent tools may be cached. Caching side-effectful tools
    // (bash/shell, write, edit, speak, memory_store_fact, ...) would silently skip
    // a real second execution of an identical call within the 5s window.
    const CACHEABLE_TOOLS = new Set(["web_search", "web_fetch", "memory_search", "skill_list"])
    for (let round = 0; round < (this.config.maxToolRounds ?? 10); round++) {
      const { model, tools } = await resolveModel(this.config, this.getToolDefs())
      const coreMessages = toCoreMessages(history)
      const hasTools = Object.keys(tools).length > 0

      if (onChunk && !hasTools) {
        // Streaming path: no tools → stream tokens directly. ML preflight still
        // applies, but postflight cannot silently revise already-emitted tokens.
        const result = await streamText({
          model,
          messages: coreMessages,
          maxOutputTokens: this.config.maxTokens ?? 4096,
          temperature: this.config.temperature ?? 0.7,
          tools: hasTools ? tools : undefined,
        })
        let content = ""
        for await (const chunk of result.textStream) {
          content += chunk
          onChunk(chunk)
        }
        await result.finishReason // consume stream
        const usage = await result.usage
        totalInput += usage?.inputTokens ?? 0
        totalOutput += usage?.outputTokens ?? 0
        finalContent = content
        history.push({ role: "assistant", content })
        break
      }

      // Buffered path (tools possible)
      const result = await generateText({
        model,
        messages: coreMessages,
        maxOutputTokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.7,
        tools: hasTools ? tools : undefined,
      })

      totalInput += result.usage?.inputTokens ?? 0
      totalOutput += result.usage?.outputTokens ?? 0

      const toolRequests = result.toolCalls
      const text = result.text

      if (!toolRequests.length) {
        let finalText = text
        const postflight = evaluateMlFinalResponse(mlRuntime, text)
        if (postflight?.shouldRevise && postflight.revisionPrompt && mlRuntime.maxSilentRevisions > 0) {
          try {
            const revisionMessages = buildMlRevisionMessages(mlRuntime, text, postflight.revisionPrompt)
            const revised = await generateText({
              model,
              messages: toCoreMessages(revisionMessages),
              maxOutputTokens: this.config.maxTokens ?? 4096,
              temperature: Math.min(this.config.temperature ?? 0.7, 0.4),
            })
            totalInput += revised.usage?.inputTokens ?? 0
            totalOutput += revised.usage?.outputTokens ?? 0
            if (revised.text.trim()) finalText = revised.text
          } catch (error) {
            if (!this.config.godlike) {
              auditLog({
                tool: "ml_quality_revision",
                args: { verdict: postflight.quality.verdict },
                result: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
                session: this.sessionId ?? undefined,
                ts: new Date().toISOString(),
              })
            }
          }
        }
        finalContent = finalText
        if (onChunk) onChunk(finalText)
        history.push({ role: "assistant", content: finalText })
        break
      }

      // Build assistant message with tool calls
      const toolCallsList = toolRequests.map((tc) => ({
        id: tc.toolCallId,
        type: "function" as const,
        function: { name: tc.toolName, arguments: JSON.stringify(tc.input) },
      }))
      history.push({ role: "assistant", content: text || null, tool_calls: toolCallsList as any })
      toolCalls += toolRequests.length

      const WRITE_TOOLS = new Set(["write", "edit", "apply_patch", "delete", "rename", "env_write", "env_install", "env_clean", "skill_create"])

      for (const tc of toolRequests) {
        let resultStr: string
        if (this.config.safeMode && WRITE_TOOLS.has(tc.toolName)) {
          resultStr = `[SAFE MODE] Tool "${tc.toolName}" is disabled in safe mode. Use --safe=false to enable write tools.`
          history.push({ role: "tool", tool_call_id: tc.toolCallId, content: resultStr, toolName: tc.toolName } as any)
          continue
        }
        const allowedTools = this.config.allowedTools ?? process.env.ARCANA_ALLOWED_TOOLS
        if (allowedTools && !this.config.godlike) {
          const allowed = new Set(allowedTools.split(","))
          if (!allowed.has("*") && !allowed.has(tc.toolName)) {
            resultStr = `[LICENSE] Tool "${tc.toolName}" is not available on your plan. Upgrade at https://arcana.otnelhq.com`
            history.push({ role: "tool", tool_call_id: tc.toolCallId, content: resultStr, toolName: tc.toolName } as any)
            continue
          }
        }
        const entry = this.tools.get(tc.toolName)
        if (!entry) {
          resultStr = `Unknown tool: ${tc.toolName}`
        } else {
          try {
            // Sandbox: path jail for file tools
            if (this.sandbox) {
              const args = tc.input as Record<string, unknown>
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
              const args = tc.input as Record<string, unknown>
              const cmd = String(args.command ?? args.cmd ?? "")
              const blocked = checkDangerousCommand(cmd)
              if (blocked) { resultStr = blocked; auditLog({ tool: tc.toolName, args: tc.input, result: blocked, session: this.sessionId ?? undefined, ts: new Date().toISOString() }); history.push({ role: "tool", tool_call_id: tc.toolCallId, content: blocked, toolName: tc.toolName } as any); continue }
            }

            const cacheKey = `${tc.toolName}:${JSON.stringify(tc.input)}`
            const cacheable = CACHEABLE_TOOLS.has(tc.toolName)
            const cached = cacheable ? toolResultCache.get(cacheKey) : undefined
            if (cached && (Date.now() - cached.ts) < 5000) {
              toolResultCache.delete(cacheKey)
              toolResultCache.set(cacheKey, cached)
              resultStr = cached.result
              history.push({ role: "tool", tool_call_id: tc.toolCallId, content: resultStr, toolName: tc.toolName } as any)
              continue
            }

            // Parallel execution for batch tool
            if (tc.toolName === "batch") {
              const batchArgs = tc.input as any
              const batchCalls = batchArgs?.calls as Array<{ tool: string; args: Record<string, unknown> }> | undefined
              if (batchCalls?.length) {
                const batchResults = await Promise.all(batchCalls.map(async (batchCall) => {
                  const batchEntry = this.tools.get(batchCall.tool)
                  if (!batchEntry) return `"${batchCall.tool}": unknown tool`
                  // Sub-calls must pass the same guards as top-level calls — otherwise
                  // `batch: [{tool:"bash", command:"rm -rf /"}]` bypasses them entirely.
                  if (!this.config.godlike) {
                    try { this.limiter.check(batchCall.tool) } catch (e) {
                      return `"${batchCall.tool}": ${e instanceof Error ? e.message : String(e)}`
                    }
                    if (batchCall.tool === "shell" || batchCall.tool.includes("bash")) {
                      const a = (batchCall.args ?? {}) as Record<string, unknown>
                      const cmd = String(a.command ?? a.cmd ?? "")
                      const blocked = checkDangerousCommand(cmd)
                      if (blocked) {
                        auditLog({ tool: batchCall.tool, args: batchCall.args, result: blocked, session: this.sessionId ?? undefined, ts: new Date().toISOString() })
                        return `"${batchCall.tool}": ${blocked}`
                      }
                    }
                  }
                  try {
                    const result = await batchEntry.handler(batchCall.args)
                    return `"${batchCall.tool}": ${result.slice(0, 500)}`
                  } catch (e) {
                    return `"${batchCall.tool}": error - ${String(e)}`
                  }
                }))
                resultStr = `Parallel results:\n${batchResults.join("\n")}`
                history.push({ role: "tool", tool_call_id: tc.toolCallId, content: resultStr, toolName: tc.toolName } as any)
                continue
              }
            }

            // Execute (redact secrets only if not godlike)
            const rawArgs = JSON.stringify(tc.input)
            const timeout = this.config.toolTimeout ?? 30000
            const resultPromise = entry.handler(tc.input as Record<string, unknown>)
            resultStr = await Promise.race([
              resultPromise,
              new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Tool timed out after ${timeout}ms`)), timeout),
              ),
            ])
            resultStr = this.config.godlike ? resultStr : redactSecrets(resultStr)
            if (cacheable) {
              toolResultCache.set(cacheKey, { result: resultStr, ts: Date.now() })
              if (toolResultCache.size > 50) {
                const oldest = toolResultCache.keys().next().value
                if (oldest) toolResultCache.delete(oldest)
              }
            }
            if (!this.config.godlike) auditLog({ tool: tc.toolName, args: tc.input, result: resultStr.slice(0, 200), session: this.sessionId ?? undefined, ts: new Date().toISOString() })
            toolHistory.push({ name: tc.toolName, ts: Date.now() })
          } catch (e) {
            resultStr = `Tool error: ${String(e)}`
            auditLog({ tool: tc.toolName, args: tc.input, result: `ERROR: ${e}`, session: this.sessionId ?? undefined, ts: new Date().toISOString() })
          }
        }
        // Truncate large tool results to keep context manageable
        const truncated = resultStr.length > TOOL_RESULT_MAX
          ? resultStr.slice(0, TOOL_RESULT_MAX) + `\n...(truncated ${resultStr.length - TOOL_RESULT_MAX} chars)`
          : resultStr
        history.push({ role: "tool", tool_call_id: tc.toolCallId, content: truncated, toolName: tc.toolName } as any)
      }
    }

    if (this.config.maxTokensPerSession && totalInput > this.config.maxTokensPerSession * 0.8) {
    }

    return { content: finalContent, toolCalls, inputTokens: totalInput, outputTokens: totalOutput }
  }
}
