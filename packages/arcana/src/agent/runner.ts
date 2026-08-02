import { generateText, streamText, type ModelMessage } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { resolveProvider } from "./providers.js"
import type { AgentConfig, ChatMessage, TurnResult, ToolDef, ToolHandler, ToolRegistry } from "./types.js"
import { redactSecrets, redactGitEmails, redactPII, redactGitAuthorNames, checkDangerousCommand, RateLimiter, auditLog, detectInjection } from "./guard.js"
import { toolHistory } from "./tools.js"
import { checkSandboxPath, checkSandboxNetwork, type SandboxConfig } from "./sandbox.js"
import {
  applyMlPreflight,
  buildMlRevisionMessages,
  evaluateMlFinalResponse,
  getMlRuntimeModelOverrides,
  prepareMlRuntime,
} from "./ml-runtime.js"
import {
  BatchSizeError,
  BatchToolDeniedError,
  DEFAULT_BATCH_CONFIG,
  runBatchWaves,
  validateAndPlanBatch,
} from "./tool-batch/index.js"
import { publishBatchActivity } from "./tool-batch/activity-bridge.js"

const TOOL_RESULT_MAX = 2000  // truncate large tool outputs to this many chars
const LLM_STREAM_TIMEOUT_MS = 120_000   // total timeout for streaming LLM calls
const LLM_CHUNK_TIMEOUT_MS = 30_000     // per-chunk inactivity timeout
const LLM_COMPACTION_TIMEOUT_MS = 30_000 // timeout for compaction LLM calls
type RunProofVerificationKind = "test" | "typecheck" | "lint" | "build"
type RunProofVerificationStatus = "passed" | "failed" | "skipped" | "not_run"

export function runProofVerificationKindFromShellCommand(command: string): RunProofVerificationKind | undefined {
  const normalized = command.toLowerCase().replace(/\s+/g, " ").trim()
  if (!normalized) return undefined

  if (/\b(bun|npm|pnpm|yarn|vitest|jest|mocha|ava|cargo|go|pytest|python|python3)\s+(run\s+)?test\b/.test(normalized)) return "test"
  if (/\b(test|vitest|jest|mocha|ava|pytest)\b/.test(normalized)) return "test"

  if (/\b(typecheck|tsc|tsgo)\b/.test(normalized)) return "typecheck"
  if (/\b(lint|eslint|biome|oxlint)\b/.test(normalized)) return "lint"
  if (/\b(bun|npm|pnpm|yarn|cargo|go)\s+(run\s+)?build\b/.test(normalized)) return "build"
  if (/\b(vite|tsup|rollup|webpack|next)\s+build\b/.test(normalized)) return "build"

  return undefined
}

function runProofVerificationSummary(kind: RunProofVerificationKind, command: string, status: RunProofVerificationStatus): string {
  const label = kind === "test" ? "Test command" : `${kind[0]!.toUpperCase()}${kind.slice(1)} command`
  return `${label} ${status}: ${command}`
}

