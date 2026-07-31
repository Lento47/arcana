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
import { SessionBudget, toolBudgetCost } from "./budget"
import { EffectBridge } from "@/effect/bridge"
import { ModelV2 } from "@arcana/core/model"
import { withToolAdmission } from "@/tool/batch"
import { checkGoalToolGate } from "@arcana/core/session/goal"
import { buildAuthorizationRequest, toolToAction } from "@arcana/core/capability/pep-integration"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { ensureSessionAgentGrants, shortPrincipal } from "@arcana/core/capability/session-grants"
import { Database } from "@arcana/core/database/database"
import type { PolicyContextProvider, PreparedEffect } from "@arcana/core/capability/pep"
import type { PolicyContext } from "@arcana/core/capability/pdp"
import type { AuthorizationRequest, CanonicalResource, ProvenanceLabel, SensitivityLabel } from "@arcana/core/capability/types"
import type { ScopedApproval } from "@arcana/core/capability/scoped-approval"
import { SqliteScopedApprovalStore } from "@arcana/core/crypto/scoped-approval-adapter"

// ── Durable approval pipeline (RB-01) ─────────────────────────────────
// One sqlite-backed ScopedApprovalStore per workspace (lazily opened).
// The PEP (approval-backed ALLOW) and the operator service share it.
const scopedApprovalStores = new Map<string, SqliteScopedApprovalStore>()

function getScopedApprovalStore(cwd: string | undefined): SqliteScopedApprovalStore {
  const base = cwd ?? process.cwd()
  const path = `${base}/.arcana/approvals.db`
  let store = scopedApprovalStores.get(path)
  if (!store) {
    store = new SqliteScopedApprovalStore(path)
    scopedApprovalStores.set(path, store)
  }
  return store
}

/** Default approval TTL (ms) — 5 minutes, matching the TUI-2 expiry contract. */
const APPROVAL_TTL_MS = 5 * 60 * 1000

type ApprovalGate = {
  decision: Promise<"approved" | "denied">
  approve: () => void
  deny: () => void
}

function createApprovalGate(): ApprovalGate {
  let resolveGate!: (d: "approved" | "denied") => void
  const decision = new Promise<"approved" | "denied">((resolve) => {
    resolveGate = resolve
  })
  return {
    decision,
    approve: () => resolveGate("approved"),
    deny: () => resolveGate("denied"),
  }
}

/** Parked tool calls awaiting an operator decision, keyed by approval ID. */
const parkedApprovals = new Map<string, ApprovalGate>()

/**
 * Resolve a parked approval from the operator side (RB-01 transport).
 * Returns false when no parked call exists for the id.
 */
export function notifyApprovalDecision(approvalId: string, approved: boolean): boolean {
  const gate = parkedApprovals.get(approvalId)
  if (!gate) return false
  parkedApprovals.delete(approvalId)
  if (approved) gate.approve()
  else gate.deny()
  return true
}

function makePendingScopedApproval(input: {
  approvalId: string
  requestHash: string
  principalId: string
  sessionId: string
  action: string
  resource: CanonicalResource
}): ScopedApproval {
  return {
    id: input.approvalId,
    requestId: input.approvalId,
    requestHash: input.requestHash,
    principalId: input.principalId,
    sessionId: input.sessionId,
    decision: "PENDING",
    actions: [input.action as ScopedApproval["actions"][number]],
    resource: input.resource,
    maxUses: 1,
    usesConsumed: 0,
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
    createdEventId: `evt-approval-created:${input.approvalId}`,
  }
}

// ── Phase C PEP: Fail-closed production provider ──────────────────────
// SessionPolicyProvider backed by SqliteGrantStore.
// No grants -> DENY. Storage failure -> DENY.
//
// Intent binding store is not production-wired yet. Using LEGACY_COMPAT here
// means intentBindings stay undefined → PDP skips intent binding (not "allow
// any principal"). Capability matching + risk/approval rules still apply.
// When IntentBindingStore is implemented, switch back to REQUIRED.
/**
 * Production policy provider for a session agent.
 * Ensures a session-scoped grant exists for the agent principal so legitimate
 * TUI sessions are not blanket-denied with DENY_PRINCIPAL_MISMATCH.
 */
