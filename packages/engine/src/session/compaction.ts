import { LayerNode } from "@arcana/core/effect/layer-node"
import { SessionV1 } from "@arcana/core/v1/session"
import { ConfigV1 } from "@arcana/core/v1/config/config"
import { Session } from "./session"
import { SessionID, MessageID, PartID } from "./schema"
import { Provider } from "@/provider/provider"
import { MessageV2 } from "./message-v2"
import { Token } from "@/util/token"
import { SessionProcessor } from "./processor"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import { NotFoundError } from "@/storage/storage"

import { Effect, Layer, Context } from "effect"
import * as DateTime from "effect/DateTime"
import { InstanceState } from "@/effect/instance-state"
import { compactionPressure, isOverflow as overflow, tokenCount, thresholdPercent, usable } from "./overflow"
// usable used for hard-ceiling force path in maybeIntra
import { serviceUse } from "@arcana/core/effect/service-use"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionEvent } from "@arcana/core/session/event"
import { SessionMessage } from "@arcana/core/session/message"
import { ProviderV2 } from "@arcana/core/provider"
import { ModelV2 } from "@arcana/core/model"
import { EventV2 } from "@arcana/core/event"
import { buildPrompt } from "@arcana/core/session/compaction"
import { determineLevel, getPlan, type CompactionLevel, type CompactionPlan } from "./compaction-strategy"
import { estimateTokens, type MessageUsage } from "./context-meter"
import {
  classifyCompactionFailure,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  estimateTokensFromText,
  resolveCompactionOutcome,
} from "./compaction-failure"
import {
  buildContinuationText,
  dropCompleteTurnsFromFront,
  dropTrailingIncompleteAssistant,
  formatSummaryCarrier,
  prepareHeadForSummarization,
  toolPairSafeTailStart,
} from "./compaction-assemble"
import {
  compactSuccessMetadata,
  hysteresisTokensFromMessages,
  META_LAST_COMPACT_AT,
  META_PENDING_COMPACT_PASS,
  readLastCompactTokens,
  shouldInterCompact,
  usageForHysteresis,
  type InterCompactPass,
} from "./compaction-inter"
import { intraEnabled, shouldIntraCompact } from "./compaction-intra"

export const Event = {
  Compacted: EventV2.define({
    type: "session.compacted",
    schema: {
      sessionID: SessionID,
    },
  }),
}

export const PRUNE_MINIMUM = 20_000
export const PRUNE_PROTECT = 40_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const PRUNE_PROTECTED_TOOLS = ["skill"]
const DEFAULT_TAIL_TURNS = 2
const MIN_PRESERVE_RECENT_TOKENS = 2_000
const MAX_PRESERVE_RECENT_TOKENS = 8_000
const DEFAULT_SUMMARY_MAX_INPUT_TOKENS = 64_000
const COMPACTION_PROMPT_RESERVE_TOKENS = 6_000
const COVERAGE_INDEX_MAX_CHARS = 16_000
type Turn = {
  start: number
  end: number
  id: MessageID
}

type Tail = {
  start: number
  id: MessageID
}

type CompletedCompaction = {
  userIndex: number
  assistantIndex: number
  summary: string | undefined
}