/** Prefer free / small catalog models when auto-picking from proxy /models. */
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

  let modelId = config.model || profile.defaultModel
  let proxyURL = profile.baseURL // may be overridden by fallback during discovery
  const isProxyProvider =
    config.provider === "arcana-proxy"
    || (typeof profile.baseURL === "string" && /arcana-proxy|proxy-arcana|proxy\.arcana/i.test(profile.baseURL))
  // arcana-proxy discovers models at runtime — try the proxy catalog cache first,
  // then fetch live from the proxy. Avoids "No model configured" on first run.
  // Always probe bases for licensed proxy so a dead custom domain falls back to workers.dev.
  if (isProxyProvider || (!modelId && config.provider)) {
    const { readFileSync, existsSync } = await import("node:fs")
    const { join } = await import("node:path")
    const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".arcana")
    const cacheFile = join(home, "cache", "proxy-models.json")
    // Try cached proxy models first (only for model id — base URL still needs a live probe)
    if (!modelId) {
      try {
        if (existsSync(cacheFile)) {
          const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as { list?: Array<{ id?: string }>; default?: string }
          if (cached.list?.length) {
            modelId = cached.default || "openrouter/free"
          }
        }
      } catch {}
    }
    // Probe provider base URL, then Workers.dev fallback (custom domain may refuse connect)
    if (profile.baseURL && key) {
      const bases = [...new Set([
        // Rewrite multi-level broken host; prefer branded first-level + workers.dev fallback
        profile.baseURL?.includes("proxy.arcana.otnelhq.com")
          ? "https://proxy-arcana.otnelhq.com/v1"
          : profile.baseURL,
        "https://proxy-arcana.otnelhq.com/v1",
        "https://arcana-proxy.lejzerv.workers.dev/v1",
      ].filter(Boolean))]
      for (const base of bases) {
        try {
          const url = (base.endsWith("/") ? base.slice(0, -1) : base) + "/models"
          const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) })
          if (res.ok) {
            const data = await res.json() as { data?: Array<{ id?: string }>; default?: string }
            if (data.data?.length) {
              if (!modelId) modelId = data.default || "openrouter/free"
              proxyURL = base
              // Refresh cache for next cold start
              try {
                const { mkdirSync, writeFileSync, renameSync } = await import("node:fs")
                mkdirSync(join(home, "cache"), { recursive: true })
                const tmp = cacheFile + ".tmp"
                writeFileSync(tmp, JSON.stringify({ list: data.data, default: data.default || "openrouter/free", at: Date.now() }))
                renameSync(tmp, cacheFile)
              } catch {}
              break
            }
          }
        } catch { continue }
      }
    }
  }
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
  console.error("[arcana-resolve] provider=", p, "modelId=", modelId, "proxyURL=", proxyURL, "profile.baseURL=", profile.baseURL)
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
  const baseURL = proxyURL ?? profile.baseURL ?? `https://api.${config.provider}.com/v1`
  if (baseURL.includes("${CLOUDFLARE_ACCOUNT_ID}")) {
    throw new Error(
      `Provider "${config.provider}" URL still has \${CLOUDFLARE_ACCOUNT_ID}. ` +
        `Set CLOUDFLARE_ACCOUNT_ID, or switch to arcana-proxy (proxy_key / ARCANA_PROXY_KEY).`,
    )
  }
  const compat = createOpenAICompatible({
    apiKey: key,
    baseURL,
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

  private shellCommandFromTool(toolName: string, input: Record<string, unknown>): string | undefined {
    if (toolName !== "shell" && !toolName.includes("bash")) return undefined
    const command = input.command ?? input.cmd
    return typeof command === "string" && command.trim() ? command : undefined
  }

  private async runProofShellGate(toolName: string, input: Record<string, unknown>): Promise<string | undefined> {
    const command = this.shellCommandFromTool(toolName, input)
    if (!command || !this.config.proofGate) return undefined
    const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd()
    const decision = await this.config.proofGate.gateShellCommand(command, {
      cwd,
      approved: this.config.godlike === true,
      sandboxEnabled: Boolean(this.sandbox),
      userSovereignty: { requireApprovalForWrites: true, requireApprovalForNetwork: true },
    })
    if (!decision.blocked) return undefined
    return [
      `Blocked by RunProof policy gate: ${command}`,
      `Risk: ${decision.risk}`,
      ...decision.reasons.map((reason) => `- ${reason}`),
    ].join("\n")
  }

  private filePathFromMutationTool(toolName: string, input: Record<string, unknown>): string | undefined {
    if (toolName !== "write" && toolName !== "edit" && toolName !== "apply_patch") return undefined
    const path = input.path ?? input.filePath ?? input.filepath ?? input.file
    return typeof path === "string" && path.trim() ? path : undefined
  }

  private async runProofFileGate(toolName: string, input: Record<string, unknown>): Promise<string | undefined> {
    const path = this.filePathFromMutationTool(toolName, input)
    if (!path || !this.config.proofGate) return undefined
    const decision = await this.config.proofGate.gateFileMutation(path, {
      operation: toolName,
      approved: this.config.godlike === true,
      sandboxEnabled: Boolean(this.sandbox),
      userSovereignty: { requireApprovalForWrites: true, requireApprovalForNetwork: true },
    })
    if (!decision.blocked) return undefined
    return [
      `Blocked by RunProof file policy gate: ${path}`,
      `Risk: ${decision.risk}`,
      ...decision.reasons.map((reason) => `- ${reason}`),
    ].join("\n")
  }

  /**
   * Sole tool execution path for top-level and nested (batch) calls.
   *
   * Order (must stay stable — see docs/adr/0002-tool-batch-scheduler.md):
   *   safeMode → allowlist → registry → sandbox → rate limit → proof gates →
   *   dangerous-cmd → result cache → (batch special) or execute+timeout →
   *   proof record → redact → injection scan → audit → tool history
   *
   * Corruption guards:
   * - Cache only read-only tools; store post-redact output only.
   * - Rate limit counted once per call (not again for nested batch parent).
   * - Batch never re-enters batch (allowlist + capability deny).
   */
  private async executeAuthorizedTool(
    toolName: string,
    input: Record<string, unknown>,
    options: {
      resultCache?: Map<string, { result: string; ts: number }>
      /** When true, skip rate-limit soft warning collection (hard limit still applies). */
      nested?: boolean
    } = {},
  ): Promise<{ result: string; softWarning?: string }> {
    const WRITE_TOOLS = new Set([
      "write",
      "edit",
      "apply_patch",
      "delete",
      "rename",
      "env_write",
      "env_install",
      "env_clean",
      "skill_create",
    ])
    // Only idempotent reads — never cache write/shell/batch results.
    const CACHEABLE = new Set(["web_search", "web_fetch", "memory_search", "skill_list"])

    if (this.config.safeMode && WRITE_TOOLS.has(toolName)) {
      return {
        result: `[SAFE MODE] Tool "${toolName}" is disabled in safe mode. Use --safe=false to enable write tools.`,
      }
    }

    // Goal awareness: Tier B mutation gate + freeze after complete.
    try {
      const { checkGoalToolGate } = await import("@arcana/core/session/goal")
      const sessionKey =
        this.sessionId
        || (typeof process.env.ARCANA_SESSION_ID === "string" ? process.env.ARCANA_SESSION_ID : "")
        || `cli-${process.cwd().replace(/[^a-zA-Z0-9]+/g, "_").slice(-48)}`
      const gate = checkGoalToolGate({
        sessionID: sessionKey,
        agentName: "build",
        toolName,
      })
      if (!gate.allow) {
        return { result: `[GOAL] ${gate.message}` }
      }
    } catch {
      /* goal module unavailable */
    }

    const allowedTools = this.config.allowedTools ?? process.env.ARCANA_ALLOWED_TOOLS
    if (allowedTools && !this.config.godlike) {
      const allowed = new Set(allowedTools.split(","))
      if (!allowed.has("*") && !allowed.has(toolName)) {
        return {
          result: `[LICENSE] Tool "${toolName}" is not available on your plan. Upgrade at https://arcana.otnelhq.com`,
        }
      }
    }

    // Nested batch: outer tool is "batch"; sub-tools must never be "batch" again.
    if (options.nested && toolName === "batch") {
      return { result: `Batch sub-tool "batch" denied: nested batch is not allowed` }
    }

    const entry = this.tools.get(toolName)
    if (!entry && toolName !== "batch") return { result: `Unknown tool: ${toolName}` }

    if (this.sandbox) {
      const path = input.path ?? input.filePath ?? input.filepath ?? input.file ?? input.filename
      if (
        path &&
        (toolName === "write" ||
          toolName === "edit" ||
          toolName === "read" ||
          toolName === "apply_patch" ||
          toolName === "env_write")
      ) {
        // env_write only accepts basenames under ~/.arcana/sandbox — still run
        // path check when a sandbox profile is active so absolute escapes die here too.
        const blocked = checkSandboxPath(this.sandbox, String(path), toolName)
        if (blocked) return { result: blocked }
      }
      const url = input.url as string | undefined
      if (url && (toolName === "web_fetch" || toolName === "web_search")) {
        const blocked = checkSandboxNetwork(this.sandbox, url)
        if (blocked) return { result: blocked }
      }
    }

    let softWarning: string | undefined
    if (!this.config.godlike) {
      try {
        const warn = this.limiter.check(toolName)
        if (warn) softWarning = warn
      } catch (error) {
        return { result: error instanceof Error ? error.message : String(error) }
      }
    }

    const policyBlocked = await this.runProofShellGate(toolName, input)
    if (policyBlocked) {
      auditLog({
        tool: toolName,
        args: input,
        result: policyBlocked,
        session: this.sessionId ?? undefined,
        ts: new Date().toISOString(),
      })
      return { result: policyBlocked, softWarning }
    }

    const filePolicyBlocked = await this.runProofFileGate(toolName, input)
    if (filePolicyBlocked) {
      auditLog({
        tool: toolName,
        args: input,
        result: filePolicyBlocked,
        session: this.sessionId ?? undefined,
        ts: new Date().toISOString(),
      })
      return { result: filePolicyBlocked, softWarning }
    }

    if (!this.config.godlike && (toolName === "shell" || toolName.includes("bash"))) {
      const cmd = String(input.command ?? input.cmd ?? "")
      const blocked = checkDangerousCommand(cmd)
      if (blocked) {
        auditLog({
          tool: toolName,
          args: input,
          result: blocked,
          session: this.sessionId ?? undefined,
          ts: new Date().toISOString(),
        })
        return { result: blocked, softWarning }
      }
    }

    // Segmented batch (parent call only — never nested). Phase 3: budgets, cancel, synthesis.
    if (toolName === "batch" && !options.nested) {
      const batchCalls = (input as { calls?: Array<{ tool: string; args?: Record<string, unknown> }> }).calls
      if (!batchCalls?.length) return { result: "No calls provided", softWarning }
      try {
        const planned = validateAndPlanBatch(batchCalls, {
          defaultTimeoutMs: this.config.toolTimeout ?? DEFAULT_BATCH_CONFIG.defaultTimeoutMs,
        })
        const report = await runBatchWaves({
          waves: planned.waves,
          config: planned.config,
          timeoutMs: planned.config.defaultTimeoutMs,
          parentId: toolName,
          onEvent: (event) => {
            if (event.type === "run.start") {
              publishBatchActivity(event.planSummary)
            } else if (event.type === "wave.start") {
              publishBatchActivity(
                `wave ${event.waveIndex + 1}${event.capability ? ` · ${event.size} ${event.capability}` : ""}`,
              )
            } else if (event.type === "run.end") {
              publishBatchActivity(undefined)
            }
          },
          execute: async (call) => {
            const nested = await this.executeAuthorizedTool(call.name, call.input, {
              resultCache: options.resultCache,
              nested: true,
            })
            return nested.result
          },
        })
        await this.config.proofGate?.recordToolBatch?.({
          run_id: report.runId,
          plan_summary: report.planSummary,
          waves: report.waves,
          calls: report.calls,
          ok: report.ok,
          failed: report.failed,
          cancelled: report.cancelled,
          max_active: report.maxActive,
          duration_ms: report.durationMs,
          summary: report.synthesis.slice(0, 500),
        })
        publishBatchActivity(undefined)
        // Parent model sees focused synthesis, not raw worker dumps.
        return { result: report.synthesis, softWarning }
      } catch (error) {
        if (error instanceof BatchSizeError || error instanceof BatchToolDeniedError) {
          auditLog({
            tool: "batch",
            args: input,
            result: error.message,
            session: this.sessionId ?? undefined,
            ts: new Date().toISOString(),
          })
          return { result: error.message, softWarning }
        }
        return {
          result: `Batch error: ${error instanceof Error ? error.message : String(error)}`,
          softWarning,
        }
      }
    }

    if (!entry) return { result: `Unknown tool: ${toolName}`, softWarning }

    const cacheKey = `${toolName}:${JSON.stringify(input)}`
    const cacheable = CACHEABLE.has(toolName) && options.resultCache
    const cached = cacheable ? options.resultCache!.get(cacheKey) : undefined
    if (cached && Date.now() - cached.ts < 5000) {
      // LRU touch
      options.resultCache!.delete(cacheKey)
      options.resultCache!.set(cacheKey, cached)
      await this.recordRunProofContextAccess(toolName, input, cached.result)
      return { result: cached.result, softWarning }
    }

    const timeout = this.config.toolTimeout ?? 30_000
    try {
      const resultPromise = entry.handler(input)
      let resultStr = await Promise.race([
        resultPromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool timed out after ${timeout}ms`)), timeout),
        ),
      ])
      await this.recordRunProofContextAccess(toolName, input, resultStr)
      await this.recordRunProofFileWrite(toolName, input, resultStr)
      resultStr = this.config.godlike ? resultStr : redactSecrets(resultStr)
      resultStr = this.config.godlike ? resultStr : redactGitEmails(resultStr)
      resultStr = this.config.godlike ? resultStr : redactPII(resultStr)
      resultStr = this.config.godlike ? resultStr : redactGitAuthorNames(resultStr)
      const injection = this.config.godlike ? null : detectInjection(resultStr)
      if (injection) resultStr = `[INJECTION WARN] ${injection}\n\n${resultStr}`
      await this.recordRunProofShellCommand(toolName, input, resultStr)
      if (cacheable && options.resultCache) {
        options.resultCache.set(cacheKey, { result: resultStr, ts: Date.now() })
        if (options.resultCache.size > 50) {
          const oldest = options.resultCache.keys().next().value
          if (oldest) options.resultCache.delete(oldest)
        }
      }
      if (!this.config.godlike) {
        auditLog({
          tool: toolName,
          args: input,
          result: resultStr.slice(0, 200),
          session: this.sessionId ?? undefined,
          ts: new Date().toISOString(),
        })
      }
      toolHistory.push({ name: toolName, ts: Date.now() })
      return { result: resultStr, softWarning }
    } catch (error) {
      const resultStr = `Tool error: ${String(error)}`
      await this.recordRunProofShellCommand(toolName, input, resultStr)
      auditLog({
        tool: toolName,
        args: input,
        result: `ERROR: ${error}`,
        session: this.sessionId ?? undefined,
        ts: new Date().toISOString(),
      })
      return { result: resultStr, softWarning }
    }
  }

  private async recordRunProofContextAccess(
    toolName: string,
    input: Record<string, unknown>,
    result: string,
  ): Promise<void> {
    if (!this.config.proofGate) return

    if (toolName === "read") {
      const path = input.filePath
      if (typeof path !== "string" || !path.trim()) return
      const exists = !result.startsWith("File not found:")
      await this.config.proofGate.recordContextAccess({
        tool: "read",
        path,
        summary: exists ? `Read file context: ${path}` : `Attempted to read missing file: ${path}`,
        exists,
        bytes_read: exists ? result.length : undefined,
      })
      return
    }

    if (toolName === "grep") {
      const pattern = typeof input.pattern === "string" ? input.pattern : undefined
      const path = typeof input.path === "string" ? input.path : process.cwd()
      const noMatches = result.startsWith("No matches for")
      await this.config.proofGate.recordContextAccess({
        tool: "grep",
        path,
        pattern,
        summary: noMatches ? `Searched context with no matches: ${pattern ?? ""}` : `Searched context: ${pattern ?? ""}`,
        exists: true,
        result_count: noMatches ? 0 : result.split("\n").filter((line) => line && !line.startsWith("...")).length,
      })
      return
    }

    if (toolName === "glob") {
      const pattern = typeof input.pattern === "string" ? input.pattern : undefined
      const path = typeof input.path === "string" ? input.path : process.cwd()
      const noMatches = result.startsWith("No files matching")
      await this.config.proofGate.recordContextAccess({
        tool: "glob",
        path,
        pattern,
        summary: noMatches ? `Scanned context with no file matches: ${pattern ?? ""}` : `Scanned context files: ${pattern ?? ""}`,
        exists: true,
        result_count: noMatches ? 0 : result.split("\n").filter((line) => line.trim()).length,
      })
    }
  }

  private async recordRunProofFileWrite(
    toolName: string,
    input: Record<string, unknown>,
    result: string,
  ): Promise<void> {
    if (!this.config.proofGate) return
    if (toolName !== "write" && toolName !== "edit") return

    const path = input.filePath
    if (typeof path !== "string" || !path.trim()) return
    if (result.startsWith("Write error:") || result.startsWith("Edit error:") || result.startsWith("Error:")) return
    if (!result.startsWith("Written ") && !result.startsWith("Edited ")) return

    const bytesWritten =
      toolName === "write" && typeof input.content === "string"
        ? input.content.length
        : toolName === "edit" && typeof input.newString === "string"
          ? input.newString.length
          : undefined

    await this.config.proofGate.recordFileWrite({
      path,
      mode: "proposed",
      reason: toolName === "write" ? `write tool created or overwrote ${path}` : `edit tool modified ${path}`,
      bytes_written: bytesWritten,
    })
  }

  private async recordRunProofShellCommand(
    toolName: string,
    input: Record<string, unknown>,
    result: string,
  ): Promise<void> {
    if (!this.config.proofGate) return
    const command = this.shellCommandFromTool(toolName, input)
    if (!command) return

    const cwd = typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : process.cwd()
    const failed =
      result.startsWith("Tool error:") ||
      result.startsWith("Shell error:") ||
      result.startsWith("Bash error:") ||
      result.startsWith("Error:") ||
      result.startsWith("error -")
    const status: RunProofVerificationStatus = failed ? "failed" : "passed"

    if (this.config.proofGate.recordShellCommand) {
      await this.config.proofGate.recordShellCommand({
        command,
        cwd,
        status,
        risk: "unknown",
        exit_code: failed ? 1 : undefined,
        stdout_summary: failed ? undefined : result.slice(0, 500),
        stderr_summary: failed ? result.slice(0, 500) : undefined,
      })
    }

    const verificationKind = runProofVerificationKindFromShellCommand(command)
    if (!verificationKind) return

    const summary = runProofVerificationSummary(verificationKind, command, status)
    if (verificationKind === "test") {
      await this.config.proofGate.recordTestResult?.({ command, status, summary })
      return
    }

    await this.config.proofGate.recordCheck?.({ kind: verificationKind, command, status, summary })
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
        const compacted = await generateText({
          model,
          messages: toCoreMessages(summaryMsgs),
          maxOutputTokens: 200,
          temperature: 0.3,
          abortSignal: AbortSignal.timeout(LLM_COMPACTION_TIMEOUT_MS),
        })
        compactionNote = compacted.text
      } catch (e) {
        console.debug("[arcana] Compaction LLM call failed:", e instanceof Error ? e.message : String(e))
      }
      history = systemMsg
        ? [systemMsg, { role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
        : [{ role: "system", content: `[Earlier context: ${compactionNote || "prior conversation omitted"}]` }, ...kept]
    } else {
      history = systemMsg ? [systemMsg, ...rest] : rest
    }

    const availableTools = this.getToolDefs().map((tool) => tool.function.name)
    const mlRuntime = prepareMlRuntime(history, this.config, Boolean(this.sandbox), availableTools)
    history = applyMlPreflight(history, mlRuntime)
    const mlOverrides = getMlRuntimeModelOverrides(mlRuntime)

    if (this.config.proofGate?.recordMlSignal && mlRuntime.turnSignal) {
      try {
        await this.config.proofGate.recordMlSignal({
          kind: "turn",
          signal: mlRuntime.turnSignal,
          summary: `ML turn signal: ${mlRuntime.turnSignal.intent} | risk=${mlRuntime.turnSignal.risk} | posture=${mlRuntime.turnSignal.executionPosture} | route=${mlRuntime.turnSignal.modelRoute.profile}`,
          refs: {
            intent: mlRuntime.turnSignal.intent,
            risk: mlRuntime.turnSignal.risk,
            posture: mlRuntime.turnSignal.executionPosture,
            model_route: mlRuntime.turnSignal.modelRoute.profile,
          },
        })
      } catch {
        // Non-blocking: ML signal recording failures should not break the run.
      }
    }

    let totalInput = 0
    let totalOutput = 0
    let toolCalls = 0
    let finalContent = ""

    // Shared across the turn so read-only tools can reuse results (post-redact only).
    const toolResultCache = new Map<string, { result: string; ts: number }>()
    const maxToolRounds = mlOverrides.maxToolRounds ?? this.config.maxToolRounds ?? 10
    let contextBudgetRecorded = false
    for (let round = 0; round < maxToolRounds; round++) {
      const { model, tools } = await resolveModel(this.config, this.getToolDefs())
      const coreMessages = toCoreMessages(history)
      const hasTools = Object.keys(tools).length > 0
      const mlMaxTokens = mlOverrides.maxTokens
      const mlTemperature = mlOverrides.temperature

      // Context pack shadow: measure what the context pack WOULD trim
      // without enforcing budgets yet. This is observational — it feeds
      // the cockpit token-console and performance meters.
      if (history.length > 5) {
        const estimatedTotal = history.reduce(
          (sum, m) => sum + Math.ceil((m.content ?? "").length / 4),
          0,
        )
        const systemTokens = history
          .filter((m) => m.role === "system")
          .reduce((sum, m) => sum + Math.ceil((m.content ?? "").length / 4), 0)
        const toolTokens = history
          .filter((m) => m.role === "tool")
          .reduce((sum, m) => sum + Math.ceil((m.content ?? "").length / 4), 0)
        // Non-blocking: just log the pack metrics for cockpit to observe
        if (estimatedTotal > 8000) {
          console.error(
            `[arcana] context-pack shadow: ${estimatedTotal} est tokens, ${systemTokens} system, ${toolTokens} tool, ${history.length} messages`,
          )
          if (!contextBudgetRecorded) {
            contextBudgetRecorded = true
            await this.config.proofGate?.recordContextBudget?.({
              estimated_tokens: estimatedTotal,
              system_tokens: systemTokens,
              tool_tokens: toolTokens,
              message_count: history.length,
              threshold: 8000,
              action: "observe",
            })
          }
        }
      }

      if (onChunk && !hasTools) {
        // Streaming path: no tools → stream tokens directly. ML preflight still
        // applies, but postflight cannot silently revise already-emitted tokens.
        const streamController = new AbortController()
        const result = await streamText({
          model,
          messages: coreMessages,
          maxOutputTokens: mlMaxTokens ?? this.config.maxTokens ?? 4096,
          temperature: mlTemperature ?? this.config.temperature ?? 0.7,
          tools: hasTools ? tools : undefined,
          abortSignal: streamController.signal,
        })
        let content = ""
        try {
          const iterator = result.textStream[Symbol.asyncIterator]()
          while (true) {
            const chunkResult = await Promise.race([
              iterator.next(),
              new Promise<{ done: true; value: undefined }>((_, reject) =>
                setTimeout(() => reject(new DOMException("", "AbortError")), LLM_CHUNK_TIMEOUT_MS)
              ),
            ])
            if (chunkResult.done) break
            content += chunkResult.value
            onChunk(chunkResult.value)
          }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") {
            content += "\n[stream timed out]"
          } else {
            throw e
          }
        }
        // Overall stream timeout via race
        const streamTimeout = setTimeout(() => streamController.abort(), LLM_STREAM_TIMEOUT_MS)
        try {
          await result.finishReason // consume stream
          const usage = await result.usage
          totalInput += usage?.inputTokens ?? 0
          totalOutput += usage?.outputTokens ?? 0
        } finally {
          clearTimeout(streamTimeout)
        }
        finalContent = content
        history.push({ role: "assistant", content })
        break
      }

      // Buffered path (tools possible)
      const result = await generateText({
        model,
        messages: coreMessages,
        maxOutputTokens: mlMaxTokens ?? this.config.maxTokens ?? 4096,
        temperature: mlTemperature ?? this.config.temperature ?? 0.7,
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
              maxOutputTokens: mlMaxTokens ?? this.config.maxTokens ?? 4096,
              temperature: Math.min(mlTemperature ?? this.config.temperature ?? 0.7, 0.4),
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

      // Single authorized path for every top-level tool (and nested batch sub-calls).
      for (const tc of toolRequests) {
        const { result, softWarning } = await this.executeAuthorizedTool(
          tc.toolName,
          tc.input as Record<string, unknown>,
          { resultCache: toolResultCache },
        )
        const warningPrefix = softWarning ? `${softWarning}\n` : ""
        const combined = warningPrefix + result
        const truncated =
          combined.length > TOOL_RESULT_MAX
            ? combined.slice(0, TOOL_RESULT_MAX) + `\n...(truncated ${combined.length - TOOL_RESULT_MAX} chars)`
            : combined
        history.push({
          role: "tool",
          tool_call_id: tc.toolCallId,
          content: truncated,
          toolName: tc.toolName,
        } as any)
      }
    }

    if (this.config.maxTokensPerSession && totalInput > this.config.maxTokensPerSession * 0.8) {
    }

    return { content: finalContent, toolCalls, inputTokens: totalInput, outputTokens: totalOutput }
  }
}
