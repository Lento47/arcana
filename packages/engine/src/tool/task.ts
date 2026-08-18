import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@arcana/core/v1/session"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import * as Router from "../agent/router"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Effect, Exit, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Database } from "@arcana/core/database/database"
import { getSessionGoal, setSessionGoal } from "@arcana/core/session/goal"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { delegateCapabilities, type CapabilityGrantDraft } from "@arcana/core/capability/delegation"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<SessionV1.WithParts>
}

const id = "task"
const BACKGROUND_DESCRIPTION = [
  "Background mode: background=true launches the subagent asynchronously and returns immediately.",
  "Foreground is the default; use it when you need the result before continuing.",
  "Use background only for independent work that can run while you continue elsewhere.",
  "You will be notified automatically when it finishes.",
].join(" ")
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
].join("\n")
const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response.",
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the agent in the background. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress",
  }),
  schema: Schema.optional(Schema.Unknown).annotate({
    description:
      "JSON Schema to validate the subagent's final output. If provided, the subagent is instructed to call a StructuredOutput tool with its result. The returned data is validated against this schema. If validation fails, the subagent retries once.",
  }),
  isolation: Schema.optional(Schema.Literal("worktree")).annotate({
    description:
      'Isolation mode. "worktree" creates a temporary git worktree so the subagent works on an isolated copy of the repo. Auto-cleaned if unchanged.',
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description:
      "Maximum time in milliseconds the subagent is allowed to run. On timeout, the subagent is aborted and an error is returned.",
  }),
  maxDepth: Schema.optional(Schema.Number).annotate({
    description:
      "Maximum recursion depth for subagent spawning. 0 or undefined allows infinite depth.",
  }),
})

function extractJson(text: string): unknown | undefined {
  // Try direct parse first
  try { return JSON.parse(text) } catch {}
  // Try extracting from markdown code block
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]) } catch {}
  }
  // Try finding a JSON object in the text
  const objMatch = text.match(/{[\s\S]*}/)
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) } catch {}
  }
  return undefined
}

function validateSchema(data: unknown, schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return true
  const s = schema as Record<string, unknown>
  if (s.type === "object" && (typeof data !== "object" || data === null || Array.isArray(data))) return false
  if (s.type === "array" && !Array.isArray(data)) return false
  if (s.type === "string" && typeof data !== "string") return false
  if (s.type === "number" && typeof data !== "number") return false
  if (s.type === "boolean" && typeof data !== "boolean") return false
  if (s.properties && typeof data === "object" && data !== null) {
    const props = s.properties as Record<string, unknown>
    const d = data as Record<string, unknown>
    for (const key of Object.keys(props)) {
      if (s.required && Array.isArray(s.required) && s.required.includes(key) && !(key in d)) return false
      if (key in d && !validateSchema(d[key], props[key])) return false
    }
  }
  return true
}

