import { LayerNode } from "@arcana/core/effect/layer-node"
import { PermissionV1 } from "@arcana/core/v1/permission"
import { Image } from "@/image/image"
import { SessionV1 } from "@arcana/core/v1/session"
import { Cause, Deferred, Effect, Exit, Layer, Context, Scope, Schema } from "effect"
import * as Stream from "effect/Stream"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Snapshot } from "@/snapshot"
import { Session } from "./session"
import { ToolBreaker } from "./tool-breaker"
import { NamedError } from "@arcana/core/util/error"
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { compactionPressure } from "./overflow"
import { ML_METADATA } from "./drive"
import { PartID } from "./schema"
import type { SessionID } from "./schema"
import { SessionRetry } from "./retry"
import { SessionStatus } from "./status"
import { SessionSummary } from "./summary"
import type { Provider } from "@/provider/provider"
import { Question } from "@/question"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import { ProviderError } from "@/provider/error"
import { reportCompletionUsage } from "@/metrics/reporter"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Database } from "@arcana/core/database/database"
import { SessionEvent } from "@arcana/core/session/event"
import { SessionMessage } from "@arcana/core/session/message"
import { ModelV2 } from "@arcana/core/model"
import { extractReplayCallMetadata, extractReplayReturnMetadata } from "./epistemic/replay-metadata.js"
import { ProviderV2 } from "@arcana/core/provider"
import * as DateTime from "effect/DateTime"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Usage, type LLMEvent } from "@arcana/llm"
import {
  computeResponseFingerprint,
  createInferenceOptimizer,
  createLearningExample,
  detectCrossTurnLoop,
  type InferenceOptimizer,
  type InferencePreparation,
  type InferenceResponseEvaluation,
} from "@arcana/ml"
import { LearningStore, openMemoryDB } from "@arcana/memory"
import { memoryDataDir } from "@/memory/paths"
import { EventStore } from "./epistemic/event-store"
import {
  collapseWholeResponseReplay,
  normalizeTextDelta,
  type TextNormalizationReason,
} from "./text-stream-normalizer"

const DOOM_LOOP_THRESHOLD = 3
export type Result = "compact" | "stop" | "continue"

export interface Handle {
  readonly message: SessionV1.Assistant
  readonly updateToolCall: (
    toolCallID: string,
    update: (part: SessionV1.ToolPart) => SessionV1.ToolPart,
  ) => Effect.Effect<SessionV1.ToolPart | undefined>
  readonly completeToolCall: (
    toolCallID: string,
    output: {
      title: string
      metadata: Record<string, any>
      output: string
      attachments?: SessionV1.FilePart[]
    },
  ) => Effect.Effect<void>
  readonly process: (streamInput: LLM.StreamInput) => Effect.Effect<Result>
  /** Cross-turn loop warning for the next turn's preflight prompt. */
  readonly crossTurnLoopWarning: string | undefined
}

type Input = {
  assistantMessage: SessionV1.Assistant
  sessionID: SessionID
  model: Provider.Model
  /** Cross-turn loop warning from the previous turn, injected into the system prompt. */
  crossTurnLoopWarning?: string
}

export interface Interface {
  readonly create: (input: Input) => Effect.Effect<Handle>
}

type ToolCall = {
  assistantMessageID?: SessionMessage.ID
  /** Latest in-memory part for this call; authoritative within the turn. */
  part?: SessionV1.ToolPart
  partID: SessionV1.ToolPart["id"]
  messageID: SessionV1.ToolPart["messageID"]
  sessionID: SessionV1.ToolPart["sessionID"]
  done: Deferred.Deferred<void>
  inputEnded: boolean
  raw: string
}

interface ProcessorContext extends Input {
  toolcalls: Record<string, ToolCall>
  completedToolCalls: Set<string>
  shouldBreak: boolean
  snapshot: string | undefined
  blocked: boolean
  needsCompaction: boolean
  /** True when this LLM call continues after tool results (last context entry is a tool message). */
  followingToolResults: boolean
  currentText: SessionV1.TextPart | undefined
  currentTextID: string | undefined
  completedTextIDs: Set<string>
  ignoredTextIDs: Set<string>
  reasoningMap: Record<string, SessionV1.ReasoningPart>
  /** DB IDs of text/reasoning parts created in the current LLM attempt — pruned on retry to avoid duplicate cards. */
  attemptTextPartIDs: Set<string>
  attemptReasoningPartIDs: Set<string>
  v2AssistantMessageID: SessionMessage.ID | undefined
  mlRequest: string | undefined
  mlRevisionsUsed: number
  mlStore: LearningStore | undefined
  mlWorkspace: string | undefined
  mlOptimizer: InferenceOptimizer | undefined
  mlPreparation: InferencePreparation | undefined
  mlInitialEvaluation: InferenceResponseEvaluation | undefined
  mlFinalEvaluation: InferenceResponseEvaluation | undefined
  mlDraftResponse: string | undefined
  mlFinalResponse: string | undefined
  mlStartedAt: number
  /** Throttled persistence state for the active text part (see delta cases). */
  textPersist: { lastAt: number; count: number }
  /** Throttled persistence state per reasoning part id. */
  reasoningPersist: Record<string, { lastAt: number; count: number }>
  /** Recent turn response fingerprints for cross-turn loop detection. */
  recentTurnFingerprints: Array<{ hash: string; timestamp: number }>
  /** Cross-turn loop warning from the current turn, for the next turn's preflight. */
  crossTurnLoopWarning: string | undefined
  /** Quality gate correction data to inject into the next turn's system prompt. */
  mlCorrection: { problems: string[]; hints: string[]; score: number } | undefined
  /** The textID that was evaluated by the ML quality gate. */
  mlEvaluatedTextID: string | undefined
}

/**
 * Throttled delta persistence: the growing part is flushed to the durable
 * store (session.updatePart -> projector upsert) every interval or every N
 * deltas, not only at *-end. A daemon death mid-stream would otherwise
 * leave the DB itself with only the prefix (deltas are SSE-only), making
 * truncation permanent — no resync can heal data the server never stored.
 */
const PART_PERSIST_INTERVAL_MS = 500
const PART_PERSIST_DELTA_THRESHOLD = 64

/** Throttle decision: flush when the interval elapsed or the delta count is hit. */
export function shouldFlushPersist(
  state: { lastAt: number; count: number },
  now: number,
  intervalMs: number = PART_PERSIST_INTERVAL_MS,
  threshold: number = PART_PERSIST_DELTA_THRESHOLD,
): boolean {
  return now - state.lastAt >= intervalMs || state.count >= threshold
}

type StreamEvent = LLMEvent