function summaryText(message: SessionV1.WithParts) {
  const text = message.parts
    .filter((part): part is SessionV1.TextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()
  return text || undefined
}

/**
 * When a legacy session is already larger than the bounded summarizer request,
 * retain a compact, deterministic index across the omitted head. The model
 * gets chronological IDs, roles, text excerpts and tool outcomes up to the
 * explicit index budget even if the detailed suffix must be budgeted. Full
 * messages remain durable in the session/proof stores.
 */
export function buildCompactionCoverageIndex(
  messages: SessionV1.WithParts[],
  maxChars = COVERAGE_INDEX_MAX_CHARS,
): string {
  if (!messages.length || maxChars <= 0) return ""
  const lines = ["Earlier compacted-context coverage index (chronological):"]
  let used = lines[0]!.length
  for (const message of messages) {
    const text = message.parts
      .filter((part): part is SessionV1.TextPart => part.type === "text")
      .map((part) => part.text.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ")
    const tools = message.parts
      .filter((part): part is SessionV1.ToolPart => part.type === "tool")
      .map((part) => `${part.tool}:${part.state.status}`)
      .join(",")
    const detail = [text.slice(0, 220), tools ? `tools=${tools.slice(0, 120)}` : ""].filter(Boolean).join(" | ")
    const prefix = `- ${message.info.id} ${message.info.role}`
    const line = detail ? `${prefix} | ${detail}` : prefix
    if (used + line.length + 1 > maxChars) {
      const remaining = messages.length - (lines.length - 1)
      const marker = `- … ${remaining} additional message(s); full records remain available by message ID in session history.`
      if (used + marker.length + 1 <= maxChars) lines.push(marker)
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join("\n")
}

function completedCompactions(messages: SessionV1.WithParts[]) {
  const users = new Map<MessageID, number>()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    if (!msg.parts.some((part) => part.type === "compaction")) continue
    users.set(msg.info.id, i)
  }

  return messages.flatMap((msg, assistantIndex): CompletedCompaction[] => {
    if (msg.info.role !== "assistant") return []
    if (!msg.info.summary || !msg.info.finish || msg.info.error) return []
    const userIndex = users.get(msg.info.parentID)
    if (userIndex === undefined) return []
    return [{ userIndex, assistantIndex, summary: summaryText(msg) }]
  })
}

function preserveRecentBudget(input: { cfg: ConfigV1.Info; model: Provider.Model }) {
  return (
    input.cfg.compaction?.preserve_recent_tokens ??
    Math.min(MAX_PRESERVE_RECENT_TOKENS, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
  )
}

function turns(messages: SessionV1.WithParts[]) {
  const result: Turn[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    if (msg.parts.some((part) => part.type === "compaction")) continue
    result.push({
      start: i,
      end: messages.length,
      id: msg.info.id,
    })
  }
  for (let i = 0; i < result.length - 1; i++) {
    result[i].end = result[i + 1].start
  }
  return result
}

function splitTurn(input: {
  messages: SessionV1.WithParts[]
  turn: Turn
  model: Provider.Model
  budget: number
  estimate: (input: { messages: SessionV1.WithParts[]; model: Provider.Model }) => Effect.Effect<number>
}) {
  return Effect.gen(function* () {
    if (input.budget <= 0) return undefined
    if (input.turn.end - input.turn.start <= 1) return undefined
    for (let start = input.turn.start + 1; start < input.turn.end; start++) {
      const size = yield* input.estimate({
        messages: input.messages.slice(start, input.turn.end),
        model: input.model,
      })
      if (size > input.budget) continue
      return {
        start,
        id: input.messages[start]!.info.id,
      } satisfies Tail
    }
    return undefined
  })
}

export interface Interface {
  readonly isOverflow: (input: {
    tokens: SessionV1.Assistant["tokens"]
    model: Provider.Model
  }) => Effect.Effect<boolean>
  readonly prune: (input: { sessionID: SessionID }) => Effect.Effect<void>
  readonly process: (input: {
    parentID: MessageID
    messages: SessionV1.WithParts[]
    sessionID: SessionID
    auto: boolean
    overflow?: boolean
    /**
     * Provider usage total to seed hysteresis on successful apply (M1).
     * Prefer tokenCount of the assistant that made context hot.
     */
    hysteresisTokens?: number
  }) => Effect.Effect<"continue" | "stop">
  readonly create: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
    auto: boolean
    overflow?: boolean
    /** Optional pass tag applied when process succeeds (P3/P4). */
    pass?: InterCompactPass
  }) => Effect.Effect<{ messageID: MessageID }>
  /**
   * P3: between-turn compact when context is still hot after/before a user turn.
   * Creates + processes a full-replace compact with hysteresis. Returns true if a
   * compact was attempted and applied.
   */
  readonly maybeInter: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
    tokens: SessionV1.Assistant["tokens"]
    reason: "preflight" | "post_turn"
  }) => Effect.Effect<boolean>
  /**
   * P4: mid-loop compact decision + schedule (create only). Returns true if a
   * compaction task was enqueued for the next loop iteration.
   */
  readonly maybeIntra: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
    tokens: SessionV1.Assistant["tokens"]
    step: number
  }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/SessionCompaction") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const session = yield* Session.Service
    const agents = yield* Agent.Service
    const plugin = yield* Plugin.Service
    const processors = yield* SessionProcessor.Service
    const provider = yield* Provider.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service

    const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input: {
      tokens: SessionV1.Assistant["tokens"]
      model: Provider.Model
    }) {
      return overflow({
        cfg: yield* config.get(),
        tokens: input.tokens,
        model: input.model,
        outputTokenMax: flags.outputTokenMax,
      })
    })

    const estimate = Effect.fn("SessionCompaction.estimate")(function* (input: {
      messages: SessionV1.WithParts[]
      model: Provider.Model
    }) {
      const msgs = yield* MessageV2.toModelMessagesEffect(input.messages, input.model)
      return Token.estimate(JSON.stringify(msgs))
    })

    const select = Effect.fn("SessionCompaction.select")(function* (input: {
      messages: SessionV1.WithParts[]
      cfg: ConfigV1.Info
      model: Provider.Model
    }) {
      const limit = input.cfg.compaction?.tail_turns ?? DEFAULT_TAIL_TURNS
      if (limit <= 0) return { head: input.messages, tail_start_id: undefined }
      const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model })
      const all = turns(input.messages)
      if (!all.length) return { head: input.messages, tail_start_id: undefined }
      const recent = all.slice(-limit)
      const sizes = yield* Effect.forEach(
        recent,
        (turn) =>
          estimate({
            messages: input.messages.slice(turn.start, turn.end),
            model: input.model,
          }),
        { concurrency: 1 },
      )

      let total = 0
      let keep: Tail | undefined
      for (let i = recent.length - 1; i >= 0; i--) {
        const turn = recent[i]!
        const size = sizes[i]
        if (total + size <= budget) {
          total += size
          keep = { start: turn.start, id: turn.id }
          continue
        }
        const remaining = budget - total
        const split = yield* splitTurn({
          messages: input.messages,
          turn,
          model: input.model,
          budget: remaining,
          estimate,
        })
        if (split) keep = split
        else if (!keep) {
          yield* Effect.logInfo("tail fallback", { budget, size, total })
        }
        break
      }

      if (!keep || keep.start === 0) return { head: input.messages, tail_start_id: undefined }

      // P2: tool-pair-safe tail cut (skip incomplete assistants; allow completed split-turn cuts).
      const safe = toolPairSafeTailStart(input.messages, keep.start)
      if (!safe || safe.start === 0) return { head: input.messages, tail_start_id: undefined }

      const head = dropTrailingIncompleteAssistant(input.messages.slice(0, safe.start))
      return {
        head,
        tail_start_id: safe.id,
      }
    })

    // goes backwards through parts until there are PRUNE_PROTECT tokens worth of tool
    // calls, then erases output of older tool calls to free context space
    const prune = Effect.fn("SessionCompaction.prune")(function* (input: { sessionID: SessionID }) {
      const cfg = yield* config.get()
      if (!cfg.compaction?.prune) return
      yield* Effect.logInfo("pruning")

      const msgs = yield* session
        .messages({ sessionID: input.sessionID })
        .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
      if (!msgs) return

      let total = 0
      let pruned = 0
      const toPrune: SessionV1.ToolPart[] = []
      let turns = 0

      loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
        const msg = msgs[msgIndex]
        if (msg.info.role === "user") turns++
        if (turns < 2) continue
        if (msg.info.role === "assistant" && msg.info.summary) break loop
        for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
          const part = msg.parts[partIndex]
          if (part.type !== "tool") continue
          if (part.state.status !== "completed") continue
          if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue
          if (part.state.time.compacted) break loop
          const estimate = Token.estimate(part.state.output)
          total += estimate
          if (total <= PRUNE_PROTECT) continue
          pruned += estimate
          toPrune.push(part)
        }
      }

      yield* Effect.logInfo("found", { pruned, total })
      if (pruned > PRUNE_MINIMUM) {
        for (const part of toPrune) {
          if (part.state.status === "completed") {
            part.state.time.compacted = Date.now()
            yield* session.updatePart(part)
          }
        }
        yield* Effect.logInfo("pruned", { count: toPrune.length })
      }
    })

    const processCompaction = Effect.fn("SessionCompaction.process")(function* (input: {
      parentID: MessageID
      messages: SessionV1.WithParts[]
      sessionID: SessionID
      auto: boolean
      overflow?: boolean
      hysteresisTokens?: number
    }) {
      const parent = input.messages.findLast((m) => m.info.id === input.parentID)
      if (!parent || parent.info.role !== "user") {
        throw new Error(`Compaction parent must be a user message: ${input.parentID}`)
      }
      const userMessage = parent.info
      const compactionPart = parent.parts.find((part): part is SessionV1.CompactionPart => part.type === "compaction")

      // P5 M1: clear TUI compacting on every process exit (success or fail).
      // Compaction.Ended clears session_compacting; Compacted + hysteresis only on apply.
      let applied = false
      let endText = ""
      let endRecent = ""
      let tokensBeforeForHyst = 0

      const finishCompactingUi = Effect.gen(function* () {
        yield* events
          .publish(SessionEvent.Compaction.Ended, {
            sessionID: input.sessionID,
            messageID: SessionMessage.ID.make(input.parentID),
            timestamp: DateTime.makeUnsafe(Date.now()),
            reason: input.auto ? "auto" : "manual",
            text: endText,
            recent: endRecent,
          })
          .pipe(Effect.catch(() => Effect.void))

        if (!applied) return

        yield* events.publish(Event.Compacted, { sessionID: input.sessionID }).pipe(Effect.catch(() => Effect.void))
        const sess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!sess) return
        const meta = (sess.metadata ?? {}) as Record<string, unknown>
        const pending = meta[META_PENDING_COMPACT_PASS]
        const pass: InterCompactPass =
          pending === "inter" || pending === "intra" || pending === "inline" || pending === "manual"
            ? pending
            : input.auto
              ? "inline"
              : "manual"
        const sourceTokens =
          typeof input.hysteresisTokens === "number" && Number.isFinite(input.hysteresisTokens)
            ? input.hysteresisTokens
            : (hysteresisTokensFromMessages(input.messages) ?? tokensBeforeForHyst)
        const resultTokens = Math.max(0, Token.estimate(`${endText}\n${endRecent}`))
        const next = compactSuccessMetadata(meta, { sourceTokens, resultTokens, pass })
        delete next[META_PENDING_COMPACT_PASS]
        yield* session.setMetadata({
          sessionID: input.sessionID,
          metadata: next,
        })
      })

      return yield* Effect.gen(function* () {
      let messages = input.messages
      let replay:
        | {
            info: SessionV1.User
            parts: SessionV1.Part[]
          }
        | undefined
      if (input.overflow) {
        const idx = input.messages.findIndex((m) => m.info.id === input.parentID)
        for (let i = idx - 1; i >= 0; i--) {
          const msg = input.messages[i]
          if (msg.info.role === "user" && !msg.parts.some((p) => p.type === "compaction")) {
            replay = { info: msg.info, parts: msg.parts }
            messages = input.messages.slice(0, i)
            break
          }
        }
        const hasContent =
          replay && messages.some((m) => m.info.role === "user" && !m.parts.some((p) => p.type === "compaction"))
        if (!hasContent) {
          replay = undefined
          messages = input.messages
        }
      }

      const agent = yield* agents.get("compaction")
      const model = agent.model
        ? yield* provider.getModel(agent.model.providerID, agent.model.modelID).pipe(Effect.orDie)
        : yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID).pipe(Effect.orDie)
      const cfg = yield* config.get()
      const history = compactionPart && messages.at(-1)?.info.id === input.parentID ? messages.slice(0, -1) : messages
      const prior = completedCompactions(history)
      const hidden = new Set(prior.flatMap((item) => [item.userIndex, item.assistantIndex]))
      const previousSummary = prior.at(-1)?.summary
      const selected = yield* select({
        messages: history.filter((_, index) => !hidden.has(index)),
        cfg,
        model,
      })
      // Cap each summarizer request independently from the provider's advertised
      // context window. Huge-context models can still have very poor TTFT for a
      // 100k+ prompt, which is exactly what performance compaction must avoid.
      const contextLimit = model.limit.context
      const summaryLimit = cfg.compaction?.summary_max_input_tokens ?? DEFAULT_SUMMARY_MAX_INPUT_TOKENS
      const providerBudget = Math.max(2_000, Math.floor(contextLimit * 0.75) - COMPACTION_PROMPT_RESERVE_TOKENS)
      const headBudget = Math.max(
        2_000,
        Math.min(providerBudget, summaryLimit - COMPACTION_PROMPT_RESERVE_TOKENS),
      )
      // P2 full-replace prep: budget-cap head, drop incomplete trailing tools, truncate tool dumps.
      const preparedHead = prepareHeadForSummarization(
        dropTrailingIncompleteAssistant(selected.head),
        TOOL_OUTPUT_MAX_CHARS,
      )
      const unboundedEstimate = estimateSessionTokens(preparedHead)
      const cappedHead = compactWithBudget(preparedHead, headBudget)
      const coverageIndex = unboundedEstimate > headBudget
        ? buildCompactionCoverageIndex(preparedHead)
        : ""
      if (unboundedEstimate > headBudget) {
        yield* Effect.logInfo("compaction head truncated", {
          before: preparedHead.length,
          after: cappedHead.length,
          budget: headBudget,
          unboundedEstimate,
          coverageIndexChars: coverageIndex.length,
        })
      }

      // Allow plugins to inject context or replace compaction prompt.
      const compacting = yield* plugin.trigger(
        "experimental.session.compacting",
        { sessionID: input.sessionID },
        { context: [], prompt: undefined },
      )
      const compactingContext = coverageIndex
        ? [...compacting.context, coverageIndex]
        : compacting.context
      const nextPrompt = compacting.prompt ?? buildPrompt({ previousSummary, context: compactingContext })
      const msgs = structuredClone(cappedHead)
      yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })
      let modelMessages = yield* MessageV2.toModelMessagesEffect(msgs, model, {
        stripMedia: true,
        toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS,
      })

      // Final safety net: keep JSON payload under ~950KB so it clears ~1MB body limits.
      // Drop complete turns from the front only (tool-pair safe), not arbitrary slices.
      const MAX_COMPACTION_JSON_CHARS = 950_000
      let safetyPass = 0
      let serializedLength = JSON.stringify(modelMessages).length
      while (serializedLength > MAX_COMPACTION_JSON_CHARS && msgs.length > 2 && safetyPass < 10) {
        safetyPass++
        const dropCount = Math.max(1, Math.ceil(msgs.length * 0.1))
        const nextMsgs = dropCompleteTurnsFromFront(msgs, dropCount)
        if (nextMsgs.length >= msgs.length) {
          // Could not drop a full turn — fall back to dropping one message from the front.
          msgs.splice(0, 1)
        } else {
          msgs.length = 0
          msgs.push(...nextMsgs)
        }
        modelMessages = yield* MessageV2.toModelMessagesEffect(msgs, model, {
          stripMedia: true,
          toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS,
        })
        serializedLength = JSON.stringify(modelMessages).length
        yield* Effect.logInfo("compaction JSON safety truncation", {
          pass: safetyPass,
          remaining: modelMessages.length,
        })
      }
      const tailIndex = selected.tail_start_id
        ? history.findIndex((message) => message.info.id === selected.tail_start_id)
        : -1
      const recent =
        tailIndex < 0
          ? ""
          : JSON.stringify(
              yield* MessageV2.toModelMessagesEffect(history.slice(tailIndex), model, {
                stripMedia: true,
                toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS,
              }),
            )
      endRecent = recent
      const ctx = yield* InstanceState.context
      const msg: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: input.parentID,
        sessionID: input.sessionID,
        mode: "compaction",
        agent: "compaction",
        variant: userMessage.model.variant,
        summary: true,
        path: {
          cwd: ctx.directory,
          root: ctx.worktree,
        },
        cost: 0,
        tokens: {
          output: 0,
          input: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        modelID: model.id,
        providerID: model.providerID,
        time: {
          created: Date.now(),
        },
      }
      yield* session.updateMessage(msg)

      const processPayload = {
        user: userMessage,
        agent,
        sessionID: input.sessionID,
        tools: {},
        system: [] as string[],
        messages: [
          ...modelMessages,
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: nextPrompt }],
          },
        ],
        model,
      }

      // P1: retry transient compaction LLM failures; never throw out of auto compact.
      let processor = yield* processors.create({
        assistantMessage: msg,
        sessionID: input.sessionID,
        model,
      })
      let result: "continue" | "stop" | "compact" = "stop"
      let lastFailureMessage: string | undefined
      for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
        const attemptResult = yield* processor.process(processPayload).pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catch((cause: unknown) =>
            Effect.succeed({
              ok: false as const,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
          ),
        )

        if (!attemptResult.ok) {
          lastFailureMessage = attemptResult.message
          const kind = classifyCompactionFailure({ message: lastFailureMessage })
          yield* Effect.logWarning("compaction process threw", {
            attempt,
            kind,
            message: lastFailureMessage,
          })
          if (kind === "transient" && attempt < DEFAULT_MAX_ATTEMPTS) {
            yield* Effect.sleep(`${DEFAULT_RETRY_DELAY_MS} millis`)
            // Fresh assistant message for a clean retry surface
            const retryMsg: SessionV1.Assistant = {
              ...msg,
              id: MessageID.ascending(),
              time: { created: Date.now() },
              tokens: { output: 0, input: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              cost: 0,
              error: undefined,
              finish: undefined,
            }
            yield* session.updateMessage(retryMsg)
            processor = yield* processors.create({
              assistantMessage: retryMsg,
              sessionID: input.sessionID,
              model,
            })
            continue
          }
          processor.message.error = new SessionV1.AbortedError({
            message: lastFailureMessage ?? "compaction failed",
          }).toObject()
          processor.message.finish = "error"
          yield* session.updateMessage(processor.message)
          result = "stop"
          break
        }

        result =
          attemptResult.value === "compact" || attemptResult.value === "continue" || attemptResult.value === "stop"
            ? attemptResult.value
            : "stop"

        // Overflow during summary call — not retryable as same payload
        if (result === "compact") break

        // Quality check happens once after the loop (no multi-second retry on
        // degenerate text — only thrown/transient process errors retry above).
        break
      }

      if (result === "compact") {
        processor.message.error = new SessionV1.ContextOverflowError({
          message: replay
            ? "Conversation history too large to compact - exceeds model context limit"
            : "Session too large to compact - context exceeds model limit even after stripping media",
        }).toObject()
        processor.message.finish = "error"
        yield* session.updateMessage(processor.message)
        // Clear pending pass so inter/intra hysteresis is not stuck on a failed attempt
        const overflowSess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (overflowSess?.metadata && META_PENDING_COMPACT_PASS in (overflowSess.metadata as object)) {
          const cleared = { ...((overflowSess.metadata ?? {}) as Record<string, unknown>) }
          delete cleared[META_PENDING_COMPACT_PASS]
          yield* session.setMetadata({ sessionID: input.sessionID, metadata: cleared })
        }
        // P1: auto soft-fail — keep the main agent loop alive
        // (finishCompactingUi still clears TUI compacting via Compaction.Ended)
        if (input.auto) {
          yield* Effect.logWarning("auto compaction soft-failed (overflow during summary)")
          return "continue"
        }
        return "stop"
      }

      if (compactionPart && selected.tail_start_id && compactionPart.tail_start_id !== selected.tail_start_id) {
        yield* session.updatePart({
          ...compactionPart,
          tail_start_id: selected.tail_start_id,
        })
      }

      let summary = summaryText(
        (yield* session.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)).find(
          (item) => item.info.id === processor.message.id,
        ) ?? {
          info: processor.message,
          parts: [],
        },
      )
      const tokensBefore = estimateTokensFromText(JSON.stringify(modelMessages))
      tokensBeforeForHyst = tokensBefore
      const tokensAfter = estimateTokensFromText(summary ?? "")
      const outcome = resolveCompactionOutcome({
        auto: input.auto,
        hasError: Boolean(processor.message.error),
        summary,
        tokensBefore,
        tokensAfter,
      })

      if (outcome !== "apply") {
        if (!processor.message.error) {
          processor.message.error = new SessionV1.AbortedError({
            message: lastFailureMessage ?? "compaction summary rejected (degenerate or insufficient reduction)",
          }).toObject()
          processor.message.finish = "error"
          yield* session.updateMessage(processor.message)
        }
        // Clear pending pass so hysteresis is not stuck on a failed attempt
        const failedSess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (failedSess?.metadata && META_PENDING_COMPACT_PASS in (failedSess.metadata as object)) {
          const cleared = { ...((failedSess.metadata ?? {}) as Record<string, unknown>) }
          delete cleared[META_PENDING_COMPACT_PASS]
          yield* session.setMetadata({ sessionID: input.sessionID, metadata: cleared })
        }
        yield* Effect.logWarning("compaction not applied", {
          auto: input.auto,
          outcome,
          summaryLength: summary?.length ?? 0,
        })
        // Soft-fail auto: session loop continues with uncompacted history
        // (finishCompactingUi still clears TUI compacting via Compaction.Ended)
        return input.auto ? "continue" : "stop"
      }

      // N1: frame the stored summary so the model treats it as a full-replace carrier.
      if (summary) {
        const wrapped = formatSummaryCarrier(summary)
        if (wrapped !== summary) {
          const summaryMsg = (yield* session.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)).find(
            (item) => item.info.id === processor.message.id,
          )
          const textParts = summaryMsg?.parts.filter((part): part is SessionV1.TextPart => part.type === "text") ?? []
          if (textParts.length > 0) {
            yield* session.updatePart({ ...textParts[0]!, text: wrapped })
            for (const extra of textParts.slice(1)) {
              if (extra.text.trim()) {
                yield* session.updatePart({ ...extra, text: "" })
              }
            }
          }
          summary = wrapped
        }
      }
      endText = summary ?? ""
      applied = true

      if (result === "continue" && input.auto) {
        if (replay) {
          const original = replay.info
          const replayMsg = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: input.sessionID,
            time: { created: Date.now() },
            agent: original.agent,
            model: original.model,
            format: original.format,
            tools: original.tools,
            system: original.system,
          })
          for (const part of replay.parts) {
            if (part.type === "compaction") continue
            const replayPart =
              part.type === "file" && MessageV2.isMedia(part.mime)
                ? { type: "text" as const, text: `[Attached ${part.mime}: ${part.filename ?? "file"}]` }
                : part
            yield* session.updatePart({
              ...replayPart,
              id: PartID.ascending(),
              messageID: replayMsg.id,
              sessionID: input.sessionID,
            })
          }
        }

        if (!replay) {
          const info = yield* provider.getProvider(userMessage.model.providerID)
          if (
            (yield* plugin.trigger(
              "experimental.compaction.autocontinue",
              {
                sessionID: input.sessionID,
                agent: userMessage.agent,
                model: yield* provider
                  .getModel(userMessage.model.providerID, userMessage.model.modelID)
                  .pipe(Effect.orDie),
                provider: {
                  source: info.source,
                  info,
                  options: info.options,
                },
                message: userMessage,
                overflow: input.overflow === true,
              },
              { enabled: true },
            )).enabled
          ) {
            const continueMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            // P2: structured continuation after full-replace (goal-aware, overflow-aware).
            const sessionInfo = yield* session.get(input.sessionID).pipe(
              Effect.catch(() => Effect.succeed(undefined as Session.Info | undefined)),
            )
            const focus =
              sessionInfo && typeof sessionInfo.title === "string" && !Session.isDefaultTitle(sessionInfo.title)
                ? sessionInfo.title
                : undefined
            const text = buildContinuationText({ overflow: input.overflow === true, focus })
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              // Internal marker for auto-compaction followups so provider plugins
              // can distinguish them from manual post-compaction user prompts.
              // This is not a stable plugin contract and may change or disappear.
              metadata: { compaction_continue: true },
              synthetic: true,
              text,
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            })
          }
        }
      }

      // UI clear + hysteresis handled by finishCompactingUi (Effect.ensuring).
      return result === "continue" ? "continue" : input.auto ? "continue" : "stop"
      }).pipe(Effect.ensuring(finishCompactingUi))
    })

    const create = Effect.fn("SessionCompaction.create")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      auto: boolean
      overflow?: boolean
      pass?: InterCompactPass
    }) {
      if (input.pass) {
        const sess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (sess) {
          yield* session.setMetadata({
            sessionID: input.sessionID,
            metadata: {
              ...((sess.metadata ?? {}) as Record<string, unknown>),
              [META_PENDING_COMPACT_PASS]: input.pass,
            },
          })
        }
      }
      const msg = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
        overflow: input.overflow,
      })
      // Always emit for TUI compacting indicator (P5); experimental gate no longer required.
      yield* events.publish(SessionEvent.Compaction.Started, {
        sessionID: input.sessionID,
        messageID: SessionMessage.ID.make(msg.id),
        timestamp: DateTime.makeUnsafe(Date.now()),
        reason: input.auto ? "auto" : "manual",
      }).pipe(Effect.catch(() => Effect.void))
      return { messageID: msg.id }
    })

    /**
     * P3 inter-turn: if still hot and hysteresis allows, create+process a full-replace
     * compact before the next sample or after the turn ends.
     */
    const maybeInter = Effect.fn("SessionCompaction.maybeInter")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      tokens: SessionV1.Assistant["tokens"]
      reason: "preflight" | "post_turn"
    }) {
      const cfg = yield* config.get()
      if (cfg.compaction?.auto === false) return false

      const model = yield* provider
        .getModel(input.model.providerID, input.model.modelID)
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!model) return false

      // Same metric for pressure decision + hysteresis store.
      const count = usageForHysteresis(input.tokens)
      const pressure = compactionPressure({
        cfg,
        tokens: input.tokens,
        model,
        outputTokenMax: flags.outputTokenMax,
      })
      if (!pressure.hot) return false

      const sess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!sess) return false
      const meta = (sess.metadata ?? {}) as Record<string, unknown>
      const lastTokens = readLastCompactTokens(meta)
      // alreadyHot: percent gate already satisfied via isOverflow (hard ceiling OK).
      if (
        !shouldInterCompact({
          count,
          context: pressure.limit,
          thresholdPercent: thresholdPercent(cfg),
          lastCompactTokens: lastTokens,
          alreadyHot: true,
        })
      ) {
        yield* Effect.logInfo("inter compact skipped (hysteresis)", {
          reason: input.reason,
          count,
          lastTokens,
          pressure: pressure.reason,
          sessionID: input.sessionID,
        })
        return false
      }

      yield* Effect.logInfo("inter compact starting", {
        reason: input.reason,
        count,
        context: model.limit.context,
        pressure: pressure.reason,
        pressureLimit: pressure.limit,
        sessionID: input.sessionID,
      })

      const beforeAt = meta[META_LAST_COMPACT_AT]
      const { messageID } = yield* create({
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        auto: true,
        overflow: false,
        pass: "inter",
      })

      const messages = yield* session.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      const result = yield* processCompaction({
        parentID: messageID,
        messages,
        sessionID: input.sessionID,
        auto: true,
        overflow: false,
        hysteresisTokens: count,
      })

      const after = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const m = (after?.metadata ?? {}) as Record<string, unknown>
      const afterAt = m[META_LAST_COMPACT_AT]
      const applied = result === "continue" && afterAt !== undefined && afterAt !== beforeAt
      if (applied) {
        yield* Effect.logInfo("inter compact applied", { reason: input.reason, count })
        return true
      }
      yield* Effect.logWarning("inter compact did not apply", { reason: input.reason, result })
      return false
    })

    /**
     * P4 intra: mid-loop schedule. Creates a compaction task for the next loop
     * iteration (same user turn) when steps/tokens/threshold/hysteresis allow.
     */
    const maybeIntra = Effect.fn("SessionCompaction.maybeIntra")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      tokens: SessionV1.Assistant["tokens"]
      step: number
    }) {
      const cfg = yield* config.get()
      if (!intraEnabled(cfg.compaction)) return false

      const model = yield* provider
        .getModel(input.model.providerID, input.model.modelID)
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!model) return false

      const count = usageForHysteresis(input.tokens)
      const pressure = compactionPressure({
        cfg,
        tokens: input.tokens,
        model,
        outputTokenMax: flags.outputTokenMax,
      })
      if (!pressure.hot) return false

      const sess = yield* session.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!sess) return false
      const meta = (sess.metadata ?? {}) as Record<string, unknown>
      const lastTokens = readLastCompactTokens(meta)

      // Hard usable breach: only relaxes min steps (to 2), never hysteresis (P4 M1/M2).
      const hardBreach =
        count >=
        usable({
          cfg,
          model,
          outputTokenMax: flags.outputTokenMax,
        })
      // alreadyHot: isOverflow already covered percent OR usable ceiling.
      const policyOk = shouldIntraCompact({
        step: input.step,
        count,
        context: pressure.limit,
        thresholdPercent: thresholdPercent(cfg),
        minSteps: cfg.compaction?.intra_min_steps,
        minCompactableTokens: cfg.compaction?.intra_min_tokens,
        lastCompactTokens: lastTokens,
        hardBreach,
        alreadyHot: true,
        enabled: true,
      })
      if (!policyOk) {
        yield* Effect.logInfo("intra compact skipped", {
          step: input.step,
          count,
          lastTokens,
          hardBreach,
          pressure: pressure.reason,
          sessionID: input.sessionID,
        })
        return false
      }

      yield* Effect.logInfo("intra compact scheduled", {
        step: input.step,
        count,
        context: model.limit.context,
        hardBreach,
        pressure: pressure.reason,
        pressureLimit: pressure.limit,
        sessionID: input.sessionID,
      })

      yield* create({
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        auto: true,
        overflow: false,
        pass: "intra",
      })
      return true
    })

    return Service.of({
      isOverflow,
      prune,
      process: processCompaction,
      create,
      maybeInter,
      maybeIntra,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(SessionProcessor.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(RuntimeFlags.defaultLayer),
    Layer.provide(EventV2Bridge.defaultLayer),
  ),
)

export const node = LayerNode.make(layer, [
  Config.node,
  Session.node,
  Agent.node,
  Plugin.node,
  SessionProcessor.node,
  Provider.node,
  EventV2Bridge.node,
  RuntimeFlags.node,
])

// ---------------------------------------------------------------------------
// Smart context management helpers
// ---------------------------------------------------------------------------

function estimateSessionTokens(messages: SessionV1.WithParts[]): number {
  let total = 0
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") {
        total += estimateTokens(part.text)
      } else if (part.type === "tool") {
        if (typeof part.state.input === "string") total += estimateTokens(part.state.input)
        else total += estimateTokens(JSON.stringify(part.state.input))
        if (part.state.status === "completed") {
          if (typeof part.state.output === "string") total += estimateTokens(part.state.output)
          else total += estimateTokens(JSON.stringify(part.state.output))
        }
        if (part.state.status === "error" && part.state.error) {
          total += estimateTokens(part.state.error)
        }
      }
    }
  }
  return total
}

