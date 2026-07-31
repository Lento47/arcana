/**
 * Per-run safety budgets to prevent runaway or malicious model behavior.
 *
 * Tracks concurrent destructive ops, files touched, lines changed, external
 * calls, and wall-clock duration. When a limit would be exceeded, callers are
 * **queued** (wait for capacity) — never failed with BudgetExceededError.
 *
 * Capacity frees when:
 * - a tool releases its acquired cost (normal path)
 * - reset() clears counters (new run / explicit reset)
 * - disable() turns enforcement off (all waiters proceed)
 * - lower/release APIs reduce counters
 *
 * Budgets reset on each new run and can be disabled with /budget off.
 */

import { LayerNode } from "@arcana/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { SessionID } from "./schema"
import { NamedError } from "@arcana/core/util/error"
import { Context, Deferred, Effect, Layer, Schema } from "effect"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxDestructiveOps: 5,
  maxFilesTouched: 50,
  maxLocChanged: 2000,
  maxExternalCalls: 10,
  maxDurationMs: 15 * 60 * 1000,
}

const NonNegInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const BudgetConfig = Schema.Struct({
  maxDestructiveOps: NonNegInt,
  maxFilesTouched: NonNegInt,
  maxLocChanged: NonNegInt,
  maxExternalCalls: NonNegInt,
  maxDurationMs: NonNegInt,
})
export type BudgetConfig = Schema.Schema.Type<typeof BudgetConfig>

/** Cost reserved while a tool runs (concurrent occupancy, not lifetime total). */
export type BudgetCost = {
  destructive?: number
  files?: number
  loc?: number
  external?: number
}

export const EMPTY_COST: BudgetCost = {}

// ---------------------------------------------------------------------------
// Error (kept for compatibility / telemetry; public APIs never fail with it)
// ---------------------------------------------------------------------------

export class BudgetExceededError extends NamedError.create("BudgetExceededError", {
  budget: Schema.String,
  current: Schema.Number,
  limit: Schema.Number,
  message: Schema.String,
  sessionID: SessionID,
}) {}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const BudgetStatus = Schema.Struct({
  enabled: Schema.Boolean,
  destructiveOps: Schema.Number,
  maxDestructiveOps: Schema.Number,
  filesTouched: Schema.Number,
  maxFilesTouched: Schema.Number,
  locChanged: Schema.Number,
  maxLocChanged: Schema.Number,
  externalCalls: Schema.Number,
  maxExternalCalls: Schema.Number,
  elapsedMs: Schema.Number,
  maxDurationMs: Schema.Number,
  queued: Schema.Number,
})
export type BudgetStatus = Schema.Schema.Type<typeof BudgetStatus>

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type Waiter = Deferred.Deferred<void>

interface BudgetStateInternal {
  /** Concurrent occupancy (in-flight tools). */
  destructiveOps: number
  filesTouched: number
  locChanged: number
  externalCalls: number
  startTime: number
  enabled: boolean
  config: BudgetConfig
  /** Parked acquire waiters — woken on release / reset / disable. */
  waiters: Waiter[]
}

function createInitialState(config?: Partial<BudgetConfig>): BudgetStateInternal {
  return {
    destructiveOps: 0,
    filesTouched: 0,
    locChanged: 0,
    externalCalls: 0,
    startTime: Date.now(),
    enabled: true,
    config: { ...DEFAULT_BUDGET_CONFIG, ...config },
    waiters: [],
  }
}

function norm(cost: BudgetCost): Required<BudgetCost> {
  return {
    destructive: Math.max(0, cost.destructive ?? 0),
    files: Math.max(0, cost.files ?? 0),
    loc: Math.max(0, cost.loc ?? 0),
    external: Math.max(0, cost.external ?? 0),
  }
}

