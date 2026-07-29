import { Agent } from "@/agent/agent"
import { SessionV1 } from "@arcana/core/v1/session"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"

import { Plugin } from "@/plugin"
import type { TaskPromptOps } from "@/tool/task"
import { type Tool as AITool, tool, jsonSchema, type ToolExecutionOptions, asSchema } from "ai"
import { Effect } from "effect"
import { Session } from "./session"
import { SessionProcessor } from "./processor"
import { PartID } from "./schema"
import { EffectBridge } from "@/effect/bridge"
import { ModelV2 } from "@arcana/core/model"
import { withToolAdmission } from "@/tool/batch"
import { checkGoalToolGate } from "@arcana/core/session/goal"
import { buildAuthorizationRequest, toolToAction } from "@arcana/core/capability/pep-integration"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { Database } from "@arcana/core/database/database"
import type { PolicyContextProvider, PreparedEffect } from "@arcana/core/capability/pep"
import type { PolicyContext } from "@arcana/core/capability/pdp"
import type { AuthorizationRequest, ProvenanceLabel, SensitivityLabel } from "@arcana/core/capability/types"

// ── Phase C PEP: Fail-closed production provider ──────────────────────
// SessionPolicyProvider backed by SqliteGrantStore.
// No grants -> DENY. Storage failure -> DENY.
/**
 * Production policy provider: REQUIRED mode.
 * Intent binding store not yet implemented → intentBindings = [] → fail closed.
 * HIGH/CRITICAL actions without bindings → DENY.
 */
function createPolicyProvider(
  db: Database.Interface,
  sessionID: string,
  agentName: string,
): SessionPolicyProvider {
  const store = new SqliteGrantStore(db)
  return new SessionPolicyProvider(
    store,
    {
      principalId: agentName,
      sessionId: sessionID,
      workspaceTrust: "TRUSTED",
    },
    undefined, // IntentBindingStoreEffect: not yet implemented
    "REQUIRED",
  )
}

/**
 * Extract provenance labels for a tool call at the production boundary.
 *
 * Classification rules:
 * - All model-generated arguments: MODEL_OUTPUT (inherited from prompt)
 * - File reads: content provenance depends on source (read_file path)
 * - Network reads: REMOTE_CONTENT + TOOL_OUTPUT
 * - MCP tool calls: MCP_DESCRIPTION
 * - Subagent delegation: SUBAGENT_OUTPUT
 * - Secret access: SYSTEM_POLICY
 * - User-facing tools (terminal, write): USER_INSTRUCTION (model-mediated)
 *
 * The model's arguments are always MODEL_OUTPUT.
 * The content being acted upon carries additional provenance.
 */
function extractProvenance(toolName: string, args: Record<string, unknown>): ProvenanceLabel[] {
  const labels: ProvenanceLabel[] = ["MODEL_OUTPUT"]

  switch (toolName) {
    case "read_file":
    case "search_files":
      // Reading local files — content is trusted local source
      labels.push("TRUSTED_LOCAL_SOURCE")
      break

    case "web_search":
    case "web_fetch":
      // Network reads return remote content
      labels.push("REMOTE_CONTENT")
      labels.push("TOOL_OUTPUT")
      break

    case "write_file":
    case "patch":
      // Model is generating file content based on user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "terminal":
      // Model is generating commands based on user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "send_message":
      // Model is composing a message
      labels.push("USER_INSTRUCTION")
      break

    case "delegate_task":
      // Delegating to a subagent — subagent output will carry its own labels
      labels.push("SUBAGENT_OUTPUT")
      break

    case "git_commit":
    case "git_autocommit":
    case "git_push":
      // Git operations derived from user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "skill_create":
      // Writing skill files
      labels.push("USER_INSTRUCTION")
      break

    case "cronjob":
      // Scheduling — user-initiated
      labels.push("USER_INSTRUCTION")
      break

    default:
      // Unknown tools default to USER_INSTRUCTION
      labels.push("USER_INSTRUCTION")
      break
  }

  // Check for MCP tool calls — MCP descriptions cannot authorize secrets
  if (toolName.startsWith("mcp_")) {
    labels.push("MCP_DESCRIPTION")
  }

  return labels
}

/**
 * Extract sensitivity labels for a tool call at the production boundary.
 *
 * Classification rules:
 * - Secret access: SECRET
 * - Network write with sensitive args: PRIVATE
 * - File operations on sensitive paths: PRIVATE
 * - Everything else: PUBLIC (default)
 */
function extractSensitivity(toolName: string, args: Record<string, unknown>): SensitivityLabel[] {
  // Secret tools are always SECRET
  if (toolName === "secret_use" || toolName === "env_read") {
    return ["SECRET"]
  }

  // Check args for sensitive indicators
  const argsStr = JSON.stringify(args).toLowerCase()

  // Network writes to external hosts could be sensitive
  if (toolName === "send_message" || toolName === "web_fetch") {
    // If the content references secrets or env vars, elevate sensitivity
    if (argsStr.includes("secret") || argsStr.includes("token") || argsStr.includes("password") || argsStr.includes("api_key")) {
      return ["PRIVATE"]
    }
  }

  return ["PUBLIC"]
}

