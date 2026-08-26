import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ApprovalEvent } from "@/approval/events"
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
import { SessionID } from "./schema"
import { SessionBudget, toolBudgetCost } from "./budget"
import { EffectBridge } from "@/effect/bridge"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { ModelV2 } from "@arcana/core/model"
import { AgentV2 } from "@arcana/core/agent"
import { withToolAdmission } from "@/tool/batch"
import { checkGoalToolGate } from "@arcana/core/session/goal"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import {
  deriveGateInfluenceClaims,
  evaluateInfluenceEscalation,
  augmentProvenanceForEscalation,
  normalizeInfluenceClaims,
} from "@arcana/core/capability/argument-provenance"

// Boot canary (stale-daemon self-heal, layer 1): a daemon started while
// source was mid-edit could load K7 call sites without their import binding
// and then die per tool call with `ReferenceError` for hours. Assert the
// bindings the admission path depends on BEFORE the first turn — a broken
// boot must crash loudly here (the supervisor/TUI respawns), never sit
// silently poisoning every tool call.
const provenanceCanary: Record<string, unknown> = {
  deriveGateInfluenceClaims,
  evaluateInfluenceEscalation,
  augmentProvenanceForEscalation,
  normalizeInfluenceClaims,
}
for (const [canaryName, canaryFn] of Object.entries(provenanceCanary)) {
  if (typeof canaryFn !== "function") {
    throw new Error(
      `[arcana boot] broken import: ${canaryName} from @arcana/core/capability/argument-provenance resolved to ${String(canaryFn)}`,
    )
  }
}

const READ_ONLY_TOOLS = new Set([
  "read", "grep", "search", "content_search", "glob", "list",
  "list_files", "webfetch", "websearch", "web_fetch", "web_search",
  "question", "todowrite", "skill", "lsp", "memory_search",
  "goal_check",
])
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"

import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import type { IntentBindingStoreEffect } from "@arcana/core/capability/grant-store"
import { ensureSessionAgentGrants, shortPrincipal } from "@arcana/core/capability/session-grants"
import { Database } from "@arcana/core/database/database"
import type { AuthorizationEventEmitter } from "@arcana/core/capability/pep"

import type { AuthorizationRequest, CanonicalResource, ProvenanceLabel, SensitivityLabel } from "@arcana/core/capability/types"
import type { ScopedApproval } from "@arcana/core/capability/scoped-approval"
import { SqliteScopedApprovalStore } from "@arcana/core/crypto/scoped-approval-adapter"
import type { RiskClass } from "@arcana/core/capability/types"
import { buildApprovalRequestSnapshot } from "@arcana/core/crypto/approval-request-snapshot"
import { formatInspectSummary, inspectEffect } from "@/execution/inspect"
import { loadApprovalRoutingPolicy, deploymentModeFromEnv, resolveApprovalRoute } from "@/approval/routing"
import { desktopOnline } from "@/approval/desktop-subscribers"
import { EventStore } from "./epistemic/event-store"
import { SessionStatus } from "./status"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"
import { IntentRuntime, type IntentAuthority } from "./intent-runtime"

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
  /** Session that spawned this session (subagent delegation), for attribution. */
  parentSessionId?: string
  action: string
  resource: CanonicalResource
  contractRevision?: number
  route?: import("@arcana/core/crypto/approval-routing").ApprovalRoute
  routingPolicyVersion?: string
  localFallbackAllowed?: boolean
  riskClass?: import("@arcana/core/capability/types").RiskClass
}): ScopedApproval {
  return {
    id: input.approvalId,
    requestId: input.approvalId,
    requestHash: input.requestHash,
    principalId: input.principalId,
    sessionId: input.sessionId,
    parentSessionId: input.parentSessionId,
    contractRevision: input.contractRevision,
    decision: "PENDING",
    actions: [input.action as ScopedApproval["actions"][number]],
    resource: input.resource,
    maxUses: 1,
    usesConsumed: 0,
    expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
    createdEventId: `evt-approval-created:${input.approvalId}`,
    route: input.route,
    routingPolicyVersion: input.routingPolicyVersion,
    localFallbackAllowed: input.localFallbackAllowed,
    riskClass: input.riskClass,
  }
}