function fits(s: BudgetStateInternal, cost: Required<BudgetCost>): boolean {
  if (!s.enabled) return true
  // Soft-roll duration window: never hard-stop; keep pacing via other counters.
  if (Date.now() - s.startTime >= s.config.maxDurationMs) {
    s.startTime = Date.now()
  }
  return (
    s.destructiveOps + cost.destructive <= s.config.maxDestructiveOps &&
    s.filesTouched + cost.files <= s.config.maxFilesTouched &&
    s.locChanged + cost.loc <= s.config.maxLocChanged &&
    s.externalCalls + cost.external <= s.config.maxExternalCalls
  )
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface Interface {
  /**
   * Wait until `cost` fits under current limits, then reserve it.
   * Never fails with BudgetExceededError — queues until capacity frees.
   */
  readonly checkOrBlock: (sessionID: SessionID, cost?: BudgetCost) => Effect.Effect<void>
  /** @deprecated Prefer checkOrBlock(session, cost); kept as no-op-friendly increment without wait. */
  readonly recordDestructive: (sessionID: SessionID) => Effect.Effect<void>
  readonly recordFileTouch: (sessionID: SessionID, count?: number) => Effect.Effect<void>
  readonly recordLocChange: (sessionID: SessionID, added?: number, removed?: number) => Effect.Effect<void>
  readonly recordExternalCall: (sessionID: SessionID) => Effect.Effect<void>
  /**
   * Release previously acquired cost (lower occupancy) and wake queue.
   * Safe to call with the same cost used in checkOrBlock.
   */
  readonly release: (sessionID: SessionID, cost?: BudgetCost) => Effect.Effect<void>
  /** Lower counters without acquire (floor 0); wakes queue. */
  readonly lower: (sessionID: SessionID, cost: BudgetCost) => Effect.Effect<void>
  /** Duration is soft (rolls window); never fails. */
  readonly checkDuration: (sessionID: SessionID) => Effect.Effect<void>
  /** Reset all counters for a new run; wakes all waiters. */
  readonly reset: (sessionID: SessionID) => Effect.Effect<void>
  readonly disable: (sessionID: SessionID) => Effect.Effect<void>
  readonly enable: (sessionID: SessionID) => Effect.Effect<void>
  readonly status: (sessionID: SessionID) => Effect.Effect<BudgetStatus>
  readonly isEnabled: (sessionID: SessionID) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/SessionBudget") {}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make(
      Effect.fn("SessionBudget.state")(() => Effect.succeed(new Map<SessionID, BudgetStateInternal>())),
    )

    const ensure = Effect.fn("SessionBudget.ensure")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      if (!data.has(sessionID)) {
        data.set(sessionID, createInitialState())
      }
      return data.get(sessionID)!
    })

    const wakeAll = (s: BudgetStateInternal) =>
      Effect.gen(function* () {
        const waiters = s.waiters.splice(0, s.waiters.length)
        for (const w of waiters) {
          yield* Deferred.succeed(w, undefined).pipe(Effect.asVoid, Effect.ignore)
        }
      })

    const checkOrBlock = Effect.fn("SessionBudget.checkOrBlock")(function* (
      sessionID: SessionID,
      cost: BudgetCost = EMPTY_COST,
    ) {
      const need = norm(cost)
      // Spin-wait with Deferred parking: never Effect.fail.
      while (true) {
        const s = yield* ensure(sessionID)
        if (!s.enabled || fits(s, need)) {
          s.destructiveOps += need.destructive
          s.filesTouched += need.files
          s.locChanged += need.loc
          s.externalCalls += need.external
          return
        }
        const waiter = yield* Deferred.make<void>()
        s.waiters.push(waiter)
        // Re-check after enqueue in case capacity freed between fits() and push.
        if (fits(s, need)) {
          const idx = s.waiters.indexOf(waiter)
          if (idx >= 0) s.waiters.splice(idx, 1)
          s.destructiveOps += need.destructive
          s.filesTouched += need.files
          s.locChanged += need.loc
          s.externalCalls += need.external
          return
        }
        yield* Deferred.await(waiter)
      }
    })

    const release = Effect.fn("SessionBudget.release")(function* (
      sessionID: SessionID,
      cost: BudgetCost = EMPTY_COST,
    ) {
      const s = yield* ensure(sessionID)
      const need = norm(cost)
      s.destructiveOps = Math.max(0, s.destructiveOps - need.destructive)
      s.filesTouched = Math.max(0, s.filesTouched - need.files)
      s.locChanged = Math.max(0, s.locChanged - need.loc)
      s.externalCalls = Math.max(0, s.externalCalls - need.external)
      yield* wakeAll(s)
    })

    const lower = Effect.fn("SessionBudget.lower")(function* (sessionID: SessionID, cost: BudgetCost) {
      yield* release(sessionID, cost)
    })

    // Legacy record* APIs: direct increment without queue (telemetry / tests).
    // Prefer checkOrBlock + release for tool paths.
    const recordDestructive = Effect.fn("SessionBudget.recordDestructive")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.destructiveOps++
    })

    const recordFileTouch = Effect.fn("SessionBudget.recordFileTouch")(function* (
      sessionID: SessionID,
      count = 1,
    ) {
      const s = yield* ensure(sessionID)
      s.filesTouched += Math.max(0, count)
    })

    const recordLocChange = Effect.fn("SessionBudget.recordLocChange")(function* (
      sessionID: SessionID,
      added = 0,
      removed = 0,
    ) {
      const s = yield* ensure(sessionID)
      s.locChanged += Math.max(0, added) + Math.max(0, removed)
    })

    const recordExternalCall = Effect.fn("SessionBudget.recordExternalCall")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.externalCalls++
    })

    const checkDuration = Effect.fn("SessionBudget.checkDuration")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      if (!s.enabled) return
      if (Date.now() - s.startTime >= s.config.maxDurationMs) {
        s.startTime = Date.now()
        yield* wakeAll(s)
      }
    })

    const reset = Effect.fn("SessionBudget.reset")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      const prev = data.get(sessionID)
      const next = createInitialState(prev?.config)
      // Preserve enabled flag across reset when previously disabled.
      if (prev) next.enabled = prev.enabled
      data.set(sessionID, next)
      if (prev) yield* wakeAll(prev)
    })

    const disable = Effect.fn("SessionBudget.disable")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.enabled = false
      yield* wakeAll(s)
    })

    const enable = Effect.fn("SessionBudget.enable")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.enabled = true
    })

    const status = Effect.fn("SessionBudget.status")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      return {
        enabled: s.enabled,
        destructiveOps: s.destructiveOps,
        maxDestructiveOps: s.config.maxDestructiveOps,
        filesTouched: s.filesTouched,
        maxFilesTouched: s.config.maxFilesTouched,
        locChanged: s.locChanged,
        maxLocChanged: s.config.maxLocChanged,
        externalCalls: s.externalCalls,
        maxExternalCalls: s.config.maxExternalCalls,
        elapsedMs: Date.now() - s.startTime,
        maxDurationMs: s.config.maxDurationMs,
        queued: s.waiters.length,
      }
    })

    const isEnabled = Effect.fn("SessionBudget.isEnabled")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      return s.enabled
    })

    return Service.of({
      checkOrBlock,
      recordDestructive,
      recordFileTouch,
      recordLocChange,
      recordExternalCall,
      release,
      lower,
      checkDuration,
      reset,
      disable,
      enable,
      status,
      isEnabled,
    })
  }),
)