function renderOutput(input: {
  sessionID: SessionID
  state: "running" | "completed" | "error"
  summary?: string
  text: string
  structured?: unknown
  warning?: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  const structured = input.structured !== undefined ? ` type="json"` : ""
  const content = input.structured !== undefined ? JSON.stringify(input.structured) : input.text
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
    ...(input.summary ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}${structured}>`,
    content,
    `</${tag}>`,
    ...(input.warning ? [`<warning>${input.warning}</warning>`] : []),
    "</task>",
  ].join("\n")
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      const runInBackground = params.background === true
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(
          new Error("Background subagents require ARCANA_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"),
        )
      }

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      let next = yield* agent.get(params.subagent_type)
      // Auto-route when the caller asks for it ("auto" or empty): pick the best
      // subagent by routing metadata instead of failing. An unknown explicit
      // type still errors below so typos surface.
      if (!next && (params.subagent_type === "" || params.subagent_type === "auto")) {
        const all = yield* agent.list()
        next = Router.route(all, { prompt: params.prompt, description: params.description ?? "" }).agent
      }
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      const parent = yield* sessions.get(ctx.sessionID)
      // Resuming a prior task continues the same subagent session; a missing
      // id or a session that is not this parent's child creates a fresh one.
      const existing = params.task_id
        ? yield* sessions.get(SessionID.make(params.task_id)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      const resume = existing !== undefined && existing.parentID === ctx.sessionID
      let delegationWarning: string | undefined
      const childPermission = deriveSubagentSessionPermission({
        parentSessionPermission: parent.permission ?? [],
        subagent: next,
      })
      const childToolDenies = [
        ...(next.permission.some((rule) => rule.permission === "todowrite")
          ? []
          : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
        ...(next.permission.some((rule) => rule.permission === id)
          ? []
          : [{ permission: id, pattern: "*" as const, action: "deny" as const }]),
        ...(cfg.experimental?.primary_tools?.map((permission) => ({
          permission,
          pattern: "*" as const,
          action: "deny" as const,
        })) ?? []),
      ]
      const nextSession = resume && existing ? existing : yield* sessions.create({
            parentID: ctx.sessionID,
            title: params.description + ` (@${next.name} subagent)`,
            agent: next.name,
            permission: [
              ...childPermission,
              ...childToolDenies.filter(
                (deny) =>
                  !childPermission.some(
                    (rule) =>
                      rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action,
                  ),
              ),
            ],
          })

      if (!resume) {
        // Inherit parent session goal so subagent turns see the same active goal
        // and mutation gates align with the parent objective.
        yield* Effect.sync(() => {
          const parentGoal = getSessionGoal(ctx.sessionID)
          if (parentGoal.status === "unset") return
          setSessionGoal(nextSession.id, {
            goal: parentGoal.goal,
            scope: parentGoal.scope,
            priority: parentGoal.priority,
            status:
              parentGoal.status === "complete" || parentGoal.status === "complete_unverified"
                ? parentGoal.status
                : "in_progress",
            boardSessionID: parentGoal.boardSessionID,
            openCards: parentGoal.openCards,
            doneCards: parentGoal.doneCards,
            blockedCards: parentGoal.blockedCards,
          })
        })

        // ── Phase C: Capability delegation to child session ──────────────
        // Load parent's capability grants and delegate attenuated grants to child.
        // This runs alongside PermissionV1 — both systems are active.
        // The capability PEP in tools.ts enforces capability grants at execution time.
        //
        // Non-fatal: if delegation fails, the child session runs without capability
        // grants (PEP will deny consequential tools). This is honest — the child
        // gets no authority it shouldn't have.
        yield* Effect.gen(function* () {
        const grantStore = new SqliteGrantStore(database)

        // Use parent.agent (from session lookup) not input.agent.name
        const parentPrincipalId = parent.agent
        if (!parentPrincipalId) {
          // No agent identity on parent session — skip delegation
          return
        }

        const parentGrants = yield* grantStore
          .getGrantsForPrincipal(parentPrincipalId, ctx.sessionID)
          .pipe(Effect.catch(() => Effect.succeed([])))

        if (parentGrants.length === 0) {
          // No grants to delegate — child runs without capability grants
          return
        }

        // Get active contract for delegation context
        // Query ContractTable for the active contract in this session
        let contractId = `session-${ctx.sessionID}`
        let contractRevision = 1

        try {
          // Attempt to load active contract from the epistemic system
          const contractRows = yield* Effect.tryPromise({
            try: async () => {
              const { ContractTable } = await import("@arcana/core/epistemic/contract-sql")
              const { eq } = await import("drizzle-orm")
              const rows = database.db.select().from(ContractTable).where(
                eq(ContractTable.session_id, ctx.sessionID),
              )
              const allRows = await Effect.runPromise(
                rows.pipe(Effect.mapError(() => new Error("query failed")))
              )
              return allRows as Array<{ id: string; status: string; revision: number }>
            },
            catch: () => [] as Array<{ id: string; status: string; revision: number }>,
          })

          const activeContract = contractRows.find((r) => r.status === "active")
          if (activeContract) {
            contractId = activeContract.id
            contractRevision = activeContract.revision
          } else {
            // No active contract — log warning and skip delegation gracefully
            yield* Effect.logWarning(
              `No active contract found for session ${ctx.sessionID}, skipping capability delegation`,
            )
            return
          }
        } catch {
          // Contract query failed — skip delegation gracefully
          yield* Effect.logWarning(
            `Failed to query contract for session ${ctx.sessionID}, skipping capability delegation`,
          )
          return
        }

        // Derive child capability grants from parent
        const childDrafts: CapabilityGrantDraft[] = parentGrants.map((pg) => ({
          actions: pg.actions,
          resources: pg.resources,
          constraints: {
            toolNames: pg.constraints.toolNames,
            executable: pg.constraints.executable,
            networkHosts: pg.constraints.networkHosts,
            maxUses: pg.constraints.maxUses,
          },
        }))

        const delegationResult = delegateCapabilities(
          {
            parentPrincipalId,
            childPrincipalId: next.name,
            parentSessionId: ctx.sessionID,
            childSessionId: nextSession.id,
            contractId,
            contractRevision,
            requestedGrants: childDrafts,
            delegatedContext: {
              sourceEventIds: parentGrants.map((pg) => pg.createdEventId),
              provenance: [],
              sensitivity: "PUBLIC",
              contractId,
              contractRevision,
              parentSessionId: ctx.sessionID,
            },
          },
          [...parentGrants],
          `delegation-${ctx.sessionID}-${nextSession.id}`,
        )

        if (delegationResult.status === "DENIED") {
          delegationWarning =
            `Capability delegation was denied for child session ${nextSession.id}; ` +
            `the subagent will run without delegated authority, and capability-gated tools may be denied.`
        }

        if (delegationResult.status === "CREATED") {
          // Insert child grants as PENDING first
          for (const grant of delegationResult.childGrants) {
            yield* grantStore.putGrant({
              ...grant,
              status: "PENDING" as const,
            }).pipe(
              Effect.catch(() => Effect.void),
            )
          }

          // Activate PENDING grants after child session is confirmed
          const activated = yield* grantStore.activateGrantsForSession(nextSession.id).pipe(
            Effect.catch(() => Effect.succeed(0)),
          )

          if (activated === 0) {
            delegationWarning =
              `No capability grants were activated for child session ${nextSession.id}; ` +
              `the subagent will run without delegated authority, and capability-gated tools may be denied.`
            yield* Effect.logWarning(delegationWarning)
          }
        }
        // If delegation is denied, the child session still runs but
        // the capability PEP will deny all consequential tool calls.
      }).pipe(
        // Non-fatal: catch all errors so delegation failures don't break the task
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `Capability delegation failed for child session: ${String(error)}`,
            )
            // Revoke any PENDING grants that may have been inserted
            const grantStore = new SqliteGrantStore(database)
            yield* grantStore.revokePendingGrantsForSession(nextSession.id).pipe(
              Effect.catch(() => Effect.succeed(0)),
            )
          })
        ),
      )
      }
      // ── End Phase C capability delegation ────────────────────────────

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
      const variant = msg.info.variant

      const model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }
      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        ...(runInBackground ? { background: true } : {}),
      }

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
        const parts = yield* ops.resolvePromptParts(params.prompt)
        const result = yield* ops.prompt({
          messageID: MessageID.ascending(),
          sessionID: nextSession.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          variant: next.model ? undefined : variant,
          agent: next.name,
          parts,
        })
        return result.parts.findLast((item) => item.type === "text")?.text ?? ""
      })

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                text: renderOutput({
                  sessionID: nextSession.id,
                  state,
                  summary:
                    state === "completed"
                      ? `Background task completed: ${params.description}`
                      : `Background task failed: ${params.description}`,
                  text,
                  warning: delegationWarning,
                })
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* (jobID: string) {
        yield* background.wait({ id: jobID }).pipe(
          Effect.flatMap((result) => {
            if (result.info?.status === "completed") return inject("completed", result.info.output ?? "")
            if (result.info?.status === "error") return inject("error", result.info.error ?? "")
            return Effect.void
          }),
          Effect.forkIn(scope, { startImmediately: true }),
        )
      })

      if (yield* background.extend({ id: nextSession.id, run: runTask() })) {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: nextSession.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task updated",
            text: BACKGROUND_UPDATED,
            warning: delegationWarning,
          })
        }
      }

      const info = yield* background.start({
        id: nextSession.id,
        type: id,
        title: params.description,
        metadata,
        onPromote: Effect.all([
          ctx.metadata({
            title: params.description,
            metadata: { ...metadata, background: true, jobId: nextSession.id },
          }),
          notify(nextSession.id),
        ]),
        run: runTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id))),
      })

      function backgroundResult() {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: info.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task started",
            text: BACKGROUND_STARTED,
            warning: delegationWarning,
          })
        }
      }

      if (runInBackground) {
        yield* notify(info.id)
        return backgroundResult()
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            let waitEffect: Effect.Effect<BackgroundJob.Info | undefined, Error, never> = Effect.raceFirst(
              background.wait({ id: nextSession.id }).pipe(Effect.map((waited) => waited.info)),
              background.waitForPromotion(nextSession.id),
            )
            if (params.timeout !== undefined && params.timeout > 0) {
              waitEffect = waitEffect.pipe(
                Effect.timeout(params.timeout),
                Effect.flatMap((timed) => {
                  if (timed === undefined) {
                    return Effect.all([
                      ops.cancel(nextSession.id),
                      background.cancel(nextSession.id),
                    ], { discard: true }).pipe(
                      Effect.flatMap(() => Effect.fail(new Error(`Task timed out after ${params.timeout}ms`)))
                    )
                  }
                  return Effect.succeed(timed)
                })
              )
            }
            const result = yield* waitEffect
            if (result?.metadata?.background === true) return backgroundResult()
            if (result?.status === "error") return yield* Effect.fail(new Error(result.error ?? "Task failed"))
            if (result?.status === "cancelled") return yield* Effect.fail(new Error("Task cancelled"))
            const rawOutput = result?.output ?? ""
            // Structured output validation
            if (params.schema) {
              const json = extractJson(rawOutput)
              if (json !== undefined && validateSchema(json, params.schema)) {
                return {
                  title: params.description,
                  metadata,
                  output: renderOutput({ sessionID: nextSession.id, state: "completed", text: rawOutput, structured: json,
                    warning: delegationWarning,
                  })
                }
              }
              // Retry once: ask subagent to fix format
              const retryResult = yield* Effect.gen(function* () {
                const fixParts = yield* ops.resolvePromptParts(
                  `Your previous output did not match the required JSON schema. ` +
                  `Re-output your result as valid JSON matching this schema: ${JSON.stringify(params.schema)}. ` +
                  `Output ONLY the JSON object, no markdown wrapping.`
                )
                const retry = yield* ops.prompt({
                  messageID: MessageID.ascending(),
                  sessionID: nextSession.id,
                  model: { modelID: model.modelID, providerID: model.providerID },
                  variant: next.model ? undefined : variant,
                  agent: next.name,
                  parts: fixParts,
                })
                return retry.parts.findLast((item) => item.type === "text")?.text ?? ""
              }).pipe(Effect.catch(() => Effect.succeed(rawOutput)))
              const retryJson = extractJson(retryResult)
              if (retryJson !== undefined && validateSchema(retryJson, params.schema)) {
                return {
                  title: params.description,
                  metadata,
                  output: renderOutput({ sessionID: nextSession.id, state: "completed", text: retryResult, structured: retryJson,
                    warning: delegationWarning,
                  })
                }
              }
            }
            return {
              title: params.description,
              metadata,
              output: renderOutput({ sessionID: nextSession.id, state: "completed", text: rawOutput,
                warning: delegationWarning,
              })
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit))
              yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                ctx.abort.removeEventListener("abort", onAbort)
              }),
            ),
          ),
      )
    })

    return {
      description: flags.experimentalBackgroundSubagents
        ? [DESCRIPTION, BACKGROUND_DESCRIPTION].join("\n\n")
        : DESCRIPTION,
      parameters: Parameters,
      jsonSchema: flags.experimentalBackgroundSubagents ? undefined : ToolJsonSchema.fromSchema(BaseParameters),
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
