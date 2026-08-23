/**
 * Trial Log — session-scoped tool call history with 3-strike loop detection.
 *
 * Every tool execution is recorded with its input hash and outcome.
 * When the same action (same tool + normalized args) fails 3 consecutive
 * times, the 4th attempt is blocked with a summary of all previous attempts.
 *
 * This prevents the agent from entering infinite retry loops on the same
 * failing action. The agent must either change its approach or ask the user.
 */
import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@arcana/core/effect/layer-node"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrialEntry = {
  readonly id: string
  readonly tool: string
  readonly inputHash: string
  readonly inputSummary: string
  readonly timestamp: number
  readonly success: boolean
  readonly output: string
  readonly error?: string
}

export type StrikeState = {
  readonly inputHash: string
  readonly consecutiveFailures: number
  readonly lastFailureOutput: string
  readonly firstFailureTime: number
  readonly lastFailureTime: number
}

export type LoopBlock = {
  readonly blocked: true
  readonly tool: string
  readonly inputHash: string
  readonly strikeCount: number
  readonly attempts: TrialEntry[]
  readonly message: string
}

export type LoopAllowed = {
  readonly blocked: false
}

export type LoopDecision = LoopBlock | LoopAllowed

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TRIAL_ENTRIES = 200
const STRIKE_THRESHOLD = 3

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Record a tool execution outcome. */
  readonly record: (entry: Omit<TrialEntry, "id" | "timestamp">) => Effect.Effect<void>

  /** Check if an action should be blocked by the 3-strike rule. */
  readonly checkLoop: (tool: string, inputHash: string) => Effect.Effect<LoopDecision>

  /** Get a formatted trial history for prompt injection (last N entries). */
  readonly formatHistory: (maxEntries?: number) => Effect.Effect<string | undefined>

  /** Get raw entries for a specific tool. */
  readonly entriesFor: (tool: string) => Effect.Effect<TrialEntry[]>

  /** Get strike state for debugging. */
  readonly strikes: () => Effect.Effect<StrikeState[]>
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type State = {
  entries: TrialEntry[]
  strikes: Map<string, StrikeState>
  sequence: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a stable hash from tool name + normalized args.
 * Strips whitespace, lowercases keys, and sorts to normalize equivalent calls.
 */
export function computeInputHash(tool: string, input: unknown): string {
  const normalized = normalizeForHash(input)
  const raw = `${tool}::${normalized}`
  // Simple djb2 hash — good enough for dedup, not cryptographic
  let hash = 5381
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0
  }
  return `h${(hash >>> 0).toString(36)}`
}