export const defaultLayer = layer

export const node = LayerNode.make(layer, [])

/** Map a tool id to budget cost for concurrent gating. */
export function toolBudgetCost(toolName: string, args?: Record<string, unknown>): BudgetCost {
  const name = toolName.toLowerCase()
  const cost: BudgetCost = {}

  const isWrite =
    name === "write" ||
    name === "edit" ||
    name === "apply_patch" ||
    name === "patch" ||
    name === "multiedit" ||
    name === "write_file"
  const isShell = name === "shell" || name === "bash" || name === "terminal"
  const isExternal =
    name === "webfetch" ||
    name === "websearch" ||
    name === "web_search" ||
    name === "browser" ||
    name.startsWith("mcp")
  const isRead =
    name === "read" ||
    name === "read_file" ||
    name === "glob" ||
    name === "grep" ||
    name === "list" ||
    name === "lsp"

  if (isWrite || isShell) cost.destructive = 1
  if (isWrite || isRead || isShell) cost.files = 1
  if (isExternal || isShell) cost.external = 1
  if (isWrite) {
    const content =
      typeof args?.content === "string"
        ? args.content
        : typeof args?.newString === "string"
          ? args.newString
          : typeof args?.new_string === "string"
            ? args.new_string
            : ""
    if (content) cost.loc = Math.min(500, content.split(/\r?\n/).length)
  }

  // Default: every tool counts as a light external slot so fan-out is paced.
  if (!cost.destructive && !cost.files && !cost.external && !cost.loc) {
    cost.external = 1
  }

  return cost
}

export * as SessionBudget from "./budget"