function createPolicyProvider(
  db: Database.Interface,
  sessionID: string,
  agentName: string,
  scopedApprovalStore?: SqliteScopedApprovalStore,
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
    "LEGACY_COMPAT",
    scopedApprovalStore,
  )
}

async function preparePolicyProvider(
  db: Database.Interface,
  sessionID: string,
  agentName: string,
  scopedApprovalStore?: SqliteScopedApprovalStore,
): Promise<SessionPolicyProvider> {
  const store = new SqliteGrantStore(db)
  // Bootstrap session agent grants before the first PDP snapshot (idempotent).
  await Effect.runPromise(
    ensureSessionAgentGrants(store, { agentName, sessionId: sessionID }),
  )
  return createPolicyProvider(db, sessionID, agentName, scopedApprovalStore)
}

function formatPepDenial(input: {
  toolName: string
  authReq: AuthorizationRequest
  reasons: { code: string; message: string }[]
  grantPrincipalIds?: string[]
}): string {
  const lines = [
    "DENIED",
    `reason: ${input.reasons.map((r) => r.code).join(", ") || "UNKNOWN"}`,
    `action: ${input.authReq.action}`,
    `tool: ${input.toolName}`,
    `request_principal: ${shortPrincipal(input.authReq.principalId)}`,
    `session: ${shortPrincipal(input.authReq.sessionId, 12)}`,
  ]
  if (input.authReq.workspaceId) {
    lines.push(`workspace: ${shortPrincipal(input.authReq.workspaceId, 12)}`)
  }
  if (input.grantPrincipalIds && input.grantPrincipalIds.length > 0) {
    lines.push(
      `grant_principals: ${input.grantPrincipalIds.map((id) => shortPrincipal(id)).join(", ")}`,
    )
  } else {
    lines.push("grant_principals: (none for request principal)")
  }
  for (const r of input.reasons) {
    lines.push(`detail: ${r.code} — ${r.message}`)
  }
  return lines.join("\n")
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
    case "read":
    case "read_file":
    case "glob":
    case "grep":
    case "search_files":
    case "lsp":
      // Reading local files — content is trusted local source
      labels.push("TRUSTED_LOCAL_SOURCE")
      break

    case "websearch":
    case "web_search":
    case "webfetch":
    case "web_fetch":
    case "fetch":
    case "search":
      // Network reads return remote content
      labels.push("REMOTE_CONTENT")
      labels.push("TOOL_OUTPUT")
      break

    case "write":
    case "write_file":
    case "edit":
    case "patch":
      // Model is generating file content based on user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "shell":
    case "bash":
    case "terminal":
      // Model is generating commands based on user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "send_message":
      // Model is composing a message
      labels.push("USER_INSTRUCTION")
      break

    case "task":
    case "delegate_task":
    case "workflow":
      // Delegating to a subagent — subagent output will carry its own labels
      labels.push("SUBAGENT_OUTPUT")
      break

    case "git_commit":
    case "git_autocommit":
    case "git_push":
      // Git operations derived from user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "skill":
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
  const budget = yield* SessionBudget.Service

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
              // SessionBudget: queue (wait for capacity) instead of erroring.
              // Occupancy is released in finally so waiters can continue.
              const cost = toolBudgetCost(item.id, args as Record<string, unknown>)
              yield* budget.checkOrBlock(ctx.sessionID as any, cost)
              try {
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
              // ── Phase C PEP: THE PRIMARY AUTHORITY ───────────────
              // The effect runs ONLY inside executeExact (RB-01): no tool
              // execution outside the PEP boundary. APPROVAL_REQUIRED parks
              // the call on a durable PENDING approval; the operator decides
              // via notifyApprovalDecision, then the PEP re-evaluates with a
              // fresh snapshot (approved scope now loaded) and executes.
              const workspaceCwd = input.processor.message.path?.cwd
              const scopedStore = getScopedApprovalStore(workspaceCwd)

              const runThroughPep = (attempt: number): Effect.Effect<any> =>
                Effect.gen(function* () {
                  const pepProvider = yield* Effect.promise(() =>
                    preparePolicyProvider(db, ctx.sessionID, input.agent.name, scopedStore),
                  )
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
                      executeExact: () =>
                        Effect.gen(function* () {
                          yield* plugin.trigger(
                            "tool.execute.before",
                            { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
                            { args },
                          )
                          const res = yield* item.execute(args, ctx)
                          yield* plugin.trigger(
                            "tool.execute.after",
                            { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },
                            res,
                          )
                          return res
                        }),
                    },
                    pepProvider,
                    undefined,
                    scopedStore,
                  )
                  if (pepResult.status === "DENIED") {
                    return {
                      title: `Authorization denied: ${item.id}`,
                      output: formatPepDenial({
                        toolName: item.id,
                        authReq,
                        reasons: pepResult.decision.reasons,
                      }),
                      metadata: {
                        pep_denied: true,
                        decision: pepResult.decision,
                        request_principal: authReq.principalId,
                        session_id: authReq.sessionId,
                      },
                    }
                  }
                  if (pepResult.status === "STALE_DECISION") {
                    return {
                      title: `Authorization stale: ${item.id}`,
                      output: `STALE_DECISION\nreason: ${pepResult.reason}\naction: ${authReq.action}\ntool: ${item.id}`,
                      metadata: { pep_stale: true, decision: pepResult.currentDecision },
                    }
                  }
                  if (pepResult.status === "EXECUTION_FAILED") {
                    return {
                      title: `Authorization execution failed: ${item.id}`,
                      output: `EXECUTION_FAILED\n${String(pepResult.error ?? "unknown error")}`,
                      metadata: { pep_execution_failed: true },
                    }
                  }
                  if (pepResult.status === "APPROVAL_REQUIRED") {
                    const reasons = pepResult.decision.reasons.map((r) => r.code).join(", ")
                    const approvalId = `appr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
                    const scoped = makePendingScopedApproval({
                      approvalId,
                      requestHash: pepResult.decision.requestHash,
                      principalId: authReq.principalId,
                      sessionId: ctx.sessionID,
                      action: authReq.action ?? item.id,
                      resource: authReq.resource,
                    })
                    yield* Effect.promise(() => Effect.runPromise(scopedStore.putApproval(scoped)))
                    const gate = createApprovalGate()
                    parkedApprovals.set(approvalId, gate)
                    const decision = yield* Effect.promise(() => gate.decision)
                    if (decision === "denied") {
                      return {
                        title: `Denied: ${item.id}`,
                        output: `DENIED by operator\napproval: ${approvalId}\naction: ${authReq.action}\ntool: ${item.id}\nrequest_principal: ${shortPrincipal(authReq.principalId)}`,
                        metadata: { approval_denied: true, approval_id: approvalId, pep_approval_required: true },
                      }
                    }
                    // Approved — re-run with a fresh snapshot. The approved
                    // scope now loads; the PEP claims, executes, consumes.
                    // Guard recursion (max 2 attempts) — fail closed otherwise.
                    if (attempt >= 2) {
                      return {
                        title: `Approval re-run failed: ${item.id}`,
                        output: `APPROVAL_RE_RUN_EXHAUSTED\nreason: ${reasons}\naction: ${authReq.action}\ntool: ${item.id}`,
                        metadata: { approval_re_run_exhausted: true, approval_id: approvalId },
                      }
                    }
                    return yield* runThroughPep(attempt + 1)
                  }
                  // EXECUTED — the tool ran inside the PEP boundary.
                  return pepResult.value
                })

              const result = yield* runThroughPep(0)
              const output = {
                ...result,
                attachments: result.attachments?.map((attachment: any) => ({
                  ...attachment,
                  id: PartID.ascending(),
                  sessionID: ctx.sessionID,
                  messageID: input.processor.message.id,
                })),
              }
              if (options.abortSignal?.aborted) {
                yield* input.processor.completeToolCall(options.toolCallId, output)
              }
              return output
              } finally {
                yield* budget.release(ctx.sessionID as any, cost)
              }
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
          const mcpCost = toolBudgetCost(key, args as Record<string, unknown>)
          yield* budget.checkOrBlock(ctx.sessionID as any, mcpCost)
          try {
          // ── Phase C PEP: authorize MCP before execution ───────────
          // Same RB-01 contract as local tools: the effect runs only inside
          // executeExact; APPROVAL_REQUIRED parks on a durable approval.
          const mcpWorkspaceCwd = input.processor.message.path?.cwd
          const mcpScopedStore = getScopedApprovalStore(mcpWorkspaceCwd)

          const runMcpThroughPep = (attempt: number): Effect.Effect<any> =>
            Effect.gen(function* () {
              const mcpPepProvider = yield* Effect.promise(() =>
                preparePolicyProvider(db, ctx.sessionID, input.agent.name, mcpScopedStore),
              )
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
                  executeExact: () =>
                    Effect.gen(function* () {
                      yield* plugin.trigger(
                        "tool.execute.before",
                        { tool: key, sessionID: ctx.sessionID, callID: opts.toolCallId },
                        { args },
                      )
                      const res: Awaited<ReturnType<NonNullable<typeof execute>>> = yield* Effect.gen(function* () {
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
                        res,
                      )
                      return res as Record<string, unknown>
                    }),
                },
                mcpPepProvider,
                undefined,
                mcpScopedStore,
              )
              if (mcpPepResult.status === "DENIED") {
                return {
                  content: [
                    {
                      type: "text",
                      text: formatPepDenial({
                        toolName: key,
                        authReq: mcpAuthReq,
                        reasons: mcpPepResult.decision.reasons,
                      }),
                    },
                  ],
                  metadata: { pep_denied: true, request_principal: mcpAuthReq.principalId },
                } as any
              }
              if (mcpPepResult.status === "STALE_DECISION") {
                return {
                  content: [
                    {
                      type: "text",
                      text: `STALE_DECISION\nreason: ${mcpPepResult.reason}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                    },
                  ],
                  metadata: { pep_stale: true },
                } as any
              }
              if (mcpPepResult.status === "EXECUTION_FAILED") {
                return {
                  content: [
                    {
                      type: "text",
                      text: `EXECUTION_FAILED\n${String(mcpPepResult.error ?? "unknown error")}`,
                    },
                  ],
                  metadata: { pep_execution_failed: true },
                } as any
              }
              if (mcpPepResult.status === "APPROVAL_REQUIRED") {
                const reasons = mcpPepResult.decision.reasons.map((r) => r.code).join(", ")
                const approvalId = `appr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
                const scoped = makePendingScopedApproval({
                  approvalId,
                  requestHash: mcpPepResult.decision.requestHash,
                  principalId: mcpAuthReq.principalId,
                  sessionId: ctx.sessionID,
                  action: mcpAuthReq.action ?? key,
                  resource: mcpAuthReq.resource,
                })
                yield* Effect.promise(() => Effect.runPromise(mcpScopedStore.putApproval(scoped)))
                const gate = createApprovalGate()
                parkedApprovals.set(approvalId, gate)
                const decision = yield* Effect.promise(() => gate.decision)
                if (decision === "denied") {
                  return {
                    content: [
                      {
                        type: "text",
                        text: `DENIED by operator\napproval: ${approvalId}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                      },
                    ],
                    metadata: { approval_denied: true, approval_id: approvalId, pep_approval_required: true },
                  } as any
                }
                if (attempt >= 2) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: `APPROVAL_RE_RUN_EXHAUSTED\nreason: ${reasons}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                      },
                    ],
                    metadata: { approval_re_run_exhausted: true, approval_id: approvalId },
                  } as any
                }
                return yield* runMcpThroughPep(attempt + 1)
              }
              // EXECUTED — MCP ran inside the PEP boundary.
              return mcpPepResult.value
            })

          const mcpResult = yield* runMcpThroughPep(0)

          const textParts: string[] = []
          const attachments: Omit<SessionV1.FilePart, "id" | "sessionID" | "messageID">[] = []
          for (const contentItem of mcpResult.content) {
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
            ...mcpResult.metadata,
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
            content: mcpResult.content,
          }
          if (opts.abortSignal?.aborted) {
            yield* input.processor.completeToolCall(opts.toolCallId, output)
          }
          return output
          } finally {
            yield* budget.release(ctx.sessionID as any, mcpCost)
          }
        }),
      )
    tools[key] = item
  }

  return tools
})

export * as SessionTools from "./tools"