function normalizeForHash(input: unknown): string {
  if (input === null || input === undefined) return ""
  if (typeof input === "string") return input.trim().toLowerCase().replace(/\s+/g, " ")
  if (typeof input === "number" || typeof input === "boolean") return String(input)
  if (Array.isArray(input)) return `[${input.map(normalizeForHash).join(",")}]`
  if (typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${normalizeForHash(v)}`)
    return `{${entries.join(",")}}`
  }
  return String(input)
}

function summarizeInput(tool: string, input: unknown): string {
  if (!input || typeof input !== "object") return `${tool}()`
  const record = input as Record<string, unknown>
  const keys = Object.keys(record).slice(0, 5)
  const parts = keys.map((k) => {
    const v = record[k]
    if (typeof v === "string") {
      const preview = v.length > 60 ? v.slice(0, 57) + "..." : v
      return `${k}="${preview}"`
    }
    if (typeof v === "number" || typeof v === "boolean") return `${k}=${v}`
    return `${k}=<${typeof v}>`
  })
  return `${tool}(${parts.join(", ")})`
}

/** Escape < and > to prevent XML tag injection in system prompts. */
function escapeForPrompt(s: string): string {
  return s.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function formatOutput(output: string, maxLen = 200): string {
  const oneLine = output.replace(/\n/g, " ").trim()
  const escaped = escapeForPrompt(oneLine)
  if (escaped.length <= maxLen) return escaped
  return escaped.slice(0, maxLen - 3) + "..."
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@arcana/TrialLog") {}

/**
 * Create a TrialLog service backed by a mutable state object.
 * No InstanceState dependency — works in any context including tests.
 */
function makeState(): State {
  return {
    entries: [],
    strikes: new Map(),
    sequence: 0,
  }
}

function makeService(s: State): Interface {
  const record: Interface["record"] = Effect.fn("TrialLog.record")(function* (entry) {
    s.sequence += 1
    const full: TrialEntry = {
      ...entry,
      id: `trial-${s.sequence}`,
      timestamp: Date.now(),
    }
    s.entries.push(full)
    // Cap entries to avoid unbounded memory growth
    if (s.entries.length > MAX_TRIAL_ENTRIES) {
      s.entries = s.entries.slice(-MAX_TRIAL_ENTRIES)
    }

    // Update strike tracking
    const key = `${entry.tool}::${entry.inputHash}`
    const existing = s.strikes.get(key)
    if (entry.success) {
      // Success resets the strike counter
      s.strikes.delete(key)
    } else {
      // Failure increments the strike counter
      const now = Date.now()
      s.strikes.set(key, {
        inputHash: entry.inputHash,
        consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
        lastFailureOutput: formatOutput(entry.output + (entry.error ? ` [${entry.error}]` : "")),
        firstFailureTime: existing?.firstFailureTime ?? now,
        lastFailureTime: now,
      })
    }
  })

  const checkLoop: Interface["checkLoop"] = Effect.fn("TrialLog.checkLoop")(function* (
    tool,
    inputHash,
  ) {
    const key = `${tool}::${inputHash}`
    const strike = s.strikes.get(key)
    if (!strike || strike.consecutiveFailures < STRIKE_THRESHOLD) {
      return { blocked: false }
    }

    // Find all entries matching this tool + hash for the summary
    const attempts = s.entries.filter(
      (e) => e.tool === tool && e.inputHash === inputHash,
    )

    const summaryLines = attempts.map((a, i) => {
      const status = a.success ? "SUCCESS" : "FAILED"
      const output = formatOutput(a.output, 120)
      return `  Attempt ${i + 1} [${status}]: ${output}`
    })

    return {
      blocked: true,
      tool,
      inputHash,
      strikeCount: strike.consecutiveFailures,
      attempts,
      message: [
        `LOOP DETECTED: ${tool} has failed ${strike.consecutiveFailures} consecutive times with the same input.`,
        "",
        "Previous attempts:",
        ...summaryLines,
        "",
        "You must change your approach. Try a different tool, different arguments,",
        "or a different strategy entirely. Do NOT retry the same call.",
        "If the task is genuinely blocked, use the question tool to ask the user.",
      ].join("\n"),
    }
  })

  const formatHistory: Interface["formatHistory"] = Effect.fn("TrialLog.formatHistory")(
    function* (maxEntries = 15) {
      const recent = s.entries.slice(-maxEntries)
      if (recent.length === 0) return undefined

      const lines: string[] = ["<trial-log>"]
      lines.push("Recent tool call history (newest first):")
      lines.push("")

      for (const entry of [...recent].reverse()) {
        const status = entry.success ? "OK" : "FAIL"
        const time = new Date(entry.timestamp).toISOString().slice(11, 19)
        lines.push(`[${time}] ${entry.tool} → ${status}: ${escapeForPrompt(entry.inputSummary)}`)
        if (!entry.success) {
          lines.push(`  Output: ${formatOutput(entry.output, 150)}`)
        }
      }

      // Show active strikes
      const activeStrikes = [...s.strikes.values()].filter(
        (st) => st.consecutiveFailures >= 2,
      )
      if (activeStrikes.length > 0) {
        lines.push("")
        lines.push("ACTIVE STRIKE WARNINGS:")
        for (const strike of activeStrikes) {
          lines.push(
            `  ⚠️ ${strike.inputHash}: ${strike.consecutiveFailures} consecutive failures (threshold: ${STRIKE_THRESHOLD})`,
          )
        }
      }

      lines.push("</trial-log>")
      return lines.join("\n")
    },
  )

  const entriesFor: Interface["entriesFor"] = Effect.fn("TrialLog.entriesFor")(function* (
    tool,
  ) {
    return s.entries.filter((e) => e.tool === tool)
  })

  const strikes: Interface["strikes"] = Effect.fn("TrialLog.strikes")(function* () {
    return [...s.strikes.values()]
  })

  return { record, checkLoop, formatHistory, entriesFor, strikes }
}

/** Create a fresh TrialLog service (backed by its own mutable state). */
export function fresh(): Interface {
  const state = makeState()
  return makeService(state)
}

/** Layer that creates fresh state on first use. */
export const layer = Layer.sync(Service, () => Service.of(makeService(makeState())))

export const defaultLayer = layer

/** App-graph node shared by prompt history injection and tool execution. */
export const node = LayerNode.make(layer, [])

export * as TrialLog from "./trial-log"
