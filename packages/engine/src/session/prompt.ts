import { LayerNode } from "@arcana/core/effect/layer-node"
import { PermissionV1 } from "@arcana/core/v1/permission"
import path from "path"
import { SessionV1 } from "@arcana/core/v1/session"
import os from "os"
import { SessionID, MessageID, PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import { SessionRevert } from "./revert"
import { SessionBudget } from "./budget"
import { Session } from "./session"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"
import * as Locale from "@/util/locale"

import { type Tool as AITool, tool, jsonSchema } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { SessionCompaction } from "./compaction"
import { SystemPrompt } from "./system"
import { Instruction } from "./instruction"
import { Plugin } from "../plugin"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../mcp"
import { LSP } from "@/lsp/lsp"
import { ulid } from "ulid"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@arcana/core/cross-spawn-spawner"
import * as Stream from "effect/Stream"
import { Command } from "../command"
import { pathToFileURL, fileURLToPath } from "url"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@arcana/core/util/error"
import { SessionProcessor } from "./processor"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { Shell } from "@arcana/core/shell"
import { ShellID } from "@/tool/shell/id"
import { FSUtil } from "@arcana/core/fs-util"
import { Truncate } from "@/tool/truncate"
import { Image } from "@/image/image"
import { decodeDataUrl } from "@/util/data-url"
import { Process } from "@/util/process"
import { Cause, Effect, Exit, Latch, Layer, Option, Scope, Context, Schema, Types } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { SessionRunState } from "./run-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Database } from "@arcana/core/database/database"
import { SessionEvent } from "@arcana/core/session/event"
import { SessionMessage } from "@arcana/core/session/message"
import { ModelV2 } from "@arcana/core/model"
import { ProviderV2 } from "@arcana/core/provider"
import { AgentAttachment, FileAttachment, Prompt, Source } from "@arcana/core/session/prompt"
import { formatActiveGoalBlock } from "@arcana/core/session/goal"
import * as DateTime from "effect/DateTime"
import { and, eq, ne, sql } from "drizzle-orm"
import { ContractTable } from "@arcana/core/epistemic/contract-sql"
import { ObligationTable } from "@arcana/core/epistemic/obligation-sql"
import { SqliteIntentBindingStore } from "@arcana/core/capability/intent-binding-store-sqlite"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { EventStore } from "./epistemic/event-store"
import { ObligationEngine } from "./epistemic/obligation-engine"
import { CompletionVerifier } from "./epistemic/completion-verifier"
import { ContractEngine } from "./epistemic/contract-engine"
import { IntentRuntime } from "./intent-runtime"
import { ContractAdmission } from "./contract-admission"
import { CapabilityRevocation } from "./capability-revocation"
import { revokeWithCascade, type RuntimeGrantStore } from "@arcana/core/capability/runtime-delegation"
import { deriveCompletionReason } from "./epistemic/completion-reason"
import { SessionTable } from "@arcana/core/session/sql"
import { SessionReminders } from "./reminders"
import { formatInstallResumePrompt, takeParkedInstall } from "@/execution/install-notice"
import { SessionTools } from "./tools"
import { LLMEvent } from "@arcana/llm"

// @ts-ignore globalThis.AI_SDK_LOG_WARNINGS not in TS lib — prevents ai-sdk stdout spam
globalThis.AI_SDK_LOG_WARNINGS = false

const decodeMessageInfo = Schema.decodeUnknownExit(SessionV1.Info)
const decodeMessagePart = Schema.decodeUnknownExit(SessionV1.Part)

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.`

/**
 * True when the active contract already has a completion.resolved event.
 * Completion idempotency is per contract — a later contract in the same
 * session must still run the gate even after an earlier VERIFIED_COMPLETE.
 */
export function contractCompletionAlreadyResolved(
  resolvedEvents: ReadonlyArray<{ payload: unknown }>,
  contractId: string,
): boolean {
  return resolvedEvents.some((event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    return payload?.contractId === contractId
  })
}

function isOrphanedInterruptedTool(part: SessionV1.ToolPart) {
  // cleanup() marks abandoned tool_use blocks this way after retries/aborts.
  // They are not pending work and must not trigger an assistant-prefill request.
  return part.state.status === "error" && part.state.metadata?.interrupted === true
}

export interface Interface {
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly prompt: (input: PromptInput) => Effect.Effect<SessionV1.WithParts, Image.Error>
  readonly loop: (input: LoopInput) => Effect.Effect<SessionV1.WithParts>
  readonly shell: (input: ShellInput) => Effect.Effect<SessionV1.WithParts, Session.BusyError>
  readonly command: (input: CommandInput) => Effect.Effect<SessionV1.WithParts, Image.Error>
  readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/SessionPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const status = yield* SessionStatus.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const processor = yield* SessionProcessor.Service
    const compaction = yield* SessionCompaction.Service
    const plugin = yield* Plugin.Service
    const commands = yield* Command.Service
    const config = yield* Config.Service
    const permission = yield* Permission.Service
    const fsys = yield* FSUtil.Service
    const mcp = yield* MCP.Service
    const lsp = yield* LSP.Service
    const registry = yield* ToolRegistry.Service
    const truncate = yield* Truncate.Service
    const image = yield* Image.Service
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const scope = yield* Scope.Scope
    const instruction = yield* Instruction.Service
    const state = yield* SessionRunState.Service
    const revert = yield* SessionRevert.Service
    const summary = yield* SessionSummary.Service
    const sys = yield* SystemPrompt.Service
    const llm = yield* LLM.Service
    const budget = yield* SessionBudget.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const eventStore = yield* EventStore.Service
    const contracts = yield* ContractEngine.Service
    const obligations = yield* ObligationEngine.Service
    const { db } = database
    const ops = Effect.fn("SessionPrompt.ops")(function* () {
      return {
        cancel: (sessionID: SessionID) => cancel(sessionID),
        resolvePromptParts: (template: string) => resolvePromptParts(template),
        prompt: (input: PromptInput) => prompt(input).pipe(Effect.catch(Effect.die)),
      } satisfies TaskPromptOps
    })

    const cancel = Effect.fn("SessionPrompt.cancel")(function* (sessionID: SessionID) {
      yield* Effect.logInfo("cancel", { "session.id": sessionID })
      // Set cancellation metadata so session.completed emits reason: "cancelled"
      yield* sessions.setMetadata({
        sessionID,
        metadata: { ...((yield* sessions.get(sessionID).pipe(Effect.catch(() => Effect.succeed(null))))?.metadata ?? {}), __arcana_cancelled: true },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
      yield* state.cancel(sessionID)
    })

    /**
     * Epistemic completion gate — the production verified-completion path.
     *
     * Runs when the assistant finishes naturally (top-of-loop break) and when
     * the processor reports a terminal stop. It emits completion.attempted,
     * resolves pending REQUIRED obligations from durable evidence, and only
     * emits completion.resolved VERIFIED_COMPLETE (resolving the contract and
     * revoking its intent bindings) when nothing required remains unresolved.
     * A session that already reached a terminal completion decision is never
     * resolved twice (durable idempotency via completion.resolved events).
     */
    const epistemicCompletionGate = Effect.fn("SessionPrompt.epistemicCompletionGate")(
      function* (input: { sessionID: SessionID; step: number; messageID: string }) {
        const activeContract = yield* db
          .select({ id: ContractTable.id, revision: ContractTable.revision })
          .from(ContractTable)
          .where(
            and(
              eq(ContractTable.session_id, input.sessionID),
              eq(ContractTable.status, "active"),
            ),
          )
          .limit(1)
          .pipe(
            Effect.provideService(Database.Service, database),
            Effect.orElseSucceed(() => []),
          )
        const alreadyResolved = yield* eventStore.listType(input.sessionID, "completion.resolved")
        // Idempotency is PER CONTRACT, not per session: a new active contract
        // must still run the gate even when an older contract in this session
        // was already resolved. Without this, the second+ contract's
        // obligations stayed pending forever after the first VERIFIED_COMPLETE.
        if (activeContract.length > 0) {
          const contractId = activeContract[0].id
          if (contractCompletionAlreadyResolved(alreadyResolved, contractId)) {
            return true
          }
        } else if (alreadyResolved.length > 0) {
          return true
        }

        yield* eventStore.append({
          sessionId: input.sessionID,
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.attempted",
          payload: { step: input.step, messageID: input.messageID },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

        if (activeContract.length > 0) {
          // Production verifier: resolve pending required obligations from
          // durable governance evidence before evaluating the gate.
          yield* CompletionVerifier.resolveObligationsFromEvidence({
            sessionId: input.sessionID,
            contractId: activeContract[0].id,
            obligations,
            eventStore,
          }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
          const unresolved = yield* db
            .select({ id: ObligationTable.id })
            .from(ObligationTable)
            .where(
              and(
                eq(ObligationTable.contract_id, activeContract[0].id),
                eq(ObligationTable.required, 1),
                ne(ObligationTable.status, "satisfied"),
              ),
            )
            .pipe(
              Effect.provideService(Database.Service, database),
              Effect.orElseSucceed(() => []),
            )
          if (unresolved.length > 0) {
            yield* Effect.logWarning("completion gate: blocked", {
              sessionID: input.sessionID,
              contractId: activeContract[0].id,
              unresolvedCount: unresolved.length,
            })
            return false
          }
          // Mark the contract resolved so RunProof P3 sees a terminal contract
          // status, then emit verified completion evidence.
          yield* contracts
            .resolve(activeContract[0].id, {
              state: "VERIFIED_COMPLETE",
              reason: "All required obligations satisfied by durable evidence",
              unresolved: [],
            })
            .pipe(Effect.catch(() => Effect.void), Effect.ignore)
          yield* eventStore.append({
            sessionId: input.sessionID,
            actor: { kind: "policy", id: "completion-gate" },
            type: "completion.resolved",
            payload: { contractId: activeContract[0].id, method: "VERIFIED_COMPLETE" },
          }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
          // The contract is resolved: no further consequential work may be
          // grounded on its intent bindings. Revoke the durable ACTIVE rows
          // and record intent.binding_revoked so the governance projection
          // reflects the lifecycle, not just the SQL read filter.
          yield* IntentRuntime.revokeBindingsForContract({
            sessionId: input.sessionID,
            contractId: activeContract[0].id,
            contractRevision: String(activeContract[0].revision ?? 1),
            store: new SqliteIntentBindingStore(database),
            eventStore,
          }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
          // Revoke the session's ACTIVE capability grants so no authority
          // survives the completed objective. A resumed session with a new
          // objective bootstraps fresh grants on its next tool admission.
          const grantStore = new SqliteGrantStore(database)
          const sessionGrants = yield* grantStore
            .getActiveGrantsForSession(input.sessionID)
            .pipe(Effect.catch(() => Effect.succeed([] as const)))
          for (const grant of sessionGrants) {
            const revoked = yield* grantStore
              .revokeGrant(grant.id, `evt-capability-revoked:${grant.id}`)
              .pipe(Effect.catch(() => Effect.succeed(false)))
            if (!revoked) continue
            yield* eventStore.append({
              sessionId: input.sessionID,
              actor: { kind: "policy", id: "completion-gate" },
              type: "capability.revoked",
              payload: {
                capabilityId: grant.id,
                principal: grant.principal,
                reason: "CONTRACT_RESOLVED",
              },
            }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
          }
          return true
        }
        // No active contract: free completion (contractless / declined / old
        // sessions). Explicitly recorded so the projection is not silent.
        yield* eventStore.append({
          sessionId: input.sessionID,
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "NO_ACTIVE_CONTRACT" },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
        return true
      },
    )

    const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
      const ctx = yield* InstanceState.context
      const parts: Types.DeepMutable<PromptInput["parts"]> = [{ type: "text", text: template }]
      const files = ConfigMarkdown.files(template)
      const seen = new Set<string>()
      yield* Effect.forEach(
        files,
        Effect.fnUntraced(function* (match) {
          const name = match[1]
          if (!name) return
          if (seen.has(name)) return
          seen.add(name)

          const filepath = name.startsWith("~/")
            ? path.join(os.homedir(), name.slice(2))
            : path.resolve(ctx.worktree, name)

          const info = yield* fsys.stat(filepath).pipe(Effect.option)
          if (Option.isNone(info)) {
            const found = yield* agents.get(name)
            if (found) parts.push({ type: "agent", name: found.name })
            return
          }
          const stat = info.value
          parts.push({
            type: "file",
            url: pathToFileURL(filepath).href,
            filename: name,
            mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
          })
        }),
        { concurrency: "unbounded", discard: true },
      )
      return parts
    })

    const isRealUser = (m: SessionV1.WithParts) =>
      m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic)

    const firstRealUserIndex = (history: SessionV1.WithParts[]) => history.findIndex(isRealUser)

    const textFromUserParts = (parts: SessionV1.WithParts["parts"]) => {
      const chunks: string[] = []
      for (const p of parts) {
        if (p.type === "text" && !("synthetic" in p && p.synthetic) && typeof p.text === "string") {
          chunks.push(p.text)
        }
        if (p.type === "subtask" && "prompt" in p && typeof p.prompt === "string") {
          chunks.push(p.prompt)
        }
      }
      return chunks.join("\n")
    }

    /**
     * Instant title from first real user text while the session still has a default
     * "New session - <ISO>" name. Does not call the model (works under rate limits).
     * Never overwrites a custom or previously set title.
     */
    const ensureHeuristicTitle = Effect.fn("SessionPrompt.ensureHeuristicTitle")(function* (input: {
      session: Session.Info
      history: SessionV1.WithParts[]
    }) {
      if (!Session.isDefaultTitle(input.session.title)) return

      const idx = firstRealUserIndex(input.history)
      if (idx === -1) return
      const firstUser = input.history[idx]
      if (!firstUser || firstUser.info.role !== "user") return

      const raw = textFromUserParts(firstUser.parts)
      const heuristic = Session.titleFromUserText(raw)
      if (!heuristic) return

      // Re-check default in case of concurrent rename.
      const current = yield* sessions.get(input.session.id).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!current || !Session.isDefaultTitle(current.title)) return

      yield* sessions
        .setTitle({ sessionID: input.session.id, title: heuristic })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logError("failed to set heuristic title", { error: Cause.squash(cause) }),
          ),
        )
    })

    /**
     * LLM title polish — only while still default (e.g. image-only first message,
     * or heuristic produced nothing). Uses the first real user message even if
     * later user messages already exist (fixes abandoned-forever ISO titles).
     */
    const title = Effect.fn("SessionPrompt.ensureTitle")(function* (input: {
      session: Session.Info
      history: SessionV1.WithParts[]
      providerID: ProviderV2.ID
      modelID: ModelV2.ID
    }) {
      if (input.session.parentID) return
      // Fresh read: heuristic may have already named this session.
      const live = yield* sessions.get(input.session.id).pipe(Effect.catch(() => Effect.succeed(input.session)))
      if (!Session.isDefaultTitle(live.title)) return

      const idx = firstRealUserIndex(input.history)
      if (idx === -1) return

      const context = input.history.slice(0, idx + 1)
      const firstUser = context[idx]
      if (!firstUser || firstUser.info.role !== "user") return
      const firstInfo = firstUser.info

      const subtasks = firstUser.parts.filter((p): p is SessionV1.SubtaskPart => p.type === "subtask")
      const onlySubtasks = subtasks.length > 0 && firstUser.parts.every((p) => p.type === "subtask")

      const ag = yield* agents.get("title")
      if (!ag) return
      const mdl = ag.model
        ? yield* provider.getModel(ag.model.providerID, ag.model.modelID).pipe(
            Effect.catchTag("ProviderModelNotFoundError", () =>
              provider.getModel(input.providerID, input.modelID)
            ),
          )
        : ((yield* provider.getSmallModel(input.providerID)) ??
          (yield* provider.getModel(input.providerID, input.modelID)))
      const msgs = onlySubtasks
        ? [{ role: "user" as const, content: subtasks.map((p) => p.prompt).join("\n") }]
        : yield* MessageV2.toModelMessagesEffect(context, mdl)
      const text = yield* llm
        .stream({
          agent: ag,
          user: firstInfo,
          system: [],
          small: true,
          tools: {},
          model: mdl,
          sessionID: input.session.id,
          retries: 2,
          messages: [{ role: "user", content: "Generate a title for this conversation:\n" }, ...msgs],
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((e) => e.text),
          Stream.mkString,
          Effect.orDie,
        )
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0)
      if (!cleaned) return
      const t =
        Locale.displayWidth(cleaned) > Session.TITLE_MAX_CHARS
          ? Locale.truncate(cleaned, Session.TITLE_MAX_CHARS)
          : cleaned

      // Never clobber a non-default title that landed while we streamed.
      const after = yield* sessions.get(input.session.id).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!after || !Session.isDefaultTitle(after.title)) return

      yield* sessions
        .setTitle({ sessionID: input.session.id, title: t })
        .pipe(Effect.catchCause((cause) => Effect.logError("failed to generate title", { error: Cause.squash(cause) })))
    })

    const handleSubtask = Effect.fn("SessionPrompt.handleSubtask")(function* (input: {
      task: SessionV1.SubtaskPart
      model: Provider.Model
      lastUser: SessionV1.User
      sessionID: SessionID
      session: Session.Info
      msgs: SessionV1.WithParts[]
    }) {
      const { task, model, lastUser, sessionID, session, msgs } = input
      const ctx = yield* InstanceState.context
      const promptOps = yield* ops()
      const { task: taskTool } = yield* registry.named()
      const taskModel = task.model ? yield* getModel(task.model.providerID, task.model.modelID, sessionID) : model
      const assistantMessage: SessionV1.Assistant = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "assistant",
        parentID: lastUser.id,
        sessionID,
        mode: task.agent,
        agent: task.agent,
        variant: lastUser.model.variant,
        path: { cwd: ctx.directory, root: ctx.worktree },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: taskModel.id,
        providerID: taskModel.providerID,
        time: { created: Date.now() },
      })
      let part: SessionV1.ToolPart = yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistantMessage.id,
        sessionID: assistantMessage.sessionID,
        type: "tool",
        callID: ulid(),
        tool: TaskTool.id,
        state: {
          status: "running",
          input: {
            prompt: task.prompt,
            description: task.description,
            subagent_type: task.agent,
            command: task.command,
          },
          time: { start: Date.now() },
        },
      })
      const taskArgs = {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      }
      yield* plugin.trigger(
        "tool.execute.before",
        { tool: TaskTool.id, sessionID, callID: part.id },
        { args: taskArgs },
      )

      const taskAgent = yield* agents.get(task.agent)
      if (!taskAgent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${task.agent}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
        throw error
      }

      let error: Error | undefined
      const taskAbort = new AbortController()
      const result = yield* taskTool
        .execute(taskArgs, {
          agent: task.agent,
          messageID: assistantMessage.id,
          sessionID,
          abort: taskAbort.signal,
          callID: part.callID,
          extra: { bypassAgentCheck: true, promptOps },
          messages: msgs,
          metadata: (val: { title?: string; metadata?: Record<string, any>; output?: string }) =>
            Effect.gen(function* () {
              part = yield* sessions.updatePart({
                ...part,
                type: "tool",
                state: { ...part.state, ...val },
              } satisfies SessionV1.ToolPart)
            }),
          ask: (req: any) =>
            permission
              .ask({
                ...req,
                sessionID,
                ruleset: Permission.merge(taskAgent.permission, session.permission ?? []),
              })
              .pipe(Effect.orDie),
        })
        .pipe(
          Effect.catchCause((cause) => {
            const defect = Cause.squash(cause)
            error = defect instanceof Error ? defect : new Error(String(defect))
            return Effect.logError("subtask execution failed", {
              error,
              agent: task.agent,
              description: task.description,
            })
          }),
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              taskAbort.abort()
              assistantMessage.finish = "tool-calls"
              assistantMessage.time.completed = Date.now()
              yield* sessions.updateMessage(assistantMessage)
              if (part.state.status === "running") {
                yield* sessions.updatePart({
                  ...part,
                  state: {
                    status: "error",
                    error: "Cancelled",
                    time: { start: part.state.time.start, end: Date.now() },
                    metadata: part.state.metadata,
                    input: part.state.input,
                  },
                } satisfies SessionV1.ToolPart)
              }
            }),
          ),
        )

      const attachments = result?.attachments?.map((attachment) => ({
        ...attachment,
        id: PartID.ascending(),
        sessionID,
        messageID: assistantMessage.id,
      }))

      yield* plugin.trigger(
        "tool.execute.after",
        { tool: TaskTool.id, sessionID, callID: part.id, args: taskArgs },
        result,
      )

      assistantMessage.finish = "tool-calls"
      assistantMessage.time.completed = Date.now()
      yield* sessions.updateMessage(assistantMessage)

      if (result && part.state.status === "running") {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "completed",
            input: part.state.input,
            title: result.title,
            metadata: result.metadata,
            output: result.output,
            attachments,
            time: { ...part.state.time, end: Date.now() },
          },
        } satisfies SessionV1.ToolPart)
      }

      if (!result) {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "error",
            error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
            time: {
              start: part.state.status === "running" ? part.state.time.start : Date.now(),
              end: Date.now(),
            },
            metadata: part.state.status === "pending" ? undefined : part.state.metadata,
            input: part.state.input,
          },
        } satisfies SessionV1.ToolPart)
      }

      if (!task.command) return

      const summaryUserMsg: SessionV1.User = {
        id: MessageID.ascending(),
        sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: lastUser.agent,
        model: lastUser.model,
      }
      yield* sessions.updateMessage(summaryUserMsg)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: summaryUserMsg.id,
        sessionID,
        type: "text",
        text: "Summarize the task tool output above and continue with your task.",
        synthetic: true,
      } satisfies SessionV1.TextPart)
    })

    const shellImpl = Effect.fn("SessionPrompt.shellImpl")(function* (input: ShellInput, ready?: Latch.Latch) {
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void
          const { msg, part, cwd } = yield* Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
            if (session.revert) {
              yield* revert.cleanup(session)
            }
            const agent = yield* agents.get(input.agent)
            if (!agent) {
              const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
              const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
              const error = new NamedError.Unknown({ message: `Agent not found: "${input.agent}".${hint}` })
              yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
              throw error
            }
            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))
            const userMsg: SessionV1.User = {
              id: input.messageID ?? MessageID.ascending(),
              sessionID: input.sessionID,
              time: { created: Date.now() },
              role: "user",
              agent: input.agent,
              model: { providerID: model.providerID, modelID: model.modelID },
            }
            yield* sessions.updateMessage(userMsg)
            const userPart: SessionV1.Part = {
              type: "text",
              id: PartID.ascending(),
              messageID: userMsg.id,
              sessionID: input.sessionID,
              text: "The following tool was executed by the user",
              synthetic: true,
            }
            yield* sessions.updatePart(userPart)

            const msg: SessionV1.Assistant = {
              id: MessageID.ascending(),
              sessionID: input.sessionID,
              parentID: userMsg.id,
              mode: input.agent,
              agent: input.agent,
              cost: 0,
              path: { cwd: ctx.directory, root: ctx.worktree },
              time: { created: Date.now() },
              role: "assistant",
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: model.modelID,
              providerID: model.providerID,
            }
            yield* sessions.updateMessage(msg)
            const started = Date.now()
            const part: SessionV1.ToolPart = {
              type: "tool",
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: input.sessionID,
              tool: ShellID.ToolID,
              callID: ulid(),
              state: {
                status: "running",
                time: { start: started },
                input: { command: input.command },
              },
            }
            yield* sessions.updatePart(part)
            if (flags.experimentalEventSystem) {
              yield* events.publish(SessionEvent.Shell.Started, {
                sessionID: input.sessionID,
                messageID: SessionMessage.ID.create(),
                timestamp: DateTime.makeUnsafe(started),
                callID: part.callID,
                command: input.command,
              })
            }
            return { msg, part, cwd: ctx.directory }
          }).pipe(Effect.ensuring(markReady))

          const cfg = yield* config.get()
          const sh = Shell.preferred(cfg.shell)
          const args = Shell.args(sh, input.command, cwd)
          let output = ""
          let aborted = false

          const finish = Effect.uninterruptible(
            Effect.gen(function* () {
              if (aborted) {
                output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
              }
              const completed = Date.now()
              if (flags.experimentalEventSystem) {
                yield* events.publish(SessionEvent.Shell.Ended, {
                  sessionID: input.sessionID,
                  timestamp: DateTime.makeUnsafe(completed),
                  callID: part.callID,
                  output,
                })
              }
              if (!msg.time.completed) {
                msg.time.completed = completed
                yield* sessions.updateMessage(msg)
              }
              if (part.state.status === "running") {
                part.state = {
                  status: "completed",
                  time: { ...part.state.time, end: completed },
                  input: part.state.input,
                  title: "",
                  metadata: { output, description: "" },
                  output,
                }
                yield* sessions.updatePart(part)
              }
            }),
          )

          const exit = yield* restore(
            Effect.gen(function* () {
              const shellEnv = yield* plugin.trigger(
                "shell.env",
                { cwd, sessionID: input.sessionID, callID: part.callID },
                { env: {} },
              )
              const cmd = ChildProcess.make(sh, args, {
                cwd,
                extendEnv: true,
                env: { ...shellEnv.env, TERM: "dumb" },
                stdin: "ignore",
                forceKillAfter: "3 seconds",
              })
              const handle = yield* spawner.spawn(cmd)
              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
                Effect.gen(function* () {
                  output += chunk
                  if (part.state.status === "running") {
                    part.state.metadata = { output, description: "" }
                    yield* sessions.updatePart(part)
                  }
                }),
              )
              yield* handle.exitCode
            }).pipe(Effect.scoped, Effect.orDie),
          ).pipe(Effect.exit)

          if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause)) {
            aborted = true
          }
          yield* finish

          if (Exit.isFailure(exit) && !aborted && !Cause.hasInterruptsOnly(exit.cause)) {
            return yield* Effect.failCause(exit.cause)
          }

          return { info: msg, parts: [part] }
        }),
      )
    })

    const getModel = Effect.fn("SessionPrompt.getModel")(function* (
      providerID: ProviderV2.ID,
      modelID: ModelV2.ID,
      sessionID: SessionID,
    ) {
      const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value
      const err = Cause.squash(exit.cause)
      if (Provider.ModelNotFoundError.isInstance(err)) {
        const hint = err.suggestions?.length ? ` Did you mean: ${err.suggestions.join(", ")}?` : ""
        yield* events.publish(Session.Event.Error, {
          sessionID,
          error: new NamedError.Unknown({
            message: `Model not found: ${err.providerID}/${err.modelID}.${hint}`,
          }).toObject(),
        })
      }
      return yield* Effect.die(err)
    })

    const currentModel = Effect.fnUntraced(function* (sessionID: SessionID) {
      const current = yield* db
        .select({ model: SessionTable.model })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (current?.model) {
        return {
          providerID: ProviderV2.ID.make(current.model.providerID),
          modelID: ModelV2.ID.make(current.model.id),
          ...(current.model.variant && current.model.variant !== "default" ? { variant: current.model.variant } : {}),
        }
      }
      const match = yield* sessions
        .findMessage(sessionID, (m) => m.info.role === "user" && !!m.info.model)
        .pipe(Effect.orDie)
      if (Option.isSome(match) && match.value.info.role === "user") return match.value.info.model
      return yield* provider.defaultModel().pipe(Effect.orDie)
    })

    const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (input: PromptInput) {
      const agentName = input.agent
      const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!ag) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const current = yield* db
        .select({ agent: SessionTable.agent, model: SessionTable.model })
        .from(SessionTable)
        .where(eq(SessionTable.id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))
      const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
      const full =
        !input.variant && ag.variant && same
          ? yield* provider
              .getModel(model.providerID, model.modelID)
              .pipe(Effect.catchIf(Provider.ModelNotFoundError.isInstance, () => Effect.succeed(undefined)))
          : undefined
      const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)

      const info: SessionV1.User = {
        id: input.messageID ?? MessageID.ascending(),
        role: "user",
        sessionID: input.sessionID,
        time: { created: Date.now() },
        tools: input.tools,
        agent: ag.name,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
          variant,
        },
        system: input.system,
        format: input.format,
      }

      if (current?.agent !== info.agent) {
        yield* events.publish(SessionEvent.AgentSwitched, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: DateTime.makeUnsafe(info.time.created),
          agent: info.agent,
        })
      }
      if (
        current?.model?.providerID !== info.model.providerID ||
        current.model.id !== info.model.modelID ||
        (current.model.variant === "default" ? undefined : current.model.variant) !== info.model.variant
      ) {
        yield* events.publish(SessionEvent.ModelSwitched, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: DateTime.makeUnsafe(info.time.created),
          model: {
            id: ModelV2.ID.make(info.model.modelID),
            providerID: ProviderV2.ID.make(info.model.providerID),
            variant: ModelV2.VariantID.make(info.model.variant ?? "default"),
          },
        })
      }

      yield* Effect.addFinalizer(() => instruction.clear(info.id))

      type Draft<T> = T extends SessionV1.Part ? Omit<T, "id"> & { id?: string } : never
      const assign = (part: Draft<SessionV1.Part>): SessionV1.Part => ({
        ...part,
        id: part.id ? PartID.make(part.id) : PartID.ascending(),
      })

      const resolvePart: (part: PromptInput["parts"][number]) => Effect.Effect<Draft<SessionV1.Part>[]> = Effect.fn(
        "SessionPrompt.resolveUserPart",
      )(function* (part) {
        if (part.type === "file") {
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            yield* Effect.logInfo("mcp resource", { clientName, uri, mime: part.mime })
            const pieces: Draft<SessionV1.Part>[] = [
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]
            const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)
            if (Exit.isSuccess(exit)) {
              const content = exit.value
              if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)
              const items = Array.isArray(content.contents) ? content.contents : [content.contents]
              for (const c of items) {
                if ("text" in c && c.text) {
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: c.text,
                  })
                } else if ("blob" in c && c.blob) {
                  const mime = "mimeType" in c ? c.mimeType : part.mime
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary content: ${mime}]`,
                  })
                }
              }
              pieces.push({ ...part, messageID: info.id, sessionID: input.sessionID })
            } else {
              const error = Cause.squash(exit.cause)
              yield* Effect.logError("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }
            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: decodeDataUrl(part.url),
                  },
                  { ...part, messageID: info.id, sessionID: input.sessionID },
                ]
              }
              break
            case "file:": {
              yield* Effect.logInfo("file", { mime: part.mime })
              const filepath = fileURLToPath(part.url)
              const mime = (yield* fsys.isDir(filepath)) ? "application/x-directory" : part.mime

              const { read } = yield* registry.named()
              const execRead = (args: Parameters<typeof read.execute>[0], extra?: Tool.Context["extra"]) => {
                const controller = new AbortController()
                return read
                  .execute(args, {
                    sessionID: input.sessionID,
                    abort: controller.signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true, ...extra },
                    messages: [],
                    metadata: () => Effect.void,
                    ask: () => Effect.void,
                  })
                  .pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())))
              }

              if (mime === "text/plain") {
                let offset: number | undefined
                let limit: number | undefined
                const range = { start: url.searchParams.get("start"), end: url.searchParams.get("end") }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  if (start === end) {
                    const symbols = yield* lsp.documentSymbol(filePathURI).pipe(Effect.catch(() => Effect.succeed([])))
                    for (const symbol of symbols) {
                      let r: LSP.Range | undefined
                      if ("range" in symbol) r = symbol.range
                      else if ("location" in symbol) r = symbol.location.range
                      if (r?.start?.line && r?.start?.line === start) {
                        start = r.start.line
                        end = r?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start, 1)
                  if (end) limit = end - (offset - 1)
                }
                const args = { filePath: filepath, offset, limit }
                const pieces: Draft<SessionV1.Part>[] = [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]
                const exit = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(
                  Effect.flatMap((mdl) => execRead(args, { model: mdl })),
                  Effect.exit,
                )
                if (Exit.isSuccess(exit)) {
                  const result = exit.value
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  })
                  if (result.attachments?.length) {
                    pieces.push(
                      ...result.attachments.map((a) => ({
                        ...a,
                        synthetic: true,
                        filename: a.filename ?? part.filename,
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })),
                    )
                  } else {
                    pieces.push({ ...part, mime, messageID: info.id, sessionID: input.sessionID })
                  }
                } else {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read file", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* events.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                  })
                }
                return pieces
              }

              if (mime === "application/x-directory") {
                const args = { filePath: filepath }
                const exit = yield* execRead(args).pipe(Effect.exit)
                if (Exit.isFailure(exit)) {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read directory", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* events.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  return [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    },
                  ]
                }
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: exit.value.output,
                  },
                  { ...part, mime, messageID: info.id, sessionID: input.sessionID },
                ]
              }

              return [
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                },
                {
                  id: part.id,
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url:
                    `data:${mime};base64,` +
                    Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString("base64"),
                  mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
            }
          }
        }

        if (part.type === "agent") {
          const perm = Permission.evaluate("task", part.name, ag.permission)
          const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            { ...part, messageID: info.id, sessionID: input.sessionID },
            {
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
                hint,
            },
          ]
        }

        return [{ ...part, messageID: info.id, sessionID: input.sessionID }]
      })

      const resolvedParts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" }).pipe(
        Effect.map((x) => x.flat().map(assign)),
      )

      yield* plugin.trigger(
        "chat.message",
        {
          sessionID: input.sessionID,
          agent: input.agent,
          model: input.model,
          messageID: input.messageID,
          variant: input.variant,
        },
        { message: info, parts: resolvedParts },
      )

      const parts = yield* Effect.forEach(resolvedParts, (part) =>
        part.type === "file" && part.mime.startsWith("image/")
          ? image.normalize(part).pipe(
              Effect.catchIf(
                (error) => error instanceof Image.ResizerUnavailableError,
                () => Effect.succeed(part),
              ),
            )
          : Effect.succeed(part),
      )

      const parsed = decodeMessageInfo(info, { errors: "all", propertyOrder: "original" })
      if (Exit.isFailure(parsed)) {
        yield* Effect.logError("invalid user message before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          agent: info.agent,
          model: info.model,
          cause: Cause.pretty(parsed.cause),
        })
      }
      for (const [index, part] of parts.entries()) {
        const p = decodeMessagePart(part, { errors: "all", propertyOrder: "original" })
        if (Exit.isSuccess(p)) continue
        yield* Effect.logError("invalid user part before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          partID: part.id,
          partType: part.type,
          index,
          cause: Cause.pretty(p.cause),
          part,
        })
      }

      yield* sessions.updateMessage(info)
      for (const part of parts) yield* sessions.updatePart(part)
      const nextPrompt = parts.reduce(
        (result, part) => {
          if (part.type === "text") {
            if (part.synthetic) result.synthetic.push(part.text)
            else result.text.push(part.text)
          }
          if (part.type === "file") {
            result.files.push(
              new FileAttachment({
                uri: part.url,
                mime: part.mime,
                name: part.filename,
                source: part.source
                  ? new Source({
                      start: part.source.text.start,
                      end: part.source.text.end,
                      text: part.source.text.value,
                    })
                  : undefined,
              }),
            )
          }
          if (part.type === "agent") {
            result.agents.push(
              new AgentAttachment({
                name: part.name,
                source: part.source
                  ? new Source({
                      start: part.source.start,
                      end: part.source.end,
                      text: part.source.value,
                    })
                  : undefined,
              }),
            )
          }
          return result
        },
        {
          text: [] as string[],
          files: [] as FileAttachment[],
          agents: [] as AgentAttachment[],
          synthetic: [] as string[],
        },
      )
      // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
      if (flags.experimentalEventSystem) {
        yield* events.publish(SessionEvent.Prompted, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: DateTime.makeUnsafe(info.time.created),
          delivery: "steer",
          prompt: new Prompt({
            text: nextPrompt.text.join("\n"),
            files: nextPrompt.files,
            agents: nextPrompt.agents,
          }),
        })
      }
      for (const text of nextPrompt.synthetic) {
        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
        if (flags.experimentalEventSystem) {
          yield* events.publish(SessionEvent.Synthetic, {
            sessionID: input.sessionID,
            messageID: SessionMessage.ID.create(),
            timestamp: DateTime.makeUnsafe(info.time.created),
            text,
          })
        }
      }

      return { info, parts }
    }, Effect.scoped)

    const prompt: (input: PromptInput) => Effect.Effect<SessionV1.WithParts, Image.Error> = Effect.fn(
      "SessionPrompt.prompt",
    )(function* (input: PromptInput) {
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      yield* revert.cleanup(session)
      const message = yield* createUserMessage(input)
      yield* sessions.touch(input.sessionID)

      // Title the session from the first user text as soon as the message is
      // durable, so it never stays on the default "New session - <ISO>". The
      // run loop re-checks at step 1, but a loop that dies before that (model
      // failure, rate limit, noReply) would otherwise leave the session
      // untitled. Guarded by isDefaultTitle + a store re-read inside
      // ensureHeuristicTitle: a custom title that landed concurrently is never
      // clobbered, and non-default-titled sessions are untouched.
      yield* ensureHeuristicTitle({ session, history: [message] }).pipe(Effect.ignore)

      const permissions: PermissionV1.Rule[] = []
      for (const [t, enabled] of Object.entries(input.tools ?? {})) {
        permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
      }
      if (permissions.length > 0) {
        session.permission = permissions
        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })
      }

      if (input.noReply === true) return message
      return yield* loop({ sessionID: input.sessionID })
    })

    const lastAssistant = Effect.fnUntraced(function* (sessionID: SessionID) {
      const match = yield* sessions.findMessage(sessionID, (m) => m.info.role !== "user").pipe(Effect.orDie)
      if (Option.isSome(match)) return match.value
      const msgs = yield* sessions.messages({ sessionID, limit: 1 }).pipe(Effect.orDie)
      if (msgs.length > 0) return msgs[0]
      throw new Error("Impossible")
    })

    const runLoop = Effect.fn("SessionPrompt.run")(
      function* (sessionID: SessionID) {
        const ctx = yield* InstanceState.context
        let structured: unknown
        let step = 0
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
        // Fresh concurrent occupancy for this run; wakes any parked tool waiters.
        yield* budget.reset(sessionID)

        // Emit session.started event
        yield* eventStore.append({
          sessionId: sessionID,
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: { agent: session.agent, model: session.model },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

        while (true) {
          yield* status.set(sessionID, { type: "busy" })
          yield* Effect.logInfo("loop", { "session.id": sessionID, step })

          let msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
            Effect.provideService(Database.Service, database),
          )

          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)

          if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

          const lastAssistantMsg = msgs.findLast(
            (msg) => msg.info.role === "assistant" && msg.info.id === lastAssistant?.id,
          )
          // Some providers return "stop" even when the assistant message contains
          // tool calls. Keep the loop running so tool results can be sent back to
          // the model, but ignore cleanup-marked interrupted orphans.
          const hasToolCalls =
            lastAssistantMsg?.parts.some(
              (part) => part.type === "tool" && !part.metadata?.providerExecuted && !isOrphanedInterruptedTool(part),
            ) ?? false

          // Exit only when the most recent message in the stream is this
          // terminal assistant. Id comparison across roles is unreliable:
          // clients may supply arbitrary ids (e.g. TUI UUIDs) that sort after
          // the engine's time-based ids. msgs is chronological unless
          // compaction reordered it, in which case it ends on a user message.
          const lastMsg = msgs[msgs.length - 1]
          if (
            lastAssistant?.finish &&
            !["tool-calls"].includes(lastAssistant.finish) &&
            !hasToolCalls &&
            lastMsg?.info.role === "assistant" &&
            lastMsg.info.id === lastAssistant.id
          ) {
            const orphan = lastAssistantMsg?.parts.find(
              (part): part is SessionV1.ToolPart => part.type === "tool" && isOrphanedInterruptedTool(part),
            )
            if (orphan) {
              yield* Effect.logWarning("loop exit with orphaned interrupted tool", {
                "session.id": sessionID,
                messageID: lastAssistant.id,
                tool: orphan.tool,
                callID: orphan.callID,
              })
            }
            // Natural finish: the assistant stopped without pending tool calls.
            // Run the epistemic completion gate so verified completion is
            // evidence-gated; the loop exits either way.
            yield* epistemicCompletionGate({
              sessionID,
              step,
              messageID: lastAssistant.id,
            }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
            yield* Effect.logInfo("exiting loop", { "session.id": sessionID })
            break
          }

          step++
          // No engine-side wall-clock/counter budget gate here: credit enforcement is
          // owned by the arcana proxy, which returns 402 insufficient_balance / 429
          // daily_limit_reached when the account is out of credits. That error is
          // shaped into a friendly non-retryable stop in MessageV2.fromError, which
          // breaks this loop cleanly. See packages/engine/src/session/message-v2.ts.
          if (step === 1) {
            // Instant name from first user text (no model) so the session list
            // never stays on "New session - <ISO>" under rate limits.
            yield* ensureHeuristicTitle({ session, history: msgs }).pipe(Effect.ignore)
            // LLM polish only if still default (e.g. image-only / empty text).
            // Uses first real user message even when later turns already exist.
            yield* title({
              session,
              modelID: lastUser.model.modelID,
              providerID: lastUser.model.providerID,
              history: msgs,
            }).pipe(Effect.ignore, Effect.forkIn(scope))

            // P3 inter preflight: before first sample of a new user turn, compact if
            // context is still hot (with hysteresis) so the model never starts over limit.
            if (lastFinished && lastFinished.summary !== true) {
              const didInter = yield* compaction
                .maybeInter({
                  sessionID,
                  agent: lastUser.agent,
                  model: lastUser.model,
                  tokens: lastFinished.tokens,
                  reason: "preflight",
                })
                .pipe(Effect.catch(() => Effect.succeed(false)))
              if (didInter) {
                msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
                  Effect.provideService(Database.Service, database),
                )
              }
            }
          }

          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
          const task = tasks.pop()

          // ── Production contract admission ─────────────────────────
          // Primary sessions propose and activate an exact completion
          // contract before consequential work. Declined sessions keep the
          // explicit LEGACY_COMPAT fallback (visible as degraded); subagent
          // and compaction turns never ask.
          if (
            step === 1
            && !session.parentID
            && task?.type !== "subtask"
            && task?.type !== "compaction"
            && lastUser.format?.type !== "json_schema"
          ) {
            yield* ContractAdmission.ensureContractAdmission(
              {
                hasActiveContract: (sessionID) =>
                  database.db
                    .get<{ id: string }>(
                      sql`SELECT id FROM contracts
                          WHERE session_id = ${sessionID} AND status = 'active'
                          LIMIT 1`,
                    )
                    .pipe(
                      Effect.map((row) => row !== undefined),
                      Effect.catch(() => Effect.succeed(false)),
                    ),
                wasDeclined: () =>
                  Effect.sync(() => {
                    const meta = session.metadata as Record<string, unknown> | undefined
                    return meta?.["__arcana_contract_declined"] === "1"
                  }),
                propose: (admission) =>
                  contracts
                    .propose({
                      sessionId: admission.sessionID,
                      userRequest: admission.userRequest,
                      sourceEventId: admission.sourceEventId,
                      model: admission.model,
                    })
                    .pipe(
                      Effect.map((contract) => ({
                        id: contract.id,
                        objective: contract.objective,
                        revision: contract.revision,
                        criteria: contract.acceptanceCriteria.map(
                          (criterion) => criterion.description,
                        ),
                      })),
                    ),
                ask: (sessionID, contract) =>
                  permission
                    .ask({
                      sessionID,
                      permission: "contract.accept",
                      patterns: [sessionID],
                      metadata: {
                        kind: "contract_admission",
                        contractId: contract.id,
                        objective: contract.objective,
                        revision: String(contract.revision),
                        criteria: contract.criteria.slice(0, 3),
                      },
                      always: [],
                      // Honor the session's permission rules: allow-all
                      // sessions auto-accept admission, default sessions are
                      // asked, deny rules decline into LEGACY_COMPAT.
                      ruleset: session.permission ?? [],
                    })
                    .pipe(
                      // Permission reply (allow) = accept; deny/reject/dismiss = decline.
                      Effect.as(true),
                      Effect.catch(() => Effect.succeed(false)),
                    ),
                activate: (contractId) => contracts.activate(contractId),
                markDeclined: (sessionID) =>
                  sessions
                    .setMetadata({
                      sessionID,
                      metadata: {
                        ...(session.metadata ?? {}),
                        __arcana_contract_declined: "1",
                      },
                    })
                    .pipe(Effect.catch(() => Effect.void)),
              },
              {
                sessionID,
                userRequest: textFromUserParts(
                  msgs.findLast((m) => m.info.role === "user")?.parts ?? [],
                ),
                sourceEventId: lastUser.id,
                model: lastUser.model?.modelID,
              },
            ).pipe(Effect.catch(() => Effect.void), Effect.ignore)
          }

          if (task?.type === "subtask") {
            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })
            continue
          }

          if (task?.type === "compaction") {
            const result = yield* compaction.process({
              messages: msgs,
              parentID: lastUser.id,
              sessionID,
              auto: task.auto,
              overflow: task.overflow,
            })
            if (result === "stop") break
            continue
          }

          // P4 intra: mid multi-step loop compact (gated by steps/tokens/hysteresis).
          // Still uses create → next iteration process (same user turn).
          if (lastFinished && lastFinished.summary !== true) {
            const scheduled = yield* compaction
              .maybeIntra({
                sessionID,
                agent: lastUser.agent,
                model: lastUser.model,
                tokens: lastFinished.tokens,
                step,
              })
              .pipe(Effect.catch(() => Effect.succeed(false)))
            if (scheduled) continue
          }

          const agent = yield* agents.get(lastUser.agent)
          if (!agent) {
            const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
            const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
            const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
            yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
            throw error
          }
          const maxSteps = agent.steps ?? Infinity
          const isLastStep = step >= maxSteps
          // Persist a metadata flag so the next runLoop can detect this was a max-steps stop.
          if (isLastStep) {
            session.metadata = { ...session.metadata, __arcana_max_steps_hit: true }
            yield* sessions.setMetadata({ sessionID, metadata: session.metadata })
          }
          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(
            Effect.provideService(RuntimeFlags.Service, flags),
            Effect.provideService(FSUtil.Service, fsys),
            Effect.provideService(Session.Service, sessions),
          )

          const msg: SessionV1.Assistant = {
            id: MessageID.ascending(),
            parentID: lastUser.id,
            role: "assistant",
            mode: agent.name,
            agent: agent.name,
            variant: lastUser.model.variant,
            path: { cwd: ctx.directory, root: ctx.worktree },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: model.id,
            providerID: model.providerID,
            time: { created: Date.now() },
            sessionID,
          }
          yield* sessions.updateMessage(msg)

          const finalizeInterruptedAssistant = Effect.gen(function* () {
            if (msg.time.completed) return
            msg.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), {
              providerID: msg.providerID,
              aborted: true,
            })
            msg.time.completed = Date.now()
            yield* sessions.updateMessage(msg)
          })

          const handle = yield* processor
            .create({
              assistantMessage: msg,
              sessionID,
              model,
            })
            .pipe(Effect.onInterrupt(() => finalizeInterruptedAssistant))

          const outcome: "break" | "continue" = yield* Effect.gen(function* () {
            const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
            const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false
            const promptOps = yield* ops()

            const tools = yield* SessionTools.resolve({
              agent,
              session,
              model,
              processor: handle,
              bypassAgentCheck,
              messages: msgs,
              promptOps,
            }).pipe(
              Effect.provideService(Plugin.Service, plugin),
              Effect.provideService(Permission.Service, permission),
              Effect.provideService(ToolRegistry.Service, registry),
              Effect.provideService(MCP.Service, mcp),
              Effect.provideService(Truncate.Service, truncate),
              Effect.provideService(SessionBudget.Service, budget),
            )

            if (lastUser.format?.type === "json_schema") {
              tools["StructuredOutput"] = createStructuredOutputTool({
                schema: lastUser.format.schema,
                onSuccess(output) {
                  structured = output
                },
              })
            }

            if (step === 1)
              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))

            if (step > 1 && lastFinished) {
              for (const m of msgs) {
                if (m.info.role !== "user" || m.info.id <= lastFinished.id) continue
                for (const p of m.parts) {
                  if (p.type !== "text" || p.ignored || p.synthetic) continue
                  if (!p.text.trim()) continue
                  p.text = [
                    "<system-reminder>",
                    "The user sent the following message:",
                    p.text,
                    "",
                    "Please address this message and continue with your tasks.",
                    "</system-reminder>",
                  ].join("\n")
                }
              }
            }

            yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

            const [skills, env, instructions, modelMsgs, memory] = yield* Effect.all([
              sys.skills(agent),
              sys.environment(model),
              instruction.system().pipe(Effect.orDie),
              MessageV2.toModelMessagesEffect(msgs, model),
              sys.memory(),
            ])
            // Active goal inject (every turn) — session + actor agent labels.
            const goalBlock = formatActiveGoalBlock({
              sessionID,
              sessionAgent: lastUser.agent,
              actorAgent: agent.name,
              actorRole: agent.mode === "subagent" ? "subagent" : "primary",
            })
            const system = [
              ...env,
              ...instructions,
              ...(skills ? [skills] : []),
              ...(memory ? [memory] : []),
              goalBlock,
            ]

            // Detect step-limit continuation: check for the metadata flag set when max steps was hit.
            if (step === 1 && lastAssistant?.finish && !["tool-calls"].includes(lastAssistant.finish)) {
              const maxStepsHit = (session.metadata as Record<string, unknown> | undefined)?.["__arcana_max_steps_hit"]
              if (maxStepsHit) {
                // Clear the one-shot flag
                const cleaned = { ...session.metadata }
                delete cleaned["__arcana_max_steps_hit"]
                session.metadata = cleaned
                yield* sessions.setMetadata({ sessionID, metadata: cleaned })
                system.push(
                  "<system-reminder>\n" +
                  "The previous turn ended because the maximum step limit was reached. " +
                  "Tools are now re-enabled. Review the continuation document below to understand " +
                  "what was accomplished and what remains, then continue working. " +
                  "Pick up where you left off — do NOT restart from scratch.\n" +
                  "</system-reminder>",
                )
              }
            }
            const format = lastUser.format ?? { type: "text" as const }
            if (format.type === "json_schema") system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
            const result = yield* handle.process({
              user: lastUser,
              agent,
              permission: session.permission,
              sessionID,
              parentSessionID: session.parentID,
              system,
              messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
              tools,
              model,
              toolChoice: format.type === "json_schema" ? "required" : undefined,
            })

            if (structured !== undefined) {
              handle.message.structured = structured
              handle.message.finish = handle.message.finish ?? "stop"
              yield* sessions.updateMessage(handle.message)
              return "break" as const
            }

            const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
            if (finished && !handle.message.error) {
              // Surface any content-filter finish (e.g. Anthropic stop_reason:
              // refusal) as an error. These turns may have produced no visible
              // output at all — previously the session went idle silently — or
              // partial text that was cut off by the provider's filter.
              if (handle.message.finish === "content-filter") {
                handle.message.error = new SessionV1.ContentFilterError({
                  message: "The response was blocked by the provider's content filter",
                }).toObject()
                yield* sessions.updateMessage(handle.message)
                yield* events.publish(Session.Event.Error, { sessionID, error: handle.message.error })
                return "break" as const
              }
              if (format.type === "json_schema") {
                handle.message.error = new SessionV1.StructuredOutputError({
                  message: "Model did not produce structured output",
                  retries: 0,
                }).toObject()
                yield* sessions.updateMessage(handle.message)
                return "break" as const
              }
            }

            if (result === "stop") {
              // Terminal stop (blocked / error): run the shared completion
              // gate. Verified completion breaks the loop; an unresolved
              // contract falls through so the model can continue.
              const completed = yield* epistemicCompletionGate({
                sessionID,
                step,
                messageID: handle.message.id,
              })
              if (completed) return "break" as const
            }
            if (result === "compact") {
              yield* compaction.create({
                sessionID,
                agent: lastUser.agent,
                model: lastUser.model,
                auto: true,
                overflow: !handle.message.finish,
              })
            }
            return "continue" as const
          }).pipe(
            Effect.ensuring(instruction.clear(handle.message.id)),
            Effect.onInterrupt(() => finalizeInterruptedAssistant),
          )
          if (outcome === "break") break
          continue
        }

        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))

        // P3 inter post-turn: after the loop exits, if usage is still hot, compact
        // before idle so the next user message starts clean.
        yield* Effect.gen(function* () {
          const msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
            Effect.provideService(Database.Service, database),
          )
          const { user: lastUser, finished: lastFinished } = MessageV2.latest(msgs)
          if (!lastUser || !lastFinished || lastFinished.summary === true) return
          yield* compaction.maybeInter({
            sessionID,
            agent: lastUser.agent,
            model: lastUser.model,
            tokens: lastFinished.tokens,
            reason: "post_turn",
          })
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

        // Emit session.completed event
        const completionReason = deriveCompletionReason(session.metadata as Record<string, unknown> | undefined)
        yield* eventStore.append({
          sessionId: sessionID,
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: step, reason: completionReason },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

        return yield* lastAssistant(sessionID)
      },
    )

    const loop: (input: LoopInput) => Effect.Effect<SessionV1.WithParts> = Effect.fn("SessionPrompt.loop")(function* (
      input: LoopInput,
    ) {
      // Wrap runLoop to emit session.crashed on uncaught errors before dying
      const work = runLoop(input.sessionID).pipe(
        Effect.catch((error: unknown) =>
          Effect.gen(function* () {
            yield* eventStore.append({
              sessionId: input.sessionID,
              actor: { kind: "policy", id: "error-boundary" },
              type: "session.crashed",
              payload: {
                error: String(error),
                errorType: error instanceof Error ? error.constructor.name : "Unknown",
              },
            }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
            return yield* Effect.die(error)
          })
        ),
      ) as Effect.Effect<SessionV1.WithParts> // Effect.catch with Effect.die narrows error to never — runtime correct
      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), work)
    })

    const shell: (input: ShellInput) => Effect.Effect<SessionV1.WithParts, Session.BusyError> = Effect.fn(
      "SessionPrompt.shell",
    )(function* (input: ShellInput) {
      const ready = yield* Latch.make()
      return yield* state.startShell(input.sessionID, lastAssistant(input.sessionID), shellImpl(input, ready), ready)
    })

    const command = Effect.fn("SessionPrompt.command")(function* (input: CommandInput) {
      yield* Effect.logInfo("command", {
        "session.id": input.sessionID,
        command: input.command,
        agent: input.agent,
      })

      // Built-in operator action: `/capability revoke <capabilityID> [reason]`
      // runs the production revocation workflow directly (no model involved)
      // and replies with the revoked grant ids. This is the TUI/CLI command
      // surface bound to the operator revoke endpoint.
      if (input.command === "capability") {
        const match = input.arguments.trim().match(/^revoke\s+(\S+)(?:\s+(.+))?$/)
        if (!match) {
          const error = new NamedError.Unknown({
            message: "Usage: /capability revoke <capabilityID> [reason]",
          })
          yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
          throw error
        }
        const grantStore = new SqliteGrantStore(database)
        const capabilityId = match[1]!
        const reason = (match[2]?.trim() || "OPERATOR_REVOKE")
        const result = yield* CapabilityRevocation.revokeCapabilityWithCascade(
          {
            loadGrant: (id) => grantStore.getGrantById(id).pipe(Effect.catch(() => Effect.succeed(null))),
            revokeCascade: (grantId, revokedEventId) =>
              revokeWithCascade(grantId, grantStore as unknown as RuntimeGrantStore, revokedEventId).pipe(
                Effect.catch(() => Effect.succeed({ revokedIds: [] as string[] })),
              ),
            emitRevoked: ({ capabilityId: revokedId, reason: revokedReason }) =>
              eventStore
                .append({
                  sessionId: input.sessionID,
                  actor: { kind: "operator", id: "capability-revocation" },
                  type: "capability.revoked",
                  payload: {
                    capabilityId: revokedId,
                    reason: revokedReason,
                    sessionId: input.sessionID,
                  },
                })
                .pipe(Effect.asVoid, Effect.catch(() => Effect.void)),
          },
          { sessionId: input.sessionID, capabilityId },
        )
        if (result.revokedIds.length === 0) {
          const error = new NamedError.Unknown({
            message: `Capability ${capabilityId} is not an active grant of session ${input.sessionID}`,
          })
          yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
          throw error
        }

        const text = `Revoked ${result.revokedIds.length} grant(s):\n${result.revokedIds
          .map((id) => `- ${id}`)
          .join("\n")}`
        const ctx = yield* InstanceState.context
        const model = yield* currentModel(input.sessionID)
        const rawModelID = model.modelID as string
        const rawProviderID = model.providerID as string
        const operatorAgent = input.agent ?? (yield* agents.defaultInfo()).name
        const userMsg: SessionV1.User = {
          id: MessageID.ascending(),
          sessionID: input.sessionID,
          time: { created: Date.now() },
          role: "user",
          agent: operatorAgent,
          model: {
            providerID: ProviderV2.ID.make(rawProviderID),
            modelID: ModelV2.ID.make(rawModelID),
          },
        }
        yield* sessions.updateMessage(userMsg)
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: userMsg.id,
          sessionID: input.sessionID,
          type: "text",
          text: `Capability revocation requested: ${capabilityId}`,
          synthetic: true,
        } satisfies SessionV1.TextPart)

        const msg: SessionV1.Assistant = {
          id: MessageID.ascending(),
          sessionID: input.sessionID,
          parentID: userMsg.id,
          mode: operatorAgent,
          agent: operatorAgent,
          cost: 0,
          path: { cwd: ctx.directory, root: ctx.worktree },
          time: { created: Date.now() },
          role: "assistant",
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ModelV2.ID.make(rawModelID),
          providerID: ProviderV2.ID.make(rawProviderID),
        }
        yield* sessions.updateMessage(msg)
        const part: SessionV1.TextPart = {
          id: PartID.ascending(),
          messageID: msg.id,
          sessionID: input.sessionID,
          type: "text",
          text,
        }
        yield* sessions.updatePart(part)
        yield* events.publish(Command.Event.Executed, {
          name: input.command,
          sessionID: input.sessionID,
          arguments: input.arguments,
          messageID: msg.id,
        })
        return { info: msg, parts: [part] }
      }

      const cmd = yield* commands.get(input.command)
      if (!cmd) {
        const available = (yield* commands.list()).map((c) => c.name)
        const hint = available.length ? ` Available commands: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Command not found: "${input.command}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }
      const agentName = cmd.agent ?? input.agent

      const raw = input.arguments.match(argsRegex) ?? []
      const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))
      const templateCommand = yield* Effect.promise(async () => cmd.template)

      const placeholders = templateCommand.match(placeholderRegex) ?? []
      let last = 0
      for (const item of placeholders) {
        const value = Number(item.slice(1))
        if (value > last) last = value
      }

      const withArgs = templateCommand.replaceAll(placeholderRegex, (_, index) => {
        const position = Number(index)
        const argIndex = position - 1
        if (argIndex >= args.length) return ""
        if (position === last) return args.slice(argIndex).join(" ")
        return args[argIndex]
      })
      const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
      let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

      if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
        template = template + "\n\n" + input.arguments
      }

      const shellMatches = ConfigMarkdown.shell(template)
      if (shellMatches.length > 0) {
        const cfg = yield* config.get()
        const sh = Shell.preferred(cfg.shell)
        const results = yield* Effect.promise(() =>
          Promise.all(
            shellMatches.map(async ([, cmd]) => (await Process.text([cmd], { shell: sh, nothrow: true })).text),
          ),
        )
        let index = 0
        template = template.replace(bashRegex, () => results[index++])
      }
      template = template.trim()

      const taskModel = yield* Effect.gen(function* () {
        if (cmd.model) return Provider.parseModel(cmd.model)
        if (cmd.agent) {
          const cmdAgent = yield* agents.get(cmd.agent)
          if (cmdAgent?.model) return cmdAgent.model
        }
        if (input.model) return Provider.parseModel(input.model)
        return yield* currentModel(input.sessionID)
      })

      yield* getModel(taskModel.providerID, taskModel.modelID, input.sessionID)

      const agent = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!agent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const templateParts = yield* resolvePromptParts(template)
      const inputFiles = new Set(
        input.parts?.filter((part) => new URL(part.url).protocol === "file:").map((part) => fileURLToPath(part.url)),
      )
      const uniqueTemplateParts = templateParts.filter(
        (part) => part.type !== "file" || !inputFiles.has(fileURLToPath(part.url)),
      )
      const isSubtask = (agent.mode === "subagent" && cmd.subtask !== false) || cmd.subtask === true
      const parts = isSubtask
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: cmd.description ?? "",
              command: input.command,
              model: { providerID: taskModel.providerID, modelID: taskModel.modelID },
              prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
            },
          ]
        : [...uniqueTemplateParts, ...(input.parts ?? [])]

      const userAgent = isSubtask ? (input.agent ?? (yield* agents.defaultInfo()).name) : agent.name
      const userModel = isSubtask
        ? input.model
          ? Provider.parseModel(input.model)
          : yield* currentModel(input.sessionID)
        : taskModel

      yield* plugin.trigger(
        "command.execute.before",
        { command: input.command, sessionID: input.sessionID, arguments: input.arguments },
        { parts },
      )

      const result = yield* prompt({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: userModel,
        agent: userAgent,
        parts,
        variant: input.variant,
      })
      yield* events.publish(Command.Event.Executed, {
        name: input.command,
        sessionID: input.sessionID,
        arguments: input.arguments,
        messageID: result.info.id,
      })
      return result
    })

    yield* events.listen((event) => {
      if (event.type !== Permission.Event.Replied.type) return Effect.void
      const data = event.data as { sessionID: SessionID; requestID: string; reply: string }
      if (data.reply === "reject") {
        takeParkedInstall(data.sessionID, data.requestID)
        return Effect.void
      }
      const parked = takeParkedInstall(data.sessionID, data.requestID)
      if (!parked) return Effect.void
      return Effect.gen(function* () {
        const current = yield* status.get(data.sessionID)
        if (current.type !== "idle") return
        yield* prompt({
          sessionID: data.sessionID,
          parts: [{ type: "text", text: formatInstallResumePrompt(parked.command) }],
        }).pipe(Effect.forkIn(scope), Effect.ignore)
      })
    })

    return Service.of({
      cancel,
      prompt,
      loop,
      shell,
      command,
      resolvePromptParts,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(SessionRunState.defaultLayer),
    Layer.provide(SessionStatus.defaultLayer),
    Layer.provide(SessionCompaction.defaultLayer),
    Layer.provide(SessionProcessor.defaultLayer),
    Layer.provide(Command.defaultLayer),
    Layer.provide(Permission.defaultLayer),
    Layer.provide(MCP.defaultLayer),
    Layer.provide(LSP.defaultLayer),
    Layer.provide(ToolRegistry.defaultLayer),
    Layer.provide(Truncate.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Instruction.defaultLayer),
    Layer.provide(FSUtil.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(SessionRevert.defaultLayer),
    Layer.provide(SessionBudget.defaultLayer),
    Layer.provide(SessionSummary.defaultLayer),
    Layer.provide(Image.defaultLayer),
    // Chained .pipe() — `pipe()` overloads cap at 20 operations; this layer has 21
    // provides, so the final mergeAll provide goes in a second .pipe() call.
    // Semantically identical: a.pipe(...x).pipe(y) === a.pipe(...x, y).
  ).pipe(
    // Provided BEFORE the mergeAll so its EventStore requirement is excluded
    // again by the mergeAll's EventStore.layer below; after the mergeAll it
    // would leak an unsatisfied EventStore requirement into the layer type.
    Layer.provide(ContractEngine.layer),
    Layer.provide(ObligationEngine.layer),
    Layer.provide(
      Layer.mergeAll(
        Agent.defaultLayer,
        SystemPrompt.defaultLayer,
        LLM.defaultLayer,
        CrossSpawnSpawner.defaultLayer,
        RuntimeFlags.defaultLayer,
        EventV2Bridge.defaultLayer,
        // SessionPrompt yields EventStore; wire it with Database so AppRuntime
        // dispose/listen paths do not surface "Service not found: Database".
        EventStore.layer,
      ),
    ),
    // Satisfy Database for SessionPrompt + EventStore after both require it.
    Layer.provide(Database.defaultLayer),
  ),
)
const ModelRef = Schema.Struct({
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
})

export const PromptInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  noReply: Schema.optional(Schema.Boolean),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
    description:
      "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
  }),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: Schema.Array(
    Schema.Union([
      SessionV1.TextPartInput,
      SessionV1.FilePartInput,
      SessionV1.AgentPartInput,
      SessionV1.SubtaskPartInput,
    ]).annotate({ discriminator: "type" }),
  ),
})
export type PromptInput = Schema.Schema.Type<typeof PromptInput>

export class LoopInput extends Schema.Class<LoopInput>("SessionPrompt.LoopInput")({
  sessionID: SessionID,
}) {}

export const ShellInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  agent: Schema.String,
  model: Schema.optional(ModelRef),
  command: Schema.String,
})
export type ShellInput = Schema.Schema.Type<typeof ShellInput>

export const CommandInput = Schema.Struct({
  messageID: Schema.optional(MessageID),
  sessionID: SessionID,
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  arguments: Schema.String,
  command: Schema.String,
  variant: Schema.optional(Schema.String),
  // Inlined (no identifier annotation) to keep the original SDK output — the
  // PromptInput call site below references FilePartInput by ref via the
  // Schema export in message-v2.ts.
  parts: Schema.optional(
    Schema.Array(
      Schema.Union([
        Schema.Struct({
          id: Schema.optional(PartID),
          type: Schema.Literal("file"),
          mime: Schema.String,
          filename: Schema.optional(Schema.String),
          url: Schema.String,
          source: Schema.optional(SessionV1.FilePartSource),
        }),
      ]).annotate({ discriminator: "type" }),
    ),
  ),
})
export type CommandInput = Schema.Schema.Type<typeof CommandInput>

/** @internal Exported for testing */
export function createStructuredOutputTool(input: {
  schema: Record<string, any>
  onSuccess: (output: unknown) => void
}): AITool {
  // Remove $schema property if present (not needed for tool input)
  const { $schema: _, ...toolSchema } = input.schema

  return tool({
    description: STRUCTURED_OUTPUT_DESCRIPTION,
    inputSchema: jsonSchema(toolSchema as JSONSchema7),
    async execute(args) {
      // AI SDK validates args against inputSchema before calling execute()
      input.onSuccess(args)
      return {
        output: "Structured output captured successfully.",
        title: "Structured Output",
        metadata: { valid: true },
      }
    },
    toModelOutput({ output }) {
      return {
        type: "text",
        value: output.output,
      }
    },
  })
}
const bashRegex = /!`([^`]+)`/g
// Match [Image N] as single token, quoted strings, or non-space sequences
const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

export const node = LayerNode.make(layer as any, [
  // CAST BOUNDARY #7 — Layer composition with EventStore dependency (prompt)
  // Upstream: Same issue as CAST BOUNDARY #3 in processor.ts. The layer.pipe(Layer.provide(...))
  // chain includes EventStore.layer which is fully resolved at runtime but remains
  // in the type parameter. LayerNode.make's strict type rejects it.
  // Runtime: the layer is self-contained — verified by prompt lifecycle tests.
  // Removal condition: Layer.provide erases provided deps from type parameter.
  // Scope: narrow (just the first arg to LayerNode.make)
  SessionStatus.node,
  Session.node,
  Agent.node,
  Provider.node,
  SessionProcessor.node,
  SessionCompaction.node,
  Plugin.node,
  Command.node,
  Config.node,
  Permission.node,
  FSUtil.node,
  MCP.node,
  LSP.node,
  ToolRegistry.node,
  Truncate.node,
  Image.node,
  CrossSpawnSpawner.node,
  Instruction.node,
  SessionRunState.node,
  SessionRevert.node,
  SessionBudget.node,
  SessionSummary.node,
  SystemPrompt.node,
  LLM.node,
  EventV2Bridge.node,
  RuntimeFlags.node,
  Database.node,
  EventStore.node,
  ObligationEngine.node,
  ContractEngine.node,
])

export * as SessionPrompt from "./prompt"