export class Service extends Context.Service<Service, Interface>()("@arcana/SessionProcessor") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const session = yield* Session.Service
    const config = yield* Config.Service
    const snapshot = yield* Snapshot.Service
    const agents = yield* Agent.Service
    const llm = yield* LLM.Service
    const permission = yield* Permission.Service
    const plugin = yield* Plugin.Service
    const summary = yield* SessionSummary.Service
    const scope = yield* Scope.Scope
    const status = yield* SessionStatus.Service
    const image = yield* Image.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const eventStore = yield* EventStore.Service

    const create = Effect.fn("SessionProcessor.create")(function* (input: Input) {
      // Pre-capture snapshot before the LLM stream starts. The AI SDK
      // may execute tools internally before emitting start-step events,
      // so capturing inside the event handler can be too late.
      const snapshotStarted = Date.now()
      const initialSnapshot = yield* snapshot.track()
      input.assistantMessage.latency = {
        ...(input.assistantMessage.latency ?? { attempts: [] }),
        snapshotMs: Math.max(0, Date.now() - snapshotStarted),
      }
      const ctx: ProcessorContext = {
        assistantMessage: input.assistantMessage,
        sessionID: input.sessionID,
        model: input.model,
        toolcalls: {},
        completedToolCalls: new Set<string>(),
        shouldBreak: false,
        snapshot: initialSnapshot,
        blocked: false,
        needsCompaction: false,
        currentText: undefined,
        currentTextID: undefined,
        completedTextIDs: new Set(),
        ignoredTextIDs: new Set(),
        reasoningMap: {},
        attemptTextPartIDs: new Set<string>(),
        attemptReasoningPartIDs: new Set<string>(),
        v2AssistantMessageID: undefined,
        mlRequest: undefined,
        mlRevisionsUsed: 0,
        mlStore: undefined,
        mlWorkspace: undefined,
        mlOptimizer: undefined,
        mlPreparation: undefined,
        mlInitialEvaluation: undefined,
        mlFinalEvaluation: undefined,
        mlDraftResponse: undefined,
        mlFinalResponse: undefined,
        mlStartedAt: Date.now(),
        textPersist: { lastAt: 0, count: 0 },
        reasoningPersist: {},
        followingToolResults: false,
        recentTurnFingerprints: [],
        crossTurnLoopWarning: undefined,
        mlCorrection: undefined,
        mlEvaluatedTextID: undefined,
      }
      const mirrorAssistant = flags.experimentalEventSystem && !input.assistantMessage.summary
      let aborted = false
      let retryCount = 0

      const writeAttemptLatency = Effect.fn("SessionProcessor.writeAttemptLatency")(function* (
        attempt: SessionV1.ModelAttemptLatency,
      ) {
        const current = ctx.assistantMessage.latency ?? { attempts: [] }
        const attempts = current.attempts.filter((item) => item.attempt !== attempt.attempt)
        attempts.push(attempt)
        attempts.sort((a, b) => a.attempt - b.attempt)
        ctx.assistantMessage.latency = { ...current, attempts }
        yield* session.updateMessage(ctx.assistantMessage)
      })

      // Seed ML runtime with the most recent user request so the postflight
      // hook can score the assistant's response against the actual prompt.
      if (flags.mlRuntime) {
        const history = yield* session
          .messages({ sessionID: input.sessionID })
          .pipe(Effect.orElseSucceed(() => [] as SessionV1.WithParts[]))
        for (let i = history.length - 1; i >= 0; i--) {
          const entry = history[i]
          if (!entry || entry.info.role !== "user") continue
          const text = entry.parts
            .filter((part): part is SessionV1.TextPart => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (text) {
            ctx.mlRequest = text
            break
          }
        }
        if (ctx.mlRequest) {
          const sessionInfo = yield* session.get(input.sessionID).pipe(Effect.option)
          const workspace = sessionInfo._tag === "Some" ? sessionInfo.value.directory : globalThis.process.cwd()
          // Read persisted fingerprints and correction data from session metadata
          const sessionMeta = sessionInfo._tag === "Some"
            ? (sessionInfo.value.metadata ?? {}) as Record<string, unknown>
            : {}
          const persistedFingerprints = sessionMeta[ML_METADATA.fingerprints]
          if (
            Array.isArray(persistedFingerprints) &&
            persistedFingerprints.every(
              (f) => typeof f === "object" && f !== null && typeof (f as Record<string, unknown>).hash === "string",
            )
          ) {
            ctx.recentTurnFingerprints = persistedFingerprints as Array<{ hash: string; timestamp: number }>
          }
          // Read correction data from previous turn's quality gate
          const persistedCorrection = sessionMeta[ML_METADATA.correction]
          if (
            persistedCorrection &&
            typeof persistedCorrection === "object" &&
            Array.isArray((persistedCorrection as Record<string, unknown>).problems) &&
            Array.isArray((persistedCorrection as Record<string, unknown>).hints)
          ) {
            ctx.mlCorrection = persistedCorrection as { problems: string[]; hints: string[]; score: number }
          }
          yield* Effect.sync(() => {
            const store = new LearningStore(openMemoryDB(memoryDataDir()))
            const profile = store.getActiveProfile(workspace)
            const optimizer = createInferenceOptimizer({
              mode: "optimize",
              maxSilentRevisions: 1,
              calibrationProfile: profile ?? undefined,
            })
            const preparation = optimizer.prepare({
              request: ctx.mlRequest!,
              phase: /\b(implement|change|edit|fix|build|create|write)\b/i.test(ctx.mlRequest!)
                ? "editing"
                : "analysis",
              explicitConstraints: [
                "Preserve the user's request and do not rewrite their intent.",
                "Avoid generic filler; use concrete evidence and validation when applicable.",
                "Avoid these phrases: best practices, robust solution, scalable solution, seamless experience, cutting-edge, game changer, leverage, streamline, enhance, it depends, might be, perhaps, generally.",
                "When claiming work is done, fixed, verified, or passed, include a file path, command output, test result, or diff as evidence.",
              ],
              contextItems: history.flatMap((entry) => {
                const content = entry.parts
                  .filter((part): part is SessionV1.TextPart => part.type === "text")
                  .map((part) => part.text)
                  .join("\n")
                if (!content.trim() || entry.info.id === ctx.assistantMessage.parentID) return []
                return [{
                  id: store.reference("context", entry.info.id),
                  kind: entry.info.role === "user" || entry.info.role === "assistant"
                    ? "message" as const
                    : "artifact" as const,
                  content,
                  canSummarize: true,
                  canDrop: true,
                }]
              }),
              model: {
                contextWindow: Math.max(8_192, input.model.limit.context),
                supportsTools: true,
              },
            })
            ctx.mlStore = store
            ctx.mlWorkspace = workspace
            ctx.mlOptimizer = optimizer
            ctx.mlPreparation = preparation
            // Append cross-turn loop warning as a separate block
            if (input.crossTurnLoopWarning && preparation.promptAddendum) {
              preparation.promptAddendum = [
                preparation.promptAddendum,
                `<arcana-loop-warning>${input.crossTurnLoopWarning}</arcana-loop-warning>`,
              ].join("\n")
            }
            // Append quality gate correction from previous turn (zero token cost)
            if (ctx.mlCorrection && preparation.promptAddendum) {
              const correction = [
                "Your previous response had quality issues. Fix them in this turn:",
                ...ctx.mlCorrection.problems.map((p) => `- ${p}`),
                "",
                "Revision requirements:",
                ...ctx.mlCorrection.hints.map((h) => `- ${h}`),
              ].join("\n")
              preparation.promptAddendum = [
                preparation.promptAddendum,
                `<arcana-correction>${correction}</arcana-correction>`,
              ].join("\n")
            }
          }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("arcana.ml learning initialization failed", {
                error: errorMessage(error),
              }),
            ),
          )
        }
      }

      const parse = (e: unknown) =>
        MessageV2.fromError(e, {
          providerID: input.model.providerID,
          aborted,
        })

      const noteTextNormalization = Effect.fn("SessionProcessor.noteTextNormalization")(function* (input: {
        reason: TextNormalizationReason
        removedCharacters: number
      }) {
        if (!ctx.currentText || input.removedCharacters <= 0) return
        const previous = ctx.currentText.metadata?.["arcana.streamNormalization"]
        const prior = isRecord(previous) ? previous : {}
        const priorRemoved = typeof prior.removedCharacters === "number" ? prior.removedCharacters : 0
        const priorCount = typeof prior.count === "number" ? prior.count : 0
        ctx.currentText.metadata = {
          ...(ctx.currentText.metadata),
          "arcana.streamNormalization": {
            reason: input.reason,
            removedCharacters: priorRemoved + input.removedCharacters,
            count: priorCount + 1,
          },
        }
        yield* Effect.logWarning("normalized replayed text stream", {
          sessionID: ctx.sessionID,
          messageID: ctx.assistantMessage.id,
          providerID: ctx.model.providerID,
          modelID: ctx.model.id,
          reason: input.reason,
          removedCharacters: input.removedCharacters,
        })
      })

      const settleToolCall = Effect.fn("SessionProcessor.settleToolCall")(function* (toolCallID: string) {
        const done = ctx.toolcalls[toolCallID]?.done
        delete ctx.toolcalls[toolCallID]
        ctx.completedToolCalls.add(toolCallID)
        if (done) yield* Deferred.succeed(done, undefined).pipe(Effect.ignore)
      })

      const ensureV2AssistantMessage = Effect.fn("SessionProcessor.ensureV2AssistantMessage")(function* () {
        if (ctx.v2AssistantMessageID) return ctx.v2AssistantMessageID
        ctx.v2AssistantMessageID = SessionMessage.ID.create()
        yield* events.publish(SessionEvent.Step.Started, {
          sessionID: ctx.sessionID,
          assistantMessageID: ctx.v2AssistantMessageID,
          agent: input.assistantMessage.agent,
          model: {
            id: ModelV2.ID.make(ctx.model.id),
            providerID: ProviderV2.ID.make(ctx.model.providerID),
            variant: ModelV2.VariantID.make(input.assistantMessage.variant ?? "default"),
          },
          snapshot: ctx.snapshot,
          timestamp: DateTime.makeUnsafe(Date.now()),
        })
        return ctx.v2AssistantMessageID
      })

      const requireV2AssistantMessage = (toolCall?: ToolCall) =>
        toolCall?.assistantMessageID === undefined
          ? Effect.die("V2 tool settlement has no owning assistant message")
          : Effect.succeed(toolCall.assistantMessageID)

      const currentV2AssistantMessage = () =>
        ctx.v2AssistantMessageID === undefined
          ? Effect.die("V2 step settlement has no owning assistant message")
          : Effect.succeed(ctx.v2AssistantMessageID)

      const readToolCall = Effect.fn("SessionProcessor.readToolCall")(function* (toolCallID: string) {
        if (ctx.completedToolCalls.has(toolCallID)) {
          delete ctx.toolcalls[toolCallID]
          return undefined
        }
        const call = ctx.toolcalls[toolCallID]
        if (!call) return undefined
        // In-memory part is authoritative within this turn: the durable read
        // lags behind event publication, so a second concurrent update would
        // otherwise re-read a stale pending state and overwrite fields the
        // first update just set (e.g. task-tool metadata.sessionId).
        if (call.part) return { call, part: call.part }
        const part = yield* session.getPart({
          partID: call.partID,
          messageID: call.messageID,
          sessionID: call.sessionID,
        })
        if (!part || part.type !== "tool") {
          delete ctx.toolcalls[toolCallID]
          return undefined
        }
        return { call, part }
      })

      const updateToolCall = Effect.fn("SessionProcessor.updateToolCall")(function* (
        toolCallID: string,
        update: (part: SessionV1.ToolPart) => SessionV1.ToolPart,
      ) {
        const match = yield* readToolCall(toolCallID)
        if (!match) return undefined
        const next = update(match.part)
        const part = yield* session.updatePart(next)
        ctx.toolcalls[toolCallID] = {
          ...match.call,
          part,
          partID: part.id,
          messageID: part.messageID,
          sessionID: part.sessionID,
        }
        return part
      })

      const completeToolCall = Effect.fn("SessionProcessor.completeToolCall")(function* (
        toolCallID: string,
        output: {
          title: string
          metadata: Record<string, any>
          output: string
          attachments?: SessionV1.FilePart[]
        },
      ) {
        const match = yield* readToolCall(toolCallID)
        if (!match || match.part.state.status !== "running") return
        yield* session.updatePart({
          ...match.part,
          state: {
            status: "completed",
            input: match.part.state.input,
            output: output.output,
            metadata: output.metadata,
            title: output.title,
            time: { start: match.part.state.time.start, end: Date.now() },
            attachments: output.attachments,
          },
        })
        // Emit epistemic tool.returned event with replay metadata
        const toolInput = isRecord(match.part.state.input) ? match.part.state.input : {}
        const endTime = Date.now()
        yield* eventStore.append({
          sessionId: ctx.sessionID,
          actor: { kind: "tool", id: match.part.tool ?? toolCallID },
          type: "tool.returned",
          payload: {
            callID: toolCallID,
            title: output.title,
            hasOutput: output.output.length > 0,
            replay: extractReplayReturnMetadata(
              toolInput,
              output.output,
              isRecord(output.metadata) ? output.metadata : {},
              match.part.state.time?.start ?? null,
              endTime,
            ),
          },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
        yield* settleToolCall(toolCallID)
      })

      const failToolCall = Effect.fn("SessionProcessor.failToolCall")(function* (toolCallID: string, error: unknown) {
        const match = yield* readToolCall(toolCallID)
        if (!match || match.part.state.status !== "running") return false
        yield* session.updatePart({
          ...match.part,
          state: {
            status: "error",
            input: match.part.state.input,
            error: errorMessage(error),
            time: { start: match.part.state.time.start, end: Date.now() },
          },
        })
        // Runtime self-heal (circuit breaker): when DISTINCT tools start
        // failing with the identical signature inside the window, the
        // runtime itself is degraded (poisoned boot, corrupted store) — not
        // the individual tool. Surface it to the operator and hard-restart
        // so the supervisor/TUI respawns a healthy process. The restart
        // guard prevents a tight crash loop when a restart cannot help.
        if (!(error instanceof PermissionV1.RejectedError) && !(error instanceof Question.RejectedError)) {
          const decision = ToolBreaker.recordToolFailure(match.part.tool ?? toolCallID, error)
          if (decision.trip) {
            yield* Effect.logError("tool breaker tripped — runtime degraded", {
              signature: decision.signature,
              distinctTools: decision.distinctTools,
              sessionID: ctx.sessionID,
            })
            yield* events.publish(Session.Event.Error, {
              sessionID: ctx.sessionID,
              error: new NamedError.Unknown({
                message: `Runtime degraded: ${decision.distinctTools} tools failing identically (${decision.signature}). Restarting the engine — your session is safe.`,
              }).toObject(),
            })
            if (ToolBreaker.shouldHardRestart()) {
              // A local `process` shadows Node's global in this scope.
              yield* Effect.sleep(300).pipe(Effect.andThen(Effect.sync(() => globalThis.process!.exit(1))))
            }
          }
        }
        if (error instanceof PermissionV1.RejectedError || error instanceof Question.RejectedError) {
          ctx.blocked = ctx.shouldBreak
        }
        yield* settleToolCall(toolCallID)
        return true
      })

      const finishReasoning = Effect.fn("SessionProcessor.finishReasoning")(function* (reasoningID: string) {
        if (!(reasoningID in ctx.reasoningMap)) return
        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
        if (mirrorAssistant) {
          yield* events.publish(SessionEvent.Reasoning.Ended, {
            sessionID: ctx.sessionID,
            assistantMessageID: yield* currentV2AssistantMessage(),
            reasoningID,
            text: ctx.reasoningMap[reasoningID].text,
            providerMetadata: ctx.reasoningMap[reasoningID].metadata,
            timestamp: DateTime.makeUnsafe(Date.now()),
          })
        }
        // oxlint-disable-next-line no-self-assign -- reactivity trigger
        ctx.reasoningMap[reasoningID].text = ctx.reasoningMap[reasoningID].text
        ctx.reasoningMap[reasoningID].time = { ...ctx.reasoningMap[reasoningID].time, end: Date.now() }
        yield* session.updatePart(ctx.reasoningMap[reasoningID])
        delete ctx.reasoningMap[reasoningID]
        delete ctx.reasoningPersist[reasoningID]
      })

      const flushV2Fragments = Effect.fn("SessionProcessor.flushV2Fragments")(function* () {
        if (!mirrorAssistant) return
        if (!ctx.assistantMessage.summary && ctx.currentText && ctx.currentTextID) {
          yield* events.publish(SessionEvent.Text.Ended, {
            sessionID: ctx.sessionID,
            assistantMessageID: yield* currentV2AssistantMessage(),
            textID: ctx.currentTextID,
            text: ctx.currentText.text,
            timestamp: DateTime.makeUnsafe(Date.now()),
          })
        }
        yield* Effect.forEach(Object.entries(ctx.reasoningMap), ([reasoningID, part]) =>
          currentV2AssistantMessage().pipe(
            Effect.flatMap((assistantMessageID) =>
              events.publish(SessionEvent.Reasoning.Ended, {
                sessionID: ctx.sessionID,
                assistantMessageID,
                reasoningID,
                text: part.text,
                providerMetadata: part.metadata,
                timestamp: DateTime.makeUnsafe(Date.now()),
              }),
            ),
          ),
        )
      })

      const ensureToolCall = Effect.fn("SessionProcessor.ensureToolCall")(function* (input: {
        id: string
        name: string
        providerExecuted?: boolean
      }) {
        const existing = yield* readToolCall(input.id)
        if (existing) {
          if (!input.providerExecuted || existing.part.metadata?.providerExecuted) return existing
          const part = yield* session.updatePart({
            ...existing.part,
            metadata: { ...existing.part.metadata, providerExecuted: true },
          })
          ctx.toolcalls[input.id] = {
            ...existing.call,
            partID: part.id,
            messageID: part.messageID,
            sessionID: part.sessionID,
          }
          return { call: ctx.toolcalls[input.id], part }
        }
        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
        const assistantMessageID = mirrorAssistant ? yield* ensureV2AssistantMessage() : undefined
        if (assistantMessageID) {
          yield* events.publish(SessionEvent.Tool.Input.Started, {
            sessionID: ctx.sessionID,
            assistantMessageID,
            callID: input.id,
            name: input.name,
            timestamp: DateTime.makeUnsafe(Date.now()),
          })
        }
        const part = yield* session.updatePart({
          id: PartID.ascending(),
          messageID: ctx.assistantMessage.id,
          sessionID: ctx.assistantMessage.sessionID,
          type: "tool",
          tool: input.name,
          callID: input.id,
          state: { status: "pending", input: {}, raw: "" },
          metadata: input.providerExecuted ? { providerExecuted: true } : undefined,
        } satisfies SessionV1.ToolPart)
        ctx.toolcalls[input.id] = {
          assistantMessageID,
          done: yield* Deferred.make<void>(),
          part,
          partID: part.id,
          messageID: part.messageID,
          sessionID: part.sessionID,
          inputEnded: false,
          raw: "",
        }
        return { call: ctx.toolcalls[input.id], part }
      })

      const isFilePart = (value: unknown): value is SessionV1.FilePart => Schema.is(SessionV1.FilePart)(value)

      const toolResultOutput = (
        value: Extract<StreamEvent, { type: "tool-result" }>,
      ): { title: string; metadata: Record<string, any>; output: string; attachments?: SessionV1.FilePart[] } => {
        if (isRecord(value.result.value) && typeof value.result.value.output === "string") {
          return {
            title: typeof value.result.value.title === "string" ? value.result.value.title : value.name,
            metadata: isRecord(value.result.value.metadata) ? value.result.value.metadata : {},
            output: value.result.value.output,
            attachments: Array.isArray(value.result.value.attachments)
              ? value.result.value.attachments.filter(isFilePart)
              : undefined,
          }
        }
        return {
          title: value.name,
          metadata: value.result.type === "json" && isRecord(value.result.value) ? value.result.value : {},
          output:
            typeof value.result.value === "string" ? value.result.value : (JSON.stringify(value.result.value) ?? ""),
        }
      }

      const handleEvent = Effect.fnUntraced(function* (value: StreamEvent) {
        switch (value.type) {
          case "reasoning-start":
            if (value.id in ctx.reasoningMap) return
            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
            if (mirrorAssistant) {
              yield* events.publish(SessionEvent.Reasoning.Started, {
                sessionID: ctx.sessionID,
                assistantMessageID: yield* ensureV2AssistantMessage(),
                reasoningID: value.id,
                providerMetadata: value.providerMetadata,
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            ctx.reasoningMap[value.id] = {
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "reasoning",
              text: "",
              time: { start: Date.now() },
              metadata: value.providerMetadata,
            }
            ctx.reasoningPersist[value.id] = { lastAt: Date.now(), count: 0 }
            ctx.attemptReasoningPartIDs.add(ctx.reasoningMap[value.id].id)
            yield* session.updatePart(ctx.reasoningMap[value.id])
            return

          case "reasoning-delta":
            // Match dev: silently drop orphan deltas (no preceding reasoning-start).
            if (!(value.id in ctx.reasoningMap)) return
            ctx.reasoningMap[value.id].text += value.text
            if (value.providerMetadata) ctx.reasoningMap[value.id].metadata = value.providerMetadata
            if (mirrorAssistant) {
              yield* events.publish(SessionEvent.Reasoning.Delta, {
                sessionID: ctx.sessionID,
                assistantMessageID: yield* currentV2AssistantMessage(),
                reasoningID: value.id,
                delta: value.text,
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            yield* session.emitPartDelta({
              sessionID: ctx.reasoningMap[value.id].sessionID,
              messageID: ctx.reasoningMap[value.id].messageID,
              partID: ctx.reasoningMap[value.id].id,
              partType: "reasoning",
              field: "text",
              delta: value.text,
            })
            // Throttled durable flush (same rationale as text-delta).
            {
              const persist = (ctx.reasoningPersist[value.id] ??= { lastAt: Date.now(), count: 0 })
              persist.count += 1
              if (shouldFlushPersist(persist, Date.now())) {
                yield* session.updatePart(ctx.reasoningMap[value.id])
                persist.lastAt = Date.now()
                persist.count = 0
              }
            }
            return

          case "reasoning-end":
            if (value.providerMetadata && value.id in ctx.reasoningMap) {
              ctx.reasoningMap[value.id].metadata = value.providerMetadata
            }
            yield* finishReasoning(value.id)
            return

          case "tool-input-start":
            if (ctx.assistantMessage.summary) {
              throw new Error(`Tool call not allowed while generating summary: ${value.name}`)
            }
            yield* ensureToolCall(value)
            return

          case "tool-input-delta":
            {
              const toolCall = yield* ensureToolCall(value)
              const assistantMessageID = mirrorAssistant ? yield* requireV2AssistantMessage(toolCall.call) : undefined
              if (assistantMessageID) {
                yield* events.publish(SessionEvent.Tool.Input.Delta, {
                  sessionID: ctx.sessionID,
                  assistantMessageID,
                  callID: value.id,
                  delta: value.text,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
              }
              ctx.toolcalls[value.id] = { ...toolCall.call, raw: toolCall.call.raw + value.text }
            }
            return

          case "tool-input-end": {
            const toolCall = yield* ensureToolCall(value)
            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
            if (mirrorAssistant) {
              const assistantMessageID = yield* requireV2AssistantMessage(toolCall.call)
              yield* events.publish(SessionEvent.Tool.Input.Ended, {
                sessionID: ctx.sessionID,
                assistantMessageID,
                callID: value.id,
                text: toolCall.call.raw,
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            ctx.toolcalls[value.id] = { ...toolCall.call, inputEnded: true }
            return
          }

          case "tool-call": {
            if (ctx.assistantMessage.summary) {
              throw new Error(`Tool call not allowed while generating summary: ${value.name}`)
            }
            const toolCall = yield* ensureToolCall(value)
            const input = isRecord(value.input) ? value.input : { value: value.input }
            if (!toolCall.call.inputEnded) {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant) {
                const assistantMessageID = yield* requireV2AssistantMessage(toolCall.call)
                yield* events.publish(SessionEvent.Tool.Input.Ended, {
                  sessionID: ctx.sessionID,
                  assistantMessageID,
                  callID: value.id,
                  text: toolCall.call.raw,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
              }
            }
            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
            if (mirrorAssistant) {
              const assistantMessageID = yield* requireV2AssistantMessage(toolCall.call)
              yield* events.publish(SessionEvent.Tool.Called, {
                sessionID: ctx.sessionID,
                assistantMessageID,
                callID: value.id,
                tool: value.name,
                input,
                provider: {
                  executed: toolCall.part.metadata?.providerExecuted === true,
                  ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),
                },
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            // Emit enriched epistemic tool.called event
            // value.input has the tool's parameters (command, cwd, etc.)
            yield* eventStore.append({
              sessionId: ctx.sessionID,
              actor: { kind: "model", id: value.name },
              type: "tool.called",
              payload: {
                callID: value.id,
                tool: value.name,
                providerExecuted: toolCall.part.metadata?.providerExecuted === true,
                replay: extractReplayCallMetadata(value.name, input),
              },
            }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
            yield* updateToolCall(value.id, (match) => ({
              ...match,
              tool: value.name,
              state:
                match.state.status === "running"
                  ? { ...match.state, input }
                  : {
                      status: "running",
                      input,
                      time: { start: Date.now() },
                    },
              metadata: match.metadata?.providerExecuted
                ? { ...value.providerMetadata, providerExecuted: true }
                : value.providerMetadata,
            }))

            const parts = yield* MessageV2.parts(ctx.assistantMessage.id).pipe(
              Effect.provideService(Database.Service, database),
            )
            const recentParts = parts.slice(-DOOM_LOOP_THRESHOLD)

            if (
              recentParts.length !== DOOM_LOOP_THRESHOLD ||
              !recentParts.every(
                (part) =>
                  part.type === "tool" &&
                  part.tool === value.name &&
                  part.state.status !== "pending" &&
                  JSON.stringify(part.state.input) === JSON.stringify(input),
              )
            ) {
              return
            }

            const agent = yield* agents.get(ctx.assistantMessage.agent)
            yield* permission.ask({
              permission: "doom_loop",
              patterns: [value.name],
              sessionID: ctx.assistantMessage.sessionID,
              metadata: { tool: value.name, input },
              always: [value.name],
              ruleset: agent.permission,
            })
            return
          }

          case "tool-result": {
            const toolCall = yield* readToolCall(value.id)
            if (!toolCall && value.result.type === "error") return
            if (value.result.type === "error") {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant && toolCall) {
                const assistantMessageID = yield* requireV2AssistantMessage(toolCall.call)
                yield* events.publish(SessionEvent.Tool.Failed, {
                  sessionID: ctx.sessionID,
                  assistantMessageID,
                  callID: value.id,
                  error: { type: "unknown", message: errorMessage(value.result.value) },
                  result: value.result,
                  provider: {
                    executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,
                    ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),
                  },
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
              }
              yield* failToolCall(value.id, value.result.value)
              return
            }
            if (!toolCall) return // orphan non-error tool-result
            const rawOutput = toolResultOutput(value)
            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =>
              attachment.mime.startsWith("image/")
                ? image.normalize(attachment).pipe(
                    Effect.catchIf(
                      (error) => error instanceof Image.ResizerUnavailableError,
                      () => Effect.succeed(attachment),
                    ),
                    Effect.exit,
                  )
                : Effect.succeed(Exit.succeed<SessionV1.FilePart>(attachment)),
            )
            const omitted = normalized.filter(Exit.isFailure).length
            const attachments = normalized.filter(Exit.isSuccess).map((item) => item.value)
            const output = {
              ...rawOutput,
              output:
                omitted === 0
                  ? rawOutput.output
                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? "" : "s"} omitted: could not be resized below the image size limit.]`,
              attachments: attachments.length ? attachments : undefined,
            }
            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
            if (mirrorAssistant) {
              const assistantMessageID = yield* requireV2AssistantMessage(toolCall?.call)
              const content = [
                { type: "text" as const, text: output.output },
                ...(output.attachments?.map(
                  (item: SessionV1.FilePart) =>
                    ({
                      type: "file",
                      uri: item.url,
                      mime: item.mime,
                      name: item.filename,
                    }) as const,
                ) ?? []),
              ]
              const unsupported = content.find((item) => item.type === "file" && !item.uri.startsWith("data:"))
              if (unsupported?.type === "file") {
                const error = new Error(
                  `Tool attachment URI "${unsupported.uri}" must be materialized before durable V2 settlement`,
                )
                yield* events.publish(SessionEvent.Tool.Failed, {
                  sessionID: ctx.sessionID,
                  assistantMessageID,
                  callID: value.id,
                  error: {
                    type: "unknown",
                    message: error.message,
                  },
                  provider: {
                    executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,
                    ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),
                  },
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
                yield* failToolCall(value.id, error)
                return
              } else
                yield* events.publish(SessionEvent.Tool.Success, {
                  sessionID: ctx.sessionID,
                  assistantMessageID,
                  callID: value.id,
                  structured: output.metadata,
                  content,
                  result: value.result,
                  provider: {
                    executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,
                    ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),
                  },
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
            }
            yield* completeToolCall(value.id, output)
            return
          }

          case "tool-error": {
            const toolCall = yield* readToolCall(value.id)
            if (!toolCall) return // orphan tool-error
            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
            if (mirrorAssistant) {
              const assistantMessageID = yield* requireV2AssistantMessage(toolCall?.call)
              yield* events.publish(SessionEvent.Tool.Failed, {
                sessionID: ctx.sessionID,
                assistantMessageID,
                callID: value.id,
                error: {
                  type: "unknown",
                  message: value.message,
                },
                provider: {
                  executed: toolCall?.part.metadata?.providerExecuted === true,
                  ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),
                },
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            yield* failToolCall(value.id, value.error ?? new Error(value.message))
            return
          }

          case "provider-error":
            throw new Error(value.message)

          case "step-start":
            if (!ctx.snapshot) ctx.snapshot = yield* snapshot.track()
            if (!ctx.assistantMessage.summary) {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant) {
                yield* ensureV2AssistantMessage()
              }
            }
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.sessionID,
              snapshot: ctx.snapshot,
              type: "step-start",
            })
            return

          case "step-finish": {
            const completedSnapshot = yield* snapshot.track()
            yield* Effect.forEach(Object.keys(ctx.reasoningMap), finishReasoning)
            const usage = Session.getUsage({
              model: ctx.model,
              usage: value.usage ?? new Usage({}),
              metadata: value.providerMetadata,
            })
            // Degenerate empty completion: free-pool upstreams occasionally
            // end a post-tool follow-up call with zero content and an
            // unparseable finish reason ("unknown"). Ending the turn there
            // records a phantom success and idles the session silently —
            // observed live on 2026-08-23 (OtnelVerdict run). Fail only when
            // this call was a tool-result continuation, so benign single-shot
            // empty streams are left to the drive layer. SessionRetry backs
            // off and re-asks; if all attempts exhaust, halt() attaches a
            // visible error.
            if (
              value.reason === "unknown" &&
              usage.tokens.output === 0 &&
              usage.tokens.reasoning === 0 &&
              ctx.followingToolResults
            ) {
              throw new ProviderError.ResponseStreamError("Provider returned an empty response")
            }
            if (!ctx.assistantMessage.summary) {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant) {
                yield* events.publish(SessionEvent.Step.Ended, {
                  sessionID: ctx.sessionID,
                  assistantMessageID: yield* currentV2AssistantMessage(),
                  finish: value.reason,
                  cost: usage.cost,
                  tokens: usage.tokens,
                  snapshot: completedSnapshot,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                })
                ctx.v2AssistantMessageID = undefined
              }
            }
            ctx.assistantMessage.finish = value.reason
            ctx.assistantMessage.cost += usage.cost
            ctx.assistantMessage.tokens = usage.tokens
            // Counts-only metrics egress for direct/BYOK provider calls
            // (on by default; ARCANA_METRICS_SHARING=0 disables. Proxied
            // traffic is excluded inside the reporter). Fire-and-forget,
            // never throws.
            reportCompletionUsage({
              sessionId: ctx.sessionID,
              providerID: ctx.model.providerID,
              modelID: ctx.model.id,
              tokens: usage.tokens,
              cost: usage.cost,
            })
            yield* session.updatePart({
              id: PartID.ascending(),
              reason: value.reason,
              snapshot: completedSnapshot,
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "step-finish",
              tokens: usage.tokens,
              cost: usage.cost,
            })
            yield* session.updateMessage(ctx.assistantMessage)
            if (ctx.snapshot) {
              const patch = yield* snapshot.patch(ctx.snapshot)
              if (patch.files.length) {
                yield* session.updatePart({
                  id: PartID.ascending(),
                  messageID: ctx.assistantMessage.id,
                  sessionID: ctx.sessionID,
                  type: "patch",
                  hash: patch.hash,
                  files: patch.files,
                })
              }
              ctx.snapshot = undefined
            }
            yield* summary
              .summarize({
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.parentID,
              })
              .pipe(Effect.ignore, Effect.forkIn(scope))
            if (
              !ctx.assistantMessage.summary &&
              compactionPressure({
                cfg: yield* config.get(),
                tokens: usage.tokens,
                model: ctx.model,
                outputTokenMax: flags.outputTokenMax,
              }).hot
            ) {
              ctx.needsCompaction = true
            }
            return
          }

          case "text-start":
            if (ctx.completedTextIDs.has(value.id)) {
              ctx.ignoredTextIDs.add(value.id)
              yield* Effect.logWarning("ignored replayed completed text segment", {
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.id,
                providerID: ctx.model.providerID,
                modelID: ctx.model.id,
                textID: value.id,
              })
              return
            }
            if (ctx.currentText && ctx.currentTextID === value.id) {
              yield* Effect.logWarning("ignored duplicate text segment start", {
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.id,
                textID: value.id,
              })
              return
            }
            if (!ctx.assistantMessage.summary) {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant) {
                yield* events.publish(SessionEvent.Text.Started, {
                  sessionID: ctx.sessionID,
                  assistantMessageID: yield* ensureV2AssistantMessage(),
                  timestamp: DateTime.makeUnsafe(Date.now()),
                  textID: value.id,
                })
              }
            }
            ctx.currentText = {
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.assistantMessage.sessionID,
              type: "text",
              text: "",
              time: { start: Date.now() },
              metadata: value.providerMetadata,
            }
            ctx.currentTextID = value.id
            ctx.textPersist = { lastAt: Date.now(), count: 0 }
            ctx.attemptTextPartIDs.add(ctx.currentText.id)
            yield* session.updatePart(ctx.currentText)
            return

          case "text-delta": {
            if (ctx.ignoredTextIDs.has(value.id)) return
            if (!ctx.currentText || ctx.currentTextID !== value.id) return
            const normalized = normalizeTextDelta(ctx.currentText.text, value.text)
            if (normalized.reason) {
              yield* noteTextNormalization({
                reason: normalized.reason,
                removedCharacters: normalized.removedCharacters,
              })
            }
            if (!normalized.text) return
            ctx.currentText.text += normalized.text
            if (value.providerMetadata) {
              ctx.currentText.metadata = {
                ...(ctx.currentText.metadata),
                ...value.providerMetadata,
              }
            }
            if (mirrorAssistant) {
              yield* events.publish(SessionEvent.Text.Delta, {
                sessionID: ctx.sessionID,
                assistantMessageID: yield* currentV2AssistantMessage(),
                textID: value.id,
                delta: normalized.text,
                timestamp: DateTime.makeUnsafe(Date.now()),
              })
            }
            yield* session.emitPartDelta({
              sessionID: ctx.currentText.sessionID,
              messageID: ctx.currentText.messageID,
              partID: ctx.currentText.id,
              partType: "text",
              field: "text",
              delta: normalized.text,
            })
            // Throttled durable flush: keep the DB close to the live stream
            // so a mid-stream daemon death does not permanently truncate.
            {
              const persist = ctx.textPersist
              persist.count += 1
              if (shouldFlushPersist(persist, Date.now())) {
                yield* session.updatePart(ctx.currentText)
                persist.lastAt = Date.now()
                persist.count = 0
              }
            }
            return
          }

          case "text-end":
            if (ctx.ignoredTextIDs.delete(value.id)) return
            if (!ctx.currentText || ctx.currentTextID !== value.id) return
            // oxlint-disable-next-line no-self-assign -- reactivity trigger
            ctx.currentText.text = ctx.currentText.text
            {
              const normalized = collapseWholeResponseReplay(ctx.currentText.text)
              if (normalized.reason) {
                ctx.currentText.text = normalized.text
                yield* noteTextNormalization({
                  reason: normalized.reason,
                  removedCharacters: normalized.removedCharacters,
                })
              }
            }
            ctx.currentText.text = (yield* plugin.trigger(
              "experimental.text.complete",
              {
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.id,
                partID: ctx.currentText.id,
              },
              { text: ctx.currentText.text },
            )).text
            // ML runtime postflight scores the completed draft. A requested
            // revision is queued for the bounded async revision fiber after
            // stream cleanup; learning capture runs only after that settles.
            if (
              flags.mlRuntime &&
              ctx.mlRequest &&
              ctx.mlOptimizer &&
              ctx.mlPreparation &&
              ctx.currentText.text.trim().length > 0
            ) {
              const originalResponse = ctx.currentText.text
              const evaluation = yield* Effect.sync(() =>
                ctx.mlOptimizer!.evaluate({
                  preparation: ctx.mlPreparation!,
                  response: originalResponse,
                  revisionAttempt: 0,
                }),
              ).pipe(Effect.orElseSucceed(() => null))
              if (evaluation) {
                ctx.mlInitialEvaluation ??= evaluation
                ctx.mlFinalEvaluation = evaluation
                ctx.mlFinalResponse = originalResponse
                ctx.mlEvaluatedTextID = ctx.currentText.id
                if (evaluation.recommendedDisposition === "revise") {
                  // Store correction data for next-turn injection (zero token cost).
                  // The quality gate's problems and hints will be injected into
                  // the next turn's system prompt so the model self-corrects.
                  ctx.mlDraftResponse = originalResponse
                  ctx.mlCorrection = {
                    problems: evaluation.problems,
                    hints: evaluation.quality.revisionHints,
                    score: evaluation.score,
                  }
                  yield* Effect.logDebug("arcana.ml postflight correction queued for next turn", {
                    sessionID: ctx.sessionID,
                    messageID: ctx.assistantMessage.id,
                    score: evaluation.score,
                    problems: evaluation.problems,
                  })
                }
                if (evaluation.recommendedDisposition === "ask_user") {
                  ctx.currentText.metadata = {
                    ...(ctx.currentText.metadata),
                    "arcana.ml": {
                      profileID: ctx.mlPreparation.calibrationProfileId,
                      verdict: evaluation.quality.verdict,
                      score: evaluation.score,
                      disposition: evaluation.recommendedDisposition,
                      shouldRevise: false,
                      shouldAskUser: true,
                      problems: evaluation.problems,
                    },
                  }
                }
              }
            }
            // Cross-turn loop detection: compute fingerprint and check for loops.
            // Store the warning on the processor context so the next turn's
            // preflight can inject it into the system prompt.
            if (flags.mlRuntime && ctx.mlRequest && ctx.currentText.text.trim().length > 0) {
              const fingerprint = computeResponseFingerprint(ctx.currentText.text)
              const loopResult = detectCrossTurnLoop(fingerprint, ctx.recentTurnFingerprints)
              ctx.recentTurnFingerprints.push({ hash: fingerprint, timestamp: Date.now() })
              if (ctx.recentTurnFingerprints.length > 5) {
                ctx.recentTurnFingerprints = ctx.recentTurnFingerprints.slice(-5)
              }
              if (loopResult.detected) {
                ctx.crossTurnLoopWarning = loopResult.warning ?? undefined
                yield* Effect.logWarning("arcana.ml cross-turn loop detected", {
                  sessionID: ctx.sessionID,
                  messageID: ctx.assistantMessage.id,
                  consecutive: loopResult.consecutiveSimilar,
                })
              }
              // Persist fingerprints to session metadata for cross-turn detection
              const currentSessionMeta = yield* session.get(ctx.sessionID).pipe(
                Effect.map((s) => (s.metadata ?? {}) as Record<string, unknown>),
                Effect.orElseSucceed(() => ({} as Record<string, unknown>)),
              )
              yield* session.setMetadata({
                sessionID: ctx.sessionID,
                metadata: {
                  ...currentSessionMeta,
                  [ML_METADATA.fingerprints]: ctx.recentTurnFingerprints,
                  ...(ctx.crossTurnLoopWarning
                    ? { [ML_METADATA.crossTurnLoopWarning]: ctx.crossTurnLoopWarning }
                    : {}),
                  ...(ctx.mlCorrection
                    ? { [ML_METADATA.correction]: ctx.mlCorrection }
                    : {}),
                },
              }).pipe(Effect.catch(() => Effect.void))
            }
            if (!ctx.assistantMessage.summary) {
              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
              if (mirrorAssistant) {
                yield* events.publish(SessionEvent.Text.Ended, {
                  sessionID: ctx.sessionID,
                  assistantMessageID: yield* currentV2AssistantMessage(),
                  text: ctx.currentText.text,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                  textID: value.id,
                })
              }
            }
            {
              const end = Date.now()
              ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
            }
            if (value.providerMetadata) {
              ctx.currentText.metadata = {
                ...(ctx.currentText.metadata),
                ...value.providerMetadata,
              }
            }
            yield* session.updatePart(ctx.currentText)
            ctx.completedTextIDs.add(value.id)
            ctx.currentText = undefined
            ctx.currentTextID = undefined
            ctx.textPersist = { lastAt: 0, count: 0 }
            return

          case "finish":
            return
        }
      })

      const cleanup = Effect.fn("SessionProcessor.cleanup")(function* () {
        if (ctx.snapshot) {
          const patch = yield* snapshot.patch(ctx.snapshot)
          if (patch.files.length) {
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: ctx.assistantMessage.id,
              sessionID: ctx.sessionID,
              type: "patch",
              hash: patch.hash,
              files: patch.files,
            })
          }
          ctx.snapshot = undefined
        }

        if (ctx.currentText) {
          const end = Date.now()
          ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
          yield* session.updatePart(ctx.currentText)
          ctx.currentText = undefined
          ctx.currentTextID = undefined
        }

        for (const part of Object.values(ctx.reasoningMap)) {
          const end = Date.now()
          yield* session.updatePart({
            ...part,
            time: { start: part.time.start ?? end, end },
          })
        }
        ctx.reasoningMap = {}

        yield* Effect.forEach(
          Object.values(ctx.toolcalls),
          (call) => Deferred.await(call.done).pipe(Effect.timeout("250 millis"), Effect.ignore),
          { concurrency: 4 },
        )

        for (const toolCallID of Object.keys(ctx.toolcalls)) {
          const match = yield* readToolCall(toolCallID)
          if (!match) continue
          const part = match.part
          const reason = aborted ? "session_cancelled" as const : "superseded" as const
          if (mirrorAssistant && match.call.assistantMessageID) {
            yield* events.publish(SessionEvent.Tool.Cancelled, {
              sessionID: ctx.sessionID,
              assistantMessageID: match.call.assistantMessageID,
              callID: toolCallID,
              reason,
              timestamp: DateTime.makeUnsafe(Date.now()),
            })
          }
          const end = Date.now()
          const metadata = "metadata" in part.state && isRecord(part.state.metadata) ? part.state.metadata : {}
          const start = "time" in part.state ? part.state.time.start : end
          yield* session.updatePart({
            ...part,
            state: {
              status: "cancelled",
              reason,
              input: part.state.input,
              title: "title" in part.state ? part.state.title : part.tool,
              output: "output" in part.state ? part.state.output : undefined,
              metadata: { ...metadata, interrupted: true },
              time: { start, end },
            },
          })
        }
        ctx.toolcalls = {}
        ctx.assistantMessage.time.completed = Date.now()
        yield* session.updateMessage(ctx.assistantMessage)
        // Safety net: ensure session transitions to idle on all exit paths.
        // Runner.onIdle is the primary path; this in Ensuing guarantees cleanup.
        yield* status.set(ctx.sessionID, { type: "idle" })
      })

      const halt = Effect.fn("SessionProcessor.halt")(function* (e: unknown) {
        yield* Effect.logError("process", {
          "session.id": input.sessionID,
          messageID: input.assistantMessage.id,
          error: errorMessage(e),
          stack: e instanceof Error ? e.stack : undefined,
        })
        const error = parse(e)
        yield* flushV2Fragments()
        if (SessionV1.ContextOverflowError.isInstance(error)) {
          if ((yield* config.get()).compaction?.auto === false && !ctx.assistantMessage.summary) {
            ctx.assistantMessage.error = error
            ctx.assistantMessage.finish = "error"
            yield* events.publish(Session.Event.Error, { sessionID: ctx.sessionID, error })
            yield* status.set(ctx.sessionID, { type: "idle" })
            return
          }
          ctx.needsCompaction = true
          yield* events.publish(Session.Event.Error, { sessionID: ctx.sessionID, error })
          return
        }
        if (!ctx.assistantMessage.summary) {
          // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
          if (mirrorAssistant) {
            yield* events.publish(SessionEvent.Step.Failed, {
              sessionID: ctx.sessionID,
              assistantMessageID: yield* ensureV2AssistantMessage(),
              error: {
                type: "unknown",
                message: errorMessage(e),
              },
              timestamp: DateTime.makeUnsafe(Date.now()),
            })
          }
        }
        if (retryCount >= SessionRetry.RETRY_MAX_ATTEMPTS && SessionV1.APIError.isInstance(error)) {
          ctx.assistantMessage.error = new SessionV1.APIError({
            ...error.data,
            metadata: {
              ...error.data.metadata,
              retryExhausted: "true",
              retryCount: String(retryCount),
            },
          }).toObject()
        } else {
          ctx.assistantMessage.error = error
        }
        // F-A7a: the generic halt path must close the message as terminal
        // ("error"), not leave it with finish=None — an orphaned
        // non-terminal message is a false-incomplete trace (D6 → error).
        ctx.assistantMessage.finish = "error"
        yield* events.publish(Session.Event.Error, {
          sessionID: ctx.assistantMessage.sessionID,
          error: ctx.assistantMessage.error,
        })
        yield* status.set(ctx.sessionID, { type: "idle" })
      })

      // REMOVED: attemptAsyncRevision — replaced by zero-cost next-turn correction injection.
      // Quality gate findings are persisted to session metadata and injected into
      // the next turn's system prompt as <arcana-correction>.

      const captureLearningExample = Effect.fn("SessionProcessor.captureLearningExample")(function* () {
        if (
          !ctx.mlStore ||
          !ctx.mlWorkspace ||
          !ctx.mlRequest ||
          !ctx.mlPreparation ||
          !ctx.mlInitialEvaluation ||
          !ctx.mlFinalEvaluation ||
          !ctx.mlFinalResponse
        ) return
        const learningSnapshot = {
          store: ctx.mlStore,
          workspace: ctx.mlWorkspace,
          request: ctx.mlRequest,
          preparation: ctx.mlPreparation,
          initialEvaluation: ctx.mlInitialEvaluation,
          finalEvaluation: ctx.mlFinalEvaluation,
          draftResponse: ctx.mlDraftResponse,
          finalResponse: ctx.mlFinalResponse,
          revisions: ctx.mlRevisionsUsed,
          startedAt: ctx.mlStartedAt,
          sessionId: ctx.sessionID,
          messageId: ctx.assistantMessage.id,
          provider: ctx.model.providerID,
          model: ctx.model.id,
          inputTokens: ctx.assistantMessage.tokens.input ?? 0,
          outputTokens: ctx.assistantMessage.tokens.output ?? 0,
        }
        yield* Effect.sync(() => {
          if (!learningSnapshot.store.resolveConsent(learningSnapshot.workspace).allowed) return
          const refs = learningSnapshot.store.references({
            workspace: learningSnapshot.workspace,
            sessionId: learningSnapshot.sessionId,
            messageId: learningSnapshot.messageId,
          })
          learningSnapshot.store.appendExample(
            learningSnapshot.workspace,
            createLearningExample({
              ...refs,
              runtime: "engine",
              intent: learningSnapshot.preparation.expectation.deliverable,
              provider: learningSnapshot.provider,
              model: learningSnapshot.model,
              request: learningSnapshot.request,
              draftResponse: learningSnapshot.draftResponse,
              finalResponse: learningSnapshot.finalResponse,
              preparation: learningSnapshot.preparation,
              initialEvaluation: learningSnapshot.initialEvaluation,
              finalEvaluation: learningSnapshot.finalEvaluation,
              revisions: learningSnapshot.revisions,
              usage: {
                inputTokens: learningSnapshot.inputTokens,
                outputTokens: learningSnapshot.outputTokens,
                toolTokens: 0,
                latencyMilliseconds: Math.max(0, Date.now() - learningSnapshot.startedAt),
              },
              evidenceTypes: [],
            }),
          )
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("arcana.ml learning capture failed", {
              error: errorMessage(error),
            }),
          ),
        )
      })

      const process = Effect.fn("SessionProcessor.process")(function* (streamInput: LLM.StreamInput) {
        yield* Effect.logInfo("process", {
          "session.id": input.sessionID,
          messageID: input.assistantMessage.id,
        })
        ctx.needsCompaction = false
        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true
        // Post-tool continuation marker: the degenerate-empty retry gate only
        // fires for follow-up calls whose context ends with tool results.
        ctx.followingToolResults =
          Array.isArray(streamInput.messages) && streamInput.messages.at(-1)?.role === "tool"
        const attemptBase = ctx.assistantMessage.latency?.attempts.length ?? 0

        return yield* Effect.gen(function* () {
          // Per-process attempt tracking reset — each drive iteration (LLM call) gets a fresh
          // attempt window. Retries within the same process reuse the same window until pruned.
          ctx.attemptTextPartIDs.clear()
          ctx.attemptReasoningPartIDs.clear()
          yield* Effect.gen(function* () {
            ctx.currentText = undefined
            ctx.currentTextID = undefined
            ctx.completedTextIDs.clear()
            ctx.ignoredTextIDs.clear()
            ctx.reasoningMap = {}
            ctx.mlRevisionsUsed = 0
            ctx.mlInitialEvaluation = undefined
            ctx.mlFinalEvaluation = undefined
            ctx.mlDraftResponse = undefined
            ctx.mlFinalResponse = undefined
            ctx.mlStartedAt = Date.now()
            yield* status.set(ctx.sessionID, { type: "busy" })
            const attempt = attemptBase + retryCount + 1
            const attemptStarted = Date.now()
            let firstEventAt: number | undefined
            let firstContentAt: number | undefined
            const contentEvents = new Set([
              "reasoning-start",
              "reasoning-delta",
              "text-start",
              "text-delta",
              "tool-input-start",
              "tool-input-delta",
              "tool-call",
            ])
            const observe = (event: LLMEvent) =>
              Effect.sync(() => {
                const now = Date.now()
                firstEventAt ??= now
                if (contentEvents.has(event.type)) firstContentAt ??= now
              })
            const finishAttempt = (outcome: SessionV1.ModelAttemptLatency["outcome"]) => {
              const end = Date.now()
              const record: SessionV1.ModelAttemptLatency = {
                attempt,
                startedAt: attemptStarted,
                firstEventMs: firstEventAt === undefined ? undefined : Math.max(0, firstEventAt - attemptStarted),
                firstContentMs:
                  firstContentAt === undefined ? undefined : Math.max(0, firstContentAt - attemptStarted),
                generationMs: firstEventAt === undefined ? undefined : Math.max(0, end - firstEventAt),
                totalMs: Math.max(0, end - attemptStarted),
                outcome: aborted ? "aborted" : outcome,
              }
              return writeAttemptLatency(record).pipe(
                Effect.andThen(
                  record.firstContentMs !== undefined && record.firstContentMs >= 8_000
                    ? Effect.logWarning("slow model first content", {
                        sessionID: ctx.sessionID,
                        messageID: ctx.assistantMessage.id,
                        providerID: ctx.model.providerID,
                        modelID: ctx.model.id,
                        variant: ctx.assistantMessage.variant,
                        attempt,
                        firstContentMs: record.firstContentMs,
                      })
                    : Effect.void,
                ),
              )
            }
            const effectiveStreamInput =
              ctx.mlPreparation?.effectiveDirective === "use_optimized_prompt" &&
              ctx.mlPreparation.promptAddendum.trim()
                ? {
                    ...streamInput,
                    // Keep the optimizer addendum in the trusted system
                    // channel. Putting it in `messages` triggers AI SDK's
                    // prompt-injection warning and makes the TUI console
                    // overlay render an internal diagnostic.
                    system: [...streamInput.system, ctx.mlPreparation.promptAddendum],
                  }
                : streamInput
            const stream = llm.stream(effectiveStreamInput)
            // openai-compatible >= 2.0.70 reports a stream that ends without a
            // finish reason as an ERROR instead of a step-finish with an
            // unmapped reason. Convert it into the same retryable
            // ResponseStreamError the degenerate-empty gate throws - but ONLY
            // for post-tool continuations, matching the gate's single-shot
            // carve-out (benign empty single-shot still ends as "stop").
            const streamWithErrorGate = stream.pipe(
              Stream.tap((event) => handleEvent(event)),
              Stream.catchCause((cause) => {
                const error = Cause.squash(cause)
                const message = errorMessage(error)
                const missingFinish = message.includes("ended without a finish reason")
                // openai-compatible >= 2.0.70 turns a stream that ends
                // without a finish reason into an error. Preserve the two
                // pre-upgrade behaviors: post-tool continuations retry via
                // the degenerate-empty gate; benign single-shot empty streams
                // end the turn quietly (drive layer owns them).
                if (missingFinish && ctx.followingToolResults) {
                  return Stream.fail(
                    new ProviderError.ResponseStreamError("Provider returned an empty response"),
                  )
                }
                if (missingFinish) return Stream.empty
                return Stream.failCause(cause)
              }),
            )

            yield* streamWithErrorGate.pipe(
              Stream.tap(observe),
              Stream.takeUntil(() => ctx.needsCompaction),
              Stream.runDrain,
              Effect.tap(() => finishAttempt("success")),
              Effect.tapError(() => finishAttempt("error")),
            )
          }).pipe(
            Effect.onInterrupt(() =>
              Effect.gen(function* () {
                aborted = true
                if (!ctx.assistantMessage.error) {
                  yield* halt(new DOMException("Aborted", "AbortError"))
                }
              }),
            ),
            Effect.catchCauseIf(
              (cause) => !Cause.hasInterruptsOnly(cause),
              (cause) => Effect.fail(Cause.squash(cause)),
            ),
            Effect.retry(
              SessionRetry.policy({
                provider: input.model.providerID,
                parse,
                set: (info) => {
                  retryCount = info.attempt
                  const failedAttempt = attemptBase + info.attempt
                  const latency = ctx.assistantMessage.latency
                  const recorded = latency?.attempts.find((item) => item.attempt === failedAttempt)
                  const retryWaitMs = Math.max(0, info.next - Date.now())
                  const markRetry = recorded
                    ? writeAttemptLatency({ ...recorded, outcome: "retry", retryWaitMs })
                    : Effect.void
                  // F-A3: prune the failed attempt's in-flight text/reasoning
                  // parts. On retry the stream regenerates the whole message
                  // under fresh PartIDs — leaving the half-written part durable
                  // would duplicate it. The in-flight set is by construction
                  // exactly this attempt's unfinished parts (reset at process
                  // start, created only by text-start/reasoning-start, removed
                  // at text-end/reasoning-end). Previously-completed text/
                  // reasoning blocks from the same attempt were not pruned,
                  // which left duplicate TextParts (two identical cards) when
                  // a retry fired after text-end but before step-finish.
                  const stale: SessionV1.Part[] = []
                  if (ctx.currentText) stale.push(ctx.currentText)
                  for (const part of Object.values(ctx.reasoningMap)) stale.push(part)
                  // Include already-completed text/reasoning parts from this attempt.
                  // Their provider IDs are in completedTextIDs/attemptReasoningPartIDs;
                  // we track DB IDs directly in attemptTextPartIDs/attemptReasoningPartIDs.
                  const staleDBIds = new Set<string>()
                  for (const id of ctx.attemptTextPartIDs) staleDBIds.add(id)
                  for (const id of ctx.attemptReasoningPartIDs) staleDBIds.add(id)
                  // Avoid double-removing the in-flight currentText/reasoning already in `stale`.
                  for (const p of stale) staleDBIds.delete(p.id)
                  const pruneInFlight = Effect.forEach(stale, (part) =>
                    session
                      .removePart({
                        sessionID: part.sessionID,
                        messageID: part.messageID,
                        partID: part.id,
                      })
                      .pipe(Effect.ignore),
                  )
                  const pruneCompleted = Effect.forEach([...staleDBIds], (partID) =>
                    session
                      .removePart({
                        sessionID: ctx.sessionID,
                        messageID: ctx.assistantMessage.id,
                        partID: partID as SessionV1.Part["id"],
                      })
                      .pipe(Effect.ignore),
                  )
                  const prune = pruneInFlight.pipe(Effect.andThen(() => pruneCompleted)).pipe(
                    Effect.andThen(
                      Effect.sync(() => {
                        ctx.attemptTextPartIDs.clear()
                        ctx.attemptReasoningPartIDs.clear()
                        // Also clear the per-attempt provider retry tracking so the next
                        // attempt doesn't incorrectly ignore its own text-start as "replayed".
                        // completedTextIDs holds provider-level IDs; dropping them ensures
                        // the regenerated text with fresh provider IDs is accepted.
                        ctx.completedTextIDs.clear()
                        ctx.ignoredTextIDs.clear()
                      }),
                    ),
                  )
                  // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
                  const event = mirrorAssistant
                    ? events.publish(SessionEvent.Retried, {
                        sessionID: ctx.sessionID,
                        attempt: info.attempt,
                        error: {
                          message: info.message,
                          isRetryable: true,
                        },
                        timestamp: DateTime.makeUnsafe(Date.now()),
                      })
                    : Effect.void
                  const retryPart: SessionV1.RetryPart = {
                    id: PartID.ascending(),
                    messageID: ctx.assistantMessage.id,
                    sessionID: ctx.assistantMessage.sessionID,
                    type: "retry",
                    attempt: info.attempt,
                    error: info.error,
                    time: { created: Date.now() },
                  }
                  return prune.pipe(
                    Effect.andThen(markRetry),
                    Effect.andThen(flushV2Fragments()),
                    Effect.andThen(session.updatePart(retryPart)),
                    Effect.andThen(event),
                    Effect.andThen(
                      status.set(ctx.sessionID, {
                        type: "retry",
                        attempt: info.attempt,
                        message: info.message,
                        action: info.action,
                        next: info.next,
                      }),
                    ),
                  )
                },
              }),
            ),
            Effect.catch(halt),
            Effect.ensuring(cleanup().pipe(Effect.catch(() => Effect.void))),
          )

          // Capture learning example (fire-and-forget, zero token cost)
          yield* captureLearningExample().pipe(
            Effect.catch(() => Effect.void),
            Effect.forkIn(scope),
          )

          const latency = ctx.assistantMessage.latency ?? { attempts: [] }
          ctx.assistantMessage.latency = {
            ...latency,
            totalMs: Math.max(0, Date.now() - ctx.assistantMessage.time.created),
            promptTokens:
              (ctx.assistantMessage.tokens.input ?? 0) +
              (ctx.assistantMessage.tokens.cache?.read ?? 0) +
              (ctx.assistantMessage.tokens.cache?.write ?? 0),
            cacheReadTokens: ctx.assistantMessage.tokens.cache?.read ?? 0,
            cacheWriteTokens: ctx.assistantMessage.tokens.cache?.write ?? 0,
          }
          yield* session.updateMessage(ctx.assistantMessage)

          if (ctx.needsCompaction) return "compact"
          if (ctx.blocked || ctx.assistantMessage.error) return "stop"
          return "continue"
        })
      })

      return {
        get message() {
          return ctx.assistantMessage
        },
        updateToolCall,
        completeToolCall,
        process,
        get crossTurnLoopWarning() {
          return ctx.crossTurnLoopWarning
        },
      } as Handle
      // CAST BOUNDARY #1 — Effect.fn generator return type
      // Upstream: Effect.fn wraps generator functions, but the return type inference
      // doesn't narrow to Handle's structural interface (create/updateToolCall/completeToolCall/process).
      // Runtime: the object genuinely satisfies Handle — verified by session lifecycle tests.
      // Removal condition: Effect.fn return type narrows to declared interface.
      // Scope: narrow (single object literal cast)
    })

    return Service.of({ create } as Interface)
    // CAST BOUNDARY #2 — Effect.fn wrapper loses dependency channel
    // Upstream: Effect.fn's return type doesn't preserve the full dependency
    // channel (EventStore, etc.) in the Interface type. The runtime object has
    // all required methods with correct signatures.
    // Runtime: verified by processor integration tests.
    // Removal condition: Effect.fn preserves dependency channels in return type.
    // Scope: narrow (single service object cast)
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Session.defaultLayer),
    Layer.provide(Snapshot.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(LLM.defaultLayer),
    Layer.provide(Permission.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(SessionSummary.defaultLayer),
    Layer.provide(SessionStatus.defaultLayer),
    Layer.provide(Image.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(RuntimeFlags.defaultLayer),
    Layer.provide(EventV2Bridge.defaultLayer),
    // EventStore requires Database — provide EventStore first so Database can
    // satisfy both SessionProcessor's direct use and EventStore's requirement.
    // Providing Database before EventStore leaves EventStore's Database dep open.
    Layer.provide(EventStore.layer),
    Layer.provide(Database.defaultLayer),
  ),
)

export const node = LayerNode.make(layer as any, [
  // CAST BOUNDARY #3 — Layer composition with EventStore dependency
  // Upstream: LayerNode.make expects Layer<R, E, never>, but layer.pipe(Layer.provide(...))
  // produces a Layer whose type parameter includes the EventStore dependency that's
  // been provided at construction time but not erased from the type.
  // Runtime: the layer is fully self-contained — all deps provided.
  // Removal condition: Layer.provide erases provided deps from type parameter.
  // Scope: narrow (just the first arg to LayerNode.make)
  Session.node,
  Config.node,
  Snapshot.node,
  Agent.node,
  LLM.node,
  Permission.node,
  Plugin.node,
  SessionSummary.node,
  SessionStatus.node,
  Image.node,
  EventV2Bridge.node,
  RuntimeFlags.node,
  Database.node,
  EventStore.node,
] as any)
  // CAST BOUNDARY #4 — LayerNode node array type
  // Upstream: LayerNode.make's second parameter expects an array of specific node types,
  // but the array includes nodes whose type signatures don't match exactly due to
  // the EventStore dependency threading through the layer graph.
  // Runtime: all nodes are valid LayerNode instances — verified by app startup.
  // Removal condition: LayerNode accepts heterogeneous node arrays, or deps are erased.
  // Scope: narrow (just the second arg to LayerNode.make)

export * as SessionProcessor from "./processor"