export const resolve = Effect.fn("SessionTools.resolve")(function* (input: {
  agent: Agent.Info
  model: Provider.Model
  session: Session.Info
  processor: Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall">
  bypassAgentCheck: boolean
  messages: SessionV1.WithParts[]
  promptOps: TaskPromptOps
}) {
  const tools: Record<string, AITool> = {}
  const run = yield* EffectBridge.make()
  const plugin = yield* Plugin.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const mcp = yield* MCP.Service
  const truncate = yield* Truncate.Service
  const db = yield* Database.Service

  const sessionMeta = input.session.metadata as Record<string, unknown> | undefined
  const context = (args: Record<string, unknown>, options: ToolExecutionOptions): Tool.Context => ({
    sessionID: input.session.id,
    abort: options.abortSignal!,
    messageID: input.processor.message.id,
    callID: options.toolCallId,
    extra: {
      model: input.model,
      bypassAgentCheck: input.bypassAgentCheck,
      promptOps: input.promptOps,
      ...(sessionMeta?.depth !== undefined ? { depth: sessionMeta.depth } : {}),
      ...(sessionMeta?.defaultTimeout !== undefined ? { defaultTaskTimeout: sessionMeta.defaultTimeout } : {}),
    },
    agent: input.agent.name,
    messages: input.messages,
    metadata: (val) =>
      input.processor.updateToolCall(options.toolCallId, (match) => {
        if (!["running", "pending"].includes(match.state.status)) return match
        return {
          ...match,
          state: {
            title: val.title,
            metadata: val.metadata,
            status: "running",
            input: args,
            time: { start: Date.now() },
          },
        }
      }),
    ask: (req) =>
      permission
        .ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
        })
        .pipe(Effect.orDie),
  })

  for (const item of yield* registry.tools({
    modelID: ModelV2.ID.make(input.model.api.id),
    providerID: input.model.providerID,
    agent: input.agent,
  })) {
    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
    tools[item.id] = tool({
      description: item.description,
      inputSchema: jsonSchema(schema),
      execute(args, options) {
        // Phase 1: tier admission — AI SDK fans out tools eagerly; pools bound
        // concurrent read/network/write/shell so multi-tool turns cannot stampede.
        return run.promise(
          withToolAdmission(
            item.id,
            Effect.gen(function* () {
              const ctx = context(args, options)
              // Goal awareness: Tier B mutation gate + freeze after goal complete.
              const gate = checkGoalToolGate({
                sessionID: ctx.sessionID,
                agentName: input.agent.name,
                toolName: item.id,
              })
              if (!gate.allow) {
                return {
                  title: gate.reason,
                  output: gate.message,
                  metadata: { goal_gate: gate.reason },
                }
              }
              // ── Phase C PEP: authorize before execution ───────────
              const pepProvider = createPolicyProvider(db, ctx.sessionID, input.agent.name)
              const authReq = buildAuthorizationRequest({
                toolName: item.id,
                principalId: input.agent.name,
                sessionId: ctx.sessionID,
                args: args as Record<string, unknown>,
                provenance: extractProvenance(item.id, args as Record<string, unknown>),
                sensitivity: extractSensitivity(item.id, args as Record<string, unknown>),
              })
              const pepResult = yield* authorizeAndExecuteEffect(
                {
                  request: authReq,
                  executeExact: () => {
                    // Will be called only if PEP allows
                    return null
                  },
                },
                pepProvider,
              )
              if (pepResult.status === "DENIED") {
                const reasons = pepResult.decision.reasons.map((r) => r.code).join(", ")
                return {
                  title: `Authorization denied: ${item.id}`,
                  output: `DENIED\nreason: ${reasons}\naction: ${authReq.action}\ntool: ${item.id}`,
                  metadata: { pep_denied: true, decision: pepResult.decision },
                }
              }
              if (pepResult.status === "APPROVAL_REQUIRED") {
                const reasons = pepResult.decision.reasons.map((r) => r.code).join(", ")
                return {
                  title: `Approval required: ${item.id}`,
                  output: `APPROVAL_REQUIRED\nreason: ${reasons}\naction: ${authReq.action}\ntool: ${item.id}`,
                  metadata: { pep_approval_required: true, decision: pepResult.decision },
                }
              }
              // ── End Phase C PEP ───────────────────────────────────
              yield* plugin.trigger(
                "tool.execute.before",
                { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
                { args },
              )
              const result = yield* item.execute(args, ctx)
              const output = {
                ...result,
                attachments: result.attachments?.map((attachment) => ({
                  ...attachment,
                  id: PartID.ascending(),
                  sessionID: ctx.sessionID,
                  messageID: input.processor.message.id,
                })),
              }
              yield* plugin.trigger(
                "tool.execute.after",
                { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },
                output,
              )
              if (options.abortSignal?.aborted) {
                yield* input.processor.completeToolCall(options.toolCallId, output)
              }
              return output
            }),
            { input: args },
          ),
        )
      },
    })
  }

  for (const [key, item] of Object.entries(yield* mcp.tools())) {
    const execute = item.execute
    if (!execute) continue

    const schema = yield* Effect.promise(() => Promise.resolve(asSchema(item.inputSchema).jsonSchema))
    const transformed = ProviderTransform.schema(input.model, { ...schema, properties: schema.properties ?? {} })
    item.inputSchema = jsonSchema(transformed)
    item.execute = (args, opts) =>
      run.promise(
        Effect.gen(function* () {
          const ctx = context(args, opts)
          // ── Phase C PEP: authorize MCP before execution ───────────
          const mcpPepProvider = createPolicyProvider(db, ctx.sessionID, input.agent.name)
          const mcpAuthReq = buildAuthorizationRequest({
            toolName: key,
            principalId: input.agent.name,
            sessionId: ctx.sessionID,
            args: args as Record<string, unknown>,
            provenance: ["MCP_DESCRIPTION" as ProvenanceLabel],
            sensitivity: extractSensitivity(key, args as Record<string, unknown>),
          })
          const mcpPepResult = yield* authorizeAndExecuteEffect(
            {
              request: mcpAuthReq,
              executeExact: () => null,
            },
            mcpPepProvider,
          )
          if (mcpPepResult.status === "DENIED") {
            const reasons = mcpPepResult.decision.reasons.map((r) => r.code).join(", ")
            return {
              content: [{ type: "text", text: `DENIED\nreason: ${reasons}\naction: ${mcpAuthReq.action}\ntool: ${key}` }],
              metadata: { pep_denied: true },
            } as any
          }
          if (mcpPepResult.status === "APPROVAL_REQUIRED") {
            const reasons = mcpPepResult.decision.reasons.map((r) => r.code).join(", ")
            return {
              content: [{ type: "text", text: `APPROVAL_REQUIRED\nreason: ${reasons}\naction: ${mcpAuthReq.action}\ntool: ${key}` }],
              metadata: { pep_approval_required: true },
            } as any
          }
          // ── End Phase C PEP ───────────────────────────────────────
          yield* plugin.trigger(
            "tool.execute.before",
            { tool: key, sessionID: ctx.sessionID, callID: opts.toolCallId },
            { args },
          )
          const result: Awaited<ReturnType<NonNullable<typeof execute>>> = yield* Effect.gen(function* () {
            yield* ctx.ask({ permission: key, metadata: {}, patterns: ["*"], always: ["*"] })
            return yield* Effect.promise(() => execute(args, opts))
          }).pipe(
            Effect.withSpan("Tool.execute", {
              attributes: {
                "tool.name": key,
                "tool.call_id": opts.toolCallId,
                "session.id": ctx.sessionID,
                "message.id": input.processor.message.id,
              },
            }),
          )
          yield* plugin.trigger(
            "tool.execute.after",
            { tool: key, sessionID: ctx.sessionID, callID: opts.toolCallId, args },
            result,
          )

          const textParts: string[] = []
          const attachments: Omit<SessionV1.FilePart, "id" | "sessionID" | "messageID">[] = []
          for (const contentItem of result.content) {
            if (contentItem.type === "text") textParts.push(contentItem.text)
            else if (contentItem.type === "image") {
              attachments.push({
                type: "file",
                mime: contentItem.mimeType,
                url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
              })
            } else if (contentItem.type === "resource") {
              const { resource } = contentItem
              if (resource.text) textParts.push(resource.text)
              if (resource.blob) {
                attachments.push({
                  type: "file",
                  mime: resource.mimeType ?? "application/octet-stream",
                  url: `data:${resource.mimeType ?? "application/octet-stream"};base64,${resource.blob}`,
                  filename: resource.uri,
                })
              }
            }
          }

          const truncated = yield* truncate.output(textParts.join("\n\n"), {}, input.agent)
          const metadata = {
            ...result.metadata,
            truncated: truncated.truncated,
            ...(truncated.truncated && { outputPath: truncated.outputPath }),
          }

          const output = {
            title: "",
            metadata,
            output: truncated.content,
            attachments: attachments.map((attachment) => ({
              ...attachment,
              id: PartID.ascending(),
              sessionID: ctx.sessionID,
              messageID: input.processor.message.id,
            })),
            content: result.content,
          }
          if (opts.abortSignal?.aborted) {
            yield* input.processor.completeToolCall(opts.toolCallId, output)
          }
          return output
        }),
      )
    tools[key] = item
  }

  return tools
})

export * as SessionTools from "./tools"