function truncateSessionToolOutputs(messages: SessionV1.WithParts[], maxChars: number): SessionV1.WithParts[] {
  if (!isFinite(maxChars)) return messages
  return messages.map((msg) => ({
    ...msg,
    parts: msg.parts.map((part) => {
      if (part.type !== "tool" || part.state.status !== "completed") return part
      const output = part.state.output
      if (typeof output !== "string" || output.length <= maxChars) return part
      return {
        ...part,
        state: {
          ...part.state,
          output: output.slice(0, maxChars) + "\n... [truncated]",
        },
      } as SessionV1.ToolPart
    }),
  }))
}

export function compactIfNeeded(
  messages: SessionV1.WithParts[],
  contextLimit: number,
): {
  messages: SessionV1.WithParts[]
  level: CompactionLevel
  needsLlmSummary: boolean
} {
  const usedTokens = estimateSessionTokens(messages)
  const level = determineLevel(usedTokens, contextLimit)

  if (level === 0) return { messages, level, needsLlmSummary: false }

  const plan = getPlan(level)

  if (level <= 2) {
    let result = messages

    if (!plan.keepToolResults) {
      result = result.map((msg) => ({
        ...msg,
        parts: msg.parts.filter((p) => p.type !== "tool"),
      }))
    } else {
      result = truncateSessionToolOutputs(result, plan.dropToolOutputsOverChars)
    }

    if (plan.keepLastNMessages < Infinity) {
      result = result.slice(-plan.keepLastNMessages)
    }

    return { messages: result, level, needsLlmSummary: false }
  }

  let result = truncateSessionToolOutputs(messages, plan.dropToolOutputsOverChars)
  if (plan.keepLastNMessages < Infinity) {
    result = result.slice(-plan.keepLastNMessages)
  }

  return { messages: result, level, needsLlmSummary: true }
}