/**
 * Audit PR-2: persist the durable approval row AND its immutable request
 * snapshot in ONE store transaction (when the store supports it). The
 * snapshot lets the operator review the exact action/resource/arguments the
 * request hash commits to; it is written at creation and never mutated.
 */
function persistApprovalWithSnapshot(input: {
  store: SqliteScopedApprovalStore
  scoped: ScopedApproval
  request: AuthorizationRequest
  args: Record<string, unknown>
  requestHash: string
  contractRevision: number
  riskClass: RiskClass
}): Effect.Effect<void> {
  const inspect = inspectEffect({
    tool: typeof input.args.tool === "string" ? input.args.tool : input.request.action,
    args: input.args,
  })
  const snapshotRow = {
    request: input.request,
    args: input.args,
    snapshot: buildApprovalRequestSnapshot(
      input.request,
      {
        approvalId: input.scoped.id,
        requestHash: input.requestHash,
        contractRevision: input.contractRevision,
        riskClass: input.riskClass,
        ...(inspect.findings.length
          ? {
              artifactPreview: {
                kind: "inspect",
                name: inspect.verdict,
                description: formatInspectSummary(inspect),
              },
            }
          : {}),
      },
      input.args,
    ),
  }
  return Effect.promise(() =>
    input.store.putApprovalWithSnapshot
      ? Effect.runPromise(input.store.putApprovalWithSnapshot(input.scoped, snapshotRow))
      : Effect.runPromise(input.store.putApproval(input.scoped)),
  )
}

/** Numeric contract revision bound to an authorization request (string on the wire). */
function contractRevisionOf(request: AuthorizationRequest): number {
  return request.contractRevision ? Number(request.contractRevision) : 0
}

/**
 * Phase D: resolve the advisory routing decision for a REQUIRE_APPROVAL
 * request and return the metadata persisted on the durable approval record.
 * Failures fall back to LOCAL_TUI metadata (undefined fields), preserving
 * the pre-routing behavior.
 */
function resolveApprovalRoutingForRequest(input: {
  workspaceCwd?: string
  sessionId: string
  action: string
  riskClass: RiskClass
  requestId: string
  requestHash: string
}): Effect.Effect<{
  route: import("@arcana/core/crypto/approval-routing").ApprovalRoute | undefined
  routingPolicyVersion: string | undefined
  localFallbackAllowed: boolean | undefined
  riskClass: RiskClass
}> {
  const workspaceCwd = input.workspaceCwd ?? process.cwd()
  return Effect.sync(() => {
    const policy = loadApprovalRoutingPolicy(workspaceCwd)
      const resolution = resolveApprovalRoute(policy, {
        sessionId: input.sessionId,
        workspaceId: workspaceCwd,
        action: input.action,
        riskClass: input.riskClass,
        deploymentMode: deploymentModeFromEnv(),
        desktopOnline: desktopOnline(workspaceCwd),
        requestId: input.requestId,
        requestHash: input.requestHash,
      })
      return {
        route: resolution.route,
        routingPolicyVersion: resolution.policyVersion,
        localFallbackAllowed: resolution.localFallbackAllowed,
        riskClass: input.riskClass,
      }
  })
}

// ── Phase C PEP: Fail-closed production provider ──────────────────────
// SessionPolicyProvider backed by SqliteGrantStore.
// No grants -> DENY. Storage failure -> DENY.
//
// Active-contract sessions use the durable intent store in REQUIRED mode.
// Contractless sessions retain an explicit, proof-visible compatibility path
// until production contract admission is complete.
/**
 * Production policy provider for a session agent.
 * Ensures a session-scoped grant exists for the agent principal so legitimate
 * TUI sessions are not blanket-denied with DENY_PRINCIPAL_MISMATCH.
 */
function createPolicyProvider(
  db: Database.Interface,
  sessionID: string,
  agentName: string,
  intentStore?: IntentBindingStoreEffect,
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
    intentStore,
    intentStore ? "REQUIRED" : "LEGACY_COMPAT",
    scopedApprovalStore,
  )
}