export function compactWithBudget(
  messages: SessionV1.WithParts[],
  budget: number,
): SessionV1.WithParts[] {
  let current = estimateSessionTokens(messages)
  if (current <= budget) return messages

  let result = messages

  result = truncateSessionToolOutputs(result, 2000)
  current = estimateSessionTokens(result)
  if (current <= budget) return result

  result = truncateSessionToolOutputs(result, 500)
  current = estimateSessionTokens(result)
  if (current <= budget) return result

  result = result.map((msg) => ({
    ...msg,
    parts: msg.parts.filter((p) => p.type !== "tool"),
  }))
  current = estimateSessionTokens(result)
  if (current <= budget) return result

  // N2: drop whole user→… turns from the front only (tool-pair safe). Never
  // raw-slice mid-pair, which can orphan tool_use / tool_result for the summarizer.
  let budgetPass = 0
  while (estimateSessionTokens(result) > budget && result.length > 2 && budgetPass < 20) {
    budgetPass++
    const dropCount = Math.max(1, Math.ceil(result.length * 0.1))
    const next = dropCompleteTurnsFromFront(result, dropCount)
    if (next.length >= result.length) break
    result = next
  }

  // Fallback: if still over budget after turn-safe drops, truncate each
  // message's text content proportionally to fit within the remaining budget.
  if (estimateSessionTokens(result) > budget && result.length > 0) {
    const perMessage = Math.max(50, Math.floor((budget * 0.9) / result.length))
    result = result.map((msg) => {
      const textParts = msg.parts.filter((p) => p.type === "text") as { type: "text"; text: string }[]
      const nonTextParts = msg.parts.filter((p) => p.type !== "text")
      if (textParts.length === 0) return msg
      const totalLen = textParts.reduce((sum, p) => sum + p.text.length, 0)
      if (totalLen <= perMessage) return msg
      const ratio = perMessage / totalLen
      const truncated = textParts.map((p) => ({
        ...p,
        text: p.text.slice(0, Math.max(50, Math.floor(p.text.length * ratio))) + "...",
      }))
      return { ...msg, parts: [...truncated, ...nonTextParts] as typeof msg.parts }
    })
  }

  return result
}

export type { CompactionLevel, CompactionPlan, MessageUsage }

export * as SessionCompaction from "./compaction"