async function preparePolicyProvider(
  db: Database.Interface,
  sessionID: string,
  agentName: string,
  intentStore?: IntentBindingStoreEffect,
  scopedApprovalStore?: SqliteScopedApprovalStore,
  eventStore?: EventStore.Interface,
): Promise<SessionPolicyProvider> {
  const store = new SqliteGrantStore(db)
  // Bootstrap session agent grants before the first PDP snapshot (idempotent).
  await Effect.runPromise(
    ensureSessionAgentGrants(
      store,
      { agentName, sessionId: sessionID },
      eventStore
        ? (grant) =>
            eventStore.append({
              sessionId: grant.constraints.sessionId ?? sessionID,
              actor: { kind: "policy", id: "session-grant-bootstrap" },
              type: "capability.created",
              payload: {
                capabilityId: grant.id,
                principal: grant.principal,
                issuer: grant.issuer,
                actions: grant.actions,
                resources: grant.resources,
                constraints: grant.constraints,
                delegation: grant.delegation,
                status: grant.status,
                createdEventId: grant.createdEventId,
              },
            }).pipe(Effect.asVoid)
        : undefined,
    ),
  )
  return createPolicyProvider(db, sessionID, agentName, intentStore, scopedApprovalStore)
}

function intentRequestFields(authority: IntentAuthority) {
  if (authority.mode !== "REQUIRED") return {}
  return {
    contractId: authority.contractId,
    contractRevision: authority.contractRevision,
    criterionIds: [...authority.criterionIds],
  }
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
 * Build an MCP tool result object for PEP gate outcomes.
 * All MCP result objects share this shape; the `as any` casts existed because
 * the MCP protocol type doesn't exactly match the AI SDK's expected return type.
 * This helper constructs the object once, typed as `Record<string, unknown>`.
 */
function mcpToolResult(
  text: string,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    content: [{ type: "text" as const, text }],
    ...(metadata ? { metadata } : {}),
  }
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
    case "mcp":
      // Network reads return remote content
      labels.push("REMOTE_CONTENT")
      labels.push("TOOL_OUTPUT")
      if (toolName === "mcp") labels.push("MCP_DESCRIPTION")
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
      // Delegating to a subagent is model-initiated (MODEL_OUTPUT); the
      // intent runtime grounds it via the session's ACTIVE_CONTRACT label
      // when a contract is in force. SUBAGENT_OUTPUT was wrong here: it made
      // every delegation look untrusted and forced an approval gate.
      break

    case "git_commit":
    case "git_autocommit":
    case "git_push":
      // Git operations derived from user instruction
      labels.push("USER_INSTRUCTION")
      break

    case "skill":
    case "skill_create":
    case "skill_upsert":
    case "plugin_upsert":
    case "memory_store_fact":
    case "memory_search":
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
  // InstanceRef is request-derived context: it is provided by the HTTP
  // middleware for the turn that started the request, but a turn resumed or
  // re-driven after a daemon re-registration can run without it (the in-memory
  // instance registry is process-local). The durable session record carries
  // the instance directory — rebuild the context on demand so tool execution
  // never depends on the request path. Idempotent in the healthy case: the
  // request-derived ref wins when present.
  const instanceRef = yield* InstanceRef
  const instance = instanceRef ?? (yield* Effect.gen(function* () {
    yield* Effect.logWarning("InstanceRef missing at tool resolve — recovering from durable session", {
      sessionID: input.session.id,
      directory: input.session.directory,
    })
    const store = yield* InstanceStore.Service
    return yield* store.load({ directory: input.session.directory })
  }))
  const run = yield* EffectBridge.make({ instance })
  const plugin = yield* Plugin.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const mcp = yield* MCP.Service
  const truncate = yield* Truncate.Service
  const db = yield* Database.Service
  const budget = yield* SessionBudget.Service
  const events = yield* EventV2Bridge.Service
  const eventStore = yield* EventStore.Service
  const sessionStatus = yield* SessionStatus.Service

  // GOVERNANCE EVIDENCE BOUNDARY: every production PEP decision must enter the
  // durable hash-chained EventStore. Passing no emitter keeps enforcement live
  // but silently erases authorization evidence from REST, SSE, and the TUI.
  const governanceEmitter: AuthorizationEventEmitter = {
    emit: (event) =>
      eventStore
        .append({
          sessionId: event.sessionId,
          actor: event.actor as ArcanaEvent["actor"],
          type: event.type as ArcanaEvent["type"],
          payload: event.payload,
        })
        .pipe(Effect.asVoid),
  }

  // RB-01 gap fix: the TUI read path is the SSE sync channel
  // (sync.data.approvals) — a fresh PENDING record with no subsequent
  // transition would never reach it. Publish approval.updated on create so
  // the entry renders immediately. A read/publish failure must not fail the
  // tool call (the durable record is already written).
  const publishApprovalCreated = (sessionID: SessionID, store: SqliteScopedApprovalStore, approvalId: string) =>
    store.getApprovalRecord(approvalId).pipe(
      Effect.flatMap((record) =>
        record
          ? events.publish(ApprovalEvent, { sessionID, approval: record })
          : Effect.void,
      ),
      Effect.catch(() => Effect.void),
    )

  const approvalSurface = (approval: ScopedApproval) => {
    if (approval.route === "CENTRAL_REQUIRED") return "CENTRAL" as const
    if (approval.route === "LOCAL_TUI" || !approval.route) return "LOCAL_TUI" as const
    const online = desktopOnline(input.processor.message.path?.cwd ?? input.session.directory)
    if (approval.route === "DESKTOP_REQUIRED") return online ? ("DESKTOP" as const) : ("PENDING" as const)
    return online
      ? ("DESKTOP" as const)
      : approval.localFallbackAllowed !== false
        ? ("LOCAL_TUI" as const)
        : ("PENDING" as const)
  }

  const awaitApprovalDecision = Effect.fn("SessionTools.awaitApprovalDecision")(function* (args: {
    gate: ApprovalGate
    approval: ScopedApproval
    store: SqliteScopedApprovalStore
  }) {
    const remaining = Math.max(0, Date.parse(args.approval.expiresAt) - Date.now())
    yield* sessionStatus.set(input.session.id, {
      type: "waiting",
      reason: "approval",
      requestID: args.approval.id,
      decisionSurface: approvalSurface(args.approval),
    })
    const decision = yield* Effect.promise(() => args.gate.decision).pipe(
      Effect.timeoutOrElse({
        duration: `${remaining} millis`,
        orElse: () => Effect.succeed("expired" as const),
      }),
      Effect.onInterrupt(() =>
        args.store.updateApproval(args.approval.id, {
          decision: "REJECTED",
          decidedEventId: `evt-approval-aborted:${args.approval.id}`,
        }).pipe(
          Effect.orDie,
          Effect.andThen(publishApprovalCreated(input.session.id, args.store, args.approval.id)),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          parkedApprovals.delete(args.approval.id)
        }),
      ),
    )
    if (decision === "expired") {
      yield* args.store.updateApproval(args.approval.id, {
        decision: "EXPIRED",
        decidedEventId: `evt-approval-expired:${args.approval.id}`,
      }).pipe(Effect.orDie)
      yield* publishApprovalCreated(input.session.id, args.store, args.approval.id)
      yield* sessionStatus.set(input.session.id, { type: "busy" })
      return "denied" as const
    }
    yield* sessionStatus.set(input.session.id, { type: "busy" })
    return decision
  })

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
        // Spread the existing state and overwrite only the supplied fields.
        // Status is narrowed to running/pending, but the ToolState union still
        // lacks optional fields on the pending branch — cast for the update.
        const next = { ...match.state, status: "running" } as Record<string, unknown>
        // The pending branch has no time field; completion reads
        // state.time.start, so stamp the start time on the running transition.
        if (!next.time) next.time = { start: Date.now() }
        if (val.title !== undefined) next.title = val.title
        if (val.metadata !== undefined) next.metadata = val.metadata
        if (val.output !== undefined) next.output = val.output
        return {
          ...match,
          state: next as typeof match.state,
        }
      }),
    ask: (req) =>
      permission
        .ask({
          ...req,
          sessionID: input.session.id,
          projectID: input.session.projectID,
          agentID: AgentV2.ID.make(input.agent.name),
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
              yield* budget.checkOrBlock(ctx.sessionID, cost)
              try {
              // Goal awareness: Tier B mutation gate + freeze after goal complete.
              // Read-only tools skip the gate entirely — they cannot mutate.
              // Mutating tools cache the gate result per turn: the goal state
              // does not change between tool calls in the same runLoop turn,
              // so re-evaluating per call is redundant disk I/O.
              const isReadOnlyTool = READ_ONLY_TOOLS.has(item.id)
              if (!isReadOnlyTool) {
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
              }
              // ── Phase C PEP: THE PRIMARY AUTHORITY ───────────────
              // The effect runs ONLY inside executeExact (RB-01): no tool
              // execution outside the PEP boundary. APPROVAL_REQUIRED parks
              // the call on a durable PENDING approval; the operator decides
              // via notifyApprovalDecision, then the PEP re-evaluates with a
              // fresh snapshot (approved scope now loaded) and executes.
              const workspaceCwd = input.processor.message.path?.cwd
              const scopedStore = getScopedApprovalStore(workspaceCwd)
              const intentAuthority = yield* IntentRuntime.resolveIntentAuthority(db, ctx.sessionID)
              if (intentAuthority.mode === "LEGACY_COMPAT") {
                yield* IntentRuntime.recordCompatibilityMode(ctx.sessionID, eventStore).pipe(
                  Effect.catch(() => Effect.void),
                )
              } else {
                yield* IntentRuntime.recordRequiredMode(ctx.sessionID, intentAuthority, eventStore).pipe(
                  Effect.catch(() => Effect.void),
                )
              }
              // ── K7: consequential-argument influence claims ─────────
              // Derive gate-default claims for this tool's consequential
              // arguments and evaluate escalation. Escalated requests augment
              // provenance with UNTRUSTED_REMOTE so the existing Phase C
              // provenance rules carry enforcement (fixtures D1/D10).
              const k7Claims = normalizeInfluenceClaims(
                deriveGateInfluenceClaims({
                  toolName: item.id,
                  assertedBy: input.agent.name,
                  argv:
                    typeof args.command === "string"
                      ? [String(args.command)]
                      : typeof args.cmd === "string"
                        ? [String(args.cmd)]
                        : undefined,
                  filePath:
                    typeof args.filePath === "string"
                      ? args.filePath
                      : typeof args.path === "string"
                        ? String(args.path)
                        : undefined,
                  url: typeof args.url === "string" ? args.url : undefined,
                  secretName: item.id.startsWith("secret") || item.id.includes("key") ? item.id : undefined,
                }),
              )
              const { escalate: k7Escalate } = evaluateInfluenceEscalation(k7Claims)
              const k7Provenance = augmentProvenanceForEscalation(
                extractProvenance(item.id, args as Record<string, unknown>),
                k7Escalate,
                k7Claims,
              )

              // APPROVAL HASH BOUNDARY: construct once and reuse this exact
              // immutable request across every parked approval retry.
              const authReq = buildAuthorizationRequest({
                toolName: item.id,
                principalId: input.agent.name,
                sessionId: ctx.sessionID,
                ...intentRequestFields(intentAuthority),
                args: args as Record<string, unknown>,
                provenance:
                  intentAuthority.mode === "REQUIRED"
                    ? [...new Set([...extractProvenance(item.id, args as Record<string, unknown>), "ACTIVE_CONTRACT" as ProvenanceLabel])]
                    : extractProvenance(item.id, args as Record<string, unknown>),
                sensitivity: extractSensitivity(item.id, args as Record<string, unknown>),
              })
              yield* IntentRuntime.ensureRuntimeBinding(authReq, intentAuthority, eventStore).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
              )

              const runThroughPep = (attempt: number): Effect.Effect<any> =>
                Effect.gen(function* () {
                  const pepProvider = yield* Effect.promise(() =>
                    preparePolicyProvider(
                      db,
                      ctx.sessionID,
                      input.agent.name,
                      intentAuthority.mode === "REQUIRED" ? intentAuthority.store : undefined,
                      scopedStore,
                      eventStore,
                    ),
                  )
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
                    governanceEmitter,
                    scopedStore,
                  )
                  if (pepResult.status === "DENIED") {
                    // ── Subagent capability escalation ─────────────────
                    // A subagent's capability deny MUST surface to the
                    // operator (approve/reject on the MAIN session) instead
                    // of silently failing the child. On approval, attenuated
                    // child grants are minted from the parent session's
                    // ACTIVE caps via delegateCapabilities — authority stays
                    // ⪯ parent. True revocations/explicit denies and
                    // delegation-amplification failures are never escalatable.
                    const ESCALATABLE = new Set(["DENY_NO_MATCHING_CAPABILITY", "DENY_PRINCIPAL_MISMATCH"])
                    const isSubagent = Boolean(input.session.parentID)
                    const reasons_ = pepResult.decision.reasons ?? []
                    const escalatable =
                      isSubagent && attempt < 2 &&
                      reasons_.length > 0 &&
                      reasons_.every((r) => ESCALATABLE.has(r.code))
                    if (escalatable && input.session.parentID) {
                      const escalationId = `appr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
                      const routingEsc = yield* resolveApprovalRoutingForRequest({
                        workspaceCwd,
                        sessionId: ctx.sessionID,
                        action: authReq.action,
                        riskClass: pepResult.decision.riskClass,
                        requestId: authReq.requestId,
                        requestHash: pepResult.decision.requestHash,
                      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
                      const scopedEsc = makePendingScopedApproval({
                        approvalId: escalationId,
                        requestHash: pepResult.decision.requestHash,
                        principalId: authReq.principalId,
                        sessionId: ctx.sessionID,
                        parentSessionId: input.session.parentID,
                        action: authReq.action ?? item.id,
                        resource: authReq.resource,
                        contractRevision: contractRevisionOf(authReq),
                        ...(routingEsc ?? {}),
                      })
                      yield* persistApprovalWithSnapshot({
                        store: scopedStore,
                        scoped: scopedEsc,
                        request: authReq,
                        args: args as Record<string, unknown>,
                        requestHash: pepResult.decision.requestHash,
                        contractRevision: contractRevisionOf(authReq),
                        riskClass: scopedEsc.riskClass ?? pepResult.decision.riskClass,
                      })
                      yield* publishApprovalCreated(input.session.parentID, scopedStore, escalationId)
                      const escGate = createApprovalGate()
                      parkedApprovals.set(escalationId, escGate)
                      const escDecision = yield* awaitApprovalDecision({ gate: escGate, approval: scopedEsc, store: scopedStore })
                      if (escDecision === "approved") {
                        // Mint attenuated children from the parent session's
                        // ACTIVE caps. Fail-closed if no parent authority
                        // covers the denied action.
                        const grantStore = new SqliteGrantStore(db)
                        type CG = import("@arcana/core/capability/types").CapabilityGrant
                        const parentCapIds = new Set<string>()
                        const own = yield* grantStore
                          .getGrantsForPrincipal(authReq.principalId, ctx.sessionID)
                          .pipe(Effect.catch(() => Effect.succeed<readonly CG[]>([])))
                        for (const g of own) {
                          if (g.status === "ACTIVE" && g.issuer.kind === "parent_capability") parentCapIds.add(g.issuer.id)
                        }
                        parentCapIds.add(`cap-session-${input.session.parentID}-build`)
                        const parentGrants: CG[] = []
                        for (const capId of parentCapIds) {
                          const g = yield* grantStore.getGrantById(capId).pipe(
                            Effect.catch(() => Effect.succeed<CG | null>(null)),
                          )
                          if (g?.status === "ACTIVE") parentGrants.push(g)
                        }
                        const { delegateCapabilities } = yield* Effect.promise(() =>
                          import("@arcana/core/capability/delegation"),
                        )
                        const contractId = intentAuthority.mode === "REQUIRED" ? intentAuthority.contractId : "none"
                        const delegation = delegateCapabilities(
                          {
                            parentPrincipalId: "build",
                            childPrincipalId: authReq.principalId,
                            parentSessionId: input.session.parentID,
                            childSessionId: ctx.sessionID,
                            contractId,
                            contractRevision: contractRevisionOf(authReq) ?? 0,
                            requestedGrants: [
                              {
                                actions: [authReq.action ?? item.id],
                                resources: authReq.resource ? [authReq.resource] : [],
                                constraints: { toolNames: [item.id] },
                              },
                            ],
                            delegatedContext: { contractId },
                          } as never,
                          parentGrants,
                          parentGrants[0]?.createdEventId ?? `escalation-${escalationId}`,
                        )
                        if (delegation.status === "CREATED") {
                          for (const child of delegation.childGrants) {
                            yield* grantStore.putGrant(child).pipe(Effect.catch(() => Effect.void))
                          }
                          return yield* runThroughPep(attempt + 1)
                        }
                        // Delegation itself failed-closed → fall through to
                        // the original denial below.
                      }
                    }
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
                    const routing = yield* resolveApprovalRoutingForRequest({
                      workspaceCwd,
                      sessionId: ctx.sessionID,
                      action: authReq.action,
                      riskClass: pepResult.decision.riskClass,
                      requestId: authReq.requestId,
                      requestHash: pepResult.decision.requestHash,
                    }).pipe(Effect.catch(() => Effect.succeed(undefined)))
                    const scoped = makePendingScopedApproval({
                      approvalId,
                      requestHash: pepResult.decision.requestHash,
                      principalId: authReq.principalId,
                      sessionId: ctx.sessionID,
                      parentSessionId: input.session.parentID,
                      action: authReq.action ?? item.id,
                      resource: authReq.resource,
                      contractRevision: contractRevisionOf(authReq),
                      ...(routing ?? {}),
                    })
                    yield* persistApprovalWithSnapshot({
                      store: scopedStore,
                      scoped,
                      request: authReq,
                      args: args as Record<string, unknown>,
                      requestHash: pepResult.decision.requestHash,
                      contractRevision: contractRevisionOf(authReq),
                      riskClass: scoped.riskClass ?? pepResult.decision.riskClass,
                    })
                    yield* publishApprovalCreated(ctx.sessionID, scopedStore, approvalId)
                    const gate = createApprovalGate()
                    parkedApprovals.set(approvalId, gate)
                    const decision = yield* awaitApprovalDecision({ gate, approval: scoped, store: scopedStore })
                    if (decision === "denied") {
                      return {
                        title: `Denied: ${item.id}`,
                        output: `DENIED by operator\napproval: ${approvalId}\naction: ${authReq.action}\ntool: ${item.id}\nrequest_principal: ${shortPrincipal(authReq.principalId)}`,
                        metadata: { approval_denied: true, approval_id: approvalId, pep_approval_required: true },
                      }
                    }
                    if (intentAuthority.mode === "REQUIRED") {
                      const binding = yield* IntentRuntime.ensureApprovedBinding(
                          authReq,
                          intentAuthority,
                          scoped.expiresAt,
                          eventStore,
                        ).pipe(Effect.catch(() => Effect.succeed(undefined)))
                      if (!binding) {
                        return {
                          title: `Intent binding failed: ${item.id}`,
                          output: `INTENT_BINDING_FAILED\naction: ${authReq.action}\ntool: ${item.id}\nrequest_hash: ${pepResult.decision.requestHash}`,
                          metadata: { intent_binding_failed: true, approval_id: approvalId },
                        }
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
                yield* budget.release(ctx.sessionID, cost)
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
          yield* budget.checkOrBlock(ctx.sessionID, mcpCost)
          try {
          // ── Phase C PEP: authorize MCP before execution ───────────
          // Same RB-01 contract as local tools: the effect runs only inside
          // executeExact; APPROVAL_REQUIRED parks on a durable approval.
          const mcpWorkspaceCwd = input.processor.message.path?.cwd
          const mcpScopedStore = getScopedApprovalStore(mcpWorkspaceCwd)
          const mcpIntentAuthority = yield* IntentRuntime.resolveIntentAuthority(db, ctx.sessionID)
          if (mcpIntentAuthority.mode === "LEGACY_COMPAT") {
            yield* IntentRuntime.recordCompatibilityMode(ctx.sessionID, eventStore).pipe(
              Effect.catch(() => Effect.void),
            )
          } else {
            yield* IntentRuntime.recordRequiredMode(ctx.sessionID, mcpIntentAuthority, eventStore).pipe(
              Effect.catch(() => Effect.void),
            )
          }
          const mcpAuthReq = buildAuthorizationRequest({
            toolName: key,
            principalId: input.agent.name,
            sessionId: ctx.sessionID,
            ...intentRequestFields(mcpIntentAuthority),
            args: args as Record<string, unknown>,
            provenance: ["MCP_DESCRIPTION" as ProvenanceLabel],
            sensitivity: extractSensitivity(key, args as Record<string, unknown>),
          })
          yield* IntentRuntime.ensureRuntimeBinding(mcpAuthReq, mcpIntentAuthority, eventStore).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )

          const runMcpThroughPep = (attempt: number): Effect.Effect<any> =>
            Effect.gen(function* () {
              const mcpPepProvider = yield* Effect.promise(() =>
                preparePolicyProvider(
                  db,
                  ctx.sessionID,
                  input.agent.name,
                  mcpIntentAuthority.mode === "REQUIRED" ? mcpIntentAuthority.store : undefined,
                  mcpScopedStore,
                  eventStore,
                ),
              )
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
                governanceEmitter,
                mcpScopedStore,
              )
              if (mcpPepResult.status === "DENIED") {
                return mcpToolResult(
                  formatPepDenial({
                    toolName: key,
                    authReq: mcpAuthReq,
                    reasons: mcpPepResult.decision.reasons,
                  }),
                  { pep_denied: true, request_principal: mcpAuthReq.principalId },
                )
              }
              if (mcpPepResult.status === "STALE_DECISION") {
                return mcpToolResult(
                  `STALE_DECISION\nreason: ${mcpPepResult.reason}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                  { pep_stale: true },
                )
              }
              if (mcpPepResult.status === "EXECUTION_FAILED") {
                return mcpToolResult(
                  `EXECUTION_FAILED\n${String(mcpPepResult.error ?? "unknown error")}`,
                  { pep_execution_failed: true },
                )
              }
              if (mcpPepResult.status === "APPROVAL_REQUIRED") {
                const reasons = mcpPepResult.decision.reasons.map((r) => r.code).join(", ")
                const approvalId = `appr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
                const mcpRouting = yield* resolveApprovalRoutingForRequest({
                  workspaceCwd: mcpWorkspaceCwd,
                  sessionId: ctx.sessionID,
                  action: mcpAuthReq.action,
                  riskClass: mcpPepResult.decision.riskClass,
                  requestId: mcpAuthReq.requestId,
                  requestHash: mcpPepResult.decision.requestHash,
                }).pipe(Effect.catch(() => Effect.succeed(undefined)))
                const scoped = makePendingScopedApproval({
                  approvalId,
                  requestHash: mcpPepResult.decision.requestHash,
                  principalId: mcpAuthReq.principalId,
                  sessionId: ctx.sessionID,
                  parentSessionId: input.session.parentID,
                  action: mcpAuthReq.action ?? key,
                  resource: mcpAuthReq.resource,
                  contractRevision: contractRevisionOf(mcpAuthReq),
                  ...(mcpRouting ?? {}),
                })
                yield* persistApprovalWithSnapshot({
                  store: mcpScopedStore,
                  scoped,
                  request: mcpAuthReq,
                  args: args as Record<string, unknown>,
                  requestHash: mcpPepResult.decision.requestHash,
                  contractRevision: contractRevisionOf(mcpAuthReq),
                  riskClass: scoped.riskClass ?? mcpPepResult.decision.riskClass,
                })
                yield* publishApprovalCreated(ctx.sessionID, mcpScopedStore, approvalId)
                const gate = createApprovalGate()
                parkedApprovals.set(approvalId, gate)
                const decision = yield* awaitApprovalDecision({ gate, approval: scoped, store: mcpScopedStore })
                if (decision === "denied") {
                  return mcpToolResult(
                    `DENIED by operator\napproval: ${approvalId}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                    { approval_denied: true, approval_id: approvalId, pep_approval_required: true },
                  )
                }
                if (mcpIntentAuthority.mode === "REQUIRED") {
                  const binding = yield* IntentRuntime.ensureApprovedBinding(
                      mcpAuthReq,
                      mcpIntentAuthority,
                      scoped.expiresAt,
                      eventStore,
                    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
                  if (!binding) {
                    return mcpToolResult(
                      `INTENT_BINDING_FAILED\naction: ${mcpAuthReq.action}\ntool: ${key}\nrequest_hash: ${mcpPepResult.decision.requestHash}`,
                      { intent_binding_failed: true, approval_id: approvalId },
                    )
                  }
                }
                if (attempt >= 2) {
                  return mcpToolResult(
                    `APPROVAL_RE_RUN_EXHAUSTED\nreason: ${reasons}\naction: ${mcpAuthReq.action}\ntool: ${key}`,
                    { approval_re_run_exhausted: true, approval_id: approvalId },
                  )
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
            yield* budget.release(ctx.sessionID, mcpCost)
          }
        }),
      )
    tools[key] = item
  }

  return tools
})

export * as SessionTools from "./tools"
