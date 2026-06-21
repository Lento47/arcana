/**
 * Per-run safety budgets to prevent runaway or malicious model behavior.
 *
 * Tracks destructive operations, files touched, lines changed, external
 * calls, and wall-clock duration. If any budget is exceeded the run is
 * paused and further tool calls are blocked with BudgetExceededError.
 *
 * Budgets reset on each new run and can be disabled with /budget off.
 */

import { LayerNode } from "@arcana/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { SessionID } from "./schema"
import { NamedError } from "@arcana/core/util/error"
import { Effect, Layer, Context, Schema } from "effect"

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

export const BudgetConfig = Schema.Struct({
  maxDestructiveOps: Schema.NonNegativeInt,
  maxFilesTouched: Schema.NonNegativeInt,
  maxLocChanged: Schema.NonNegativeInt,
  maxExternalCalls: Schema.NonNegativeInt,
  maxDurationMs: Schema.Number.pipe(Schema.nonNegative()),
})
export type BudgetConfig = Schema.Schema.Type<typeof BudgetConfig>

// ---------------------------------------------------------------------------
// Error
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
})
export type BudgetStatus = Schema.Schema.Type<typeof BudgetStatus>

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface BudgetStateInternal {
  destructiveOps: number
  filesTouched: number
  locChanged: number
  externalCalls: number
  startTime: number
  enabled: boolean
  config: BudgetConfig
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
  }
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Check all budgets before a tool execution step. Returns BudgetExceededError if any exceeded. */
  readonly checkOrBlock: (sessionID: SessionID) => Effect.Effect<void, BudgetExceededError>
  /** Increment destructive ops counter. */
  readonly recordDestructive: (sessionID: SessionID) => Effect.Effect<void>
  /** Increment files touched counter. */
  readonly recordFileTouch: (sessionID: SessionID, count?: number) => Effect.Effect<void>
  /** Increment lines-changed counter. */
  readonly recordLocChange: (sessionID: SessionID, added?: number, removed?: number) => Effect.Effect<void>
  /** Increment external calls counter. */
  readonly recordExternalCall: (sessionID: SessionID) => Effect.Effect<void>
  /** Check duration budget only. */
  readonly checkDuration: (sessionID: SessionID) => Effect.Effect<void, BudgetExceededError>
  /** Reset all counters for a new run. */
  readonly reset: (sessionID: SessionID) => Effect.Effect<void>
  /** Disable budget enforcement for this session. */
  readonly disable: (sessionID: SessionID) => Effect.Effect<void>
  /** Re-enable budget enforcement for this session. */
  readonly enable: (sessionID: SessionID) => Effect.Effect<void>
  /** Get current budget status. */
  readonly status: (sessionID: SessionID) => Effect.Effect<BudgetStatus>
  /** Check if budget is enabled for this session. */
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
      Effect.fn("SessionBudget.state")(() =>
        Effect.succeed(new Map<SessionID, BudgetStateInternal>()),
      ),
    )

    const ensure = Effect.fn("SessionBudget.ensure")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      if (!data.has(sessionID)) {
        data.set(sessionID, createInitialState())
      }
      return data.get(sessionID)!
    })

    const checkOrBlock = Effect.fn("SessionBudget.checkOrBlock")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      if (!s.enabled) return

      const elapsed = Date.now() - s.startTime
      if (elapsed >= s.config.maxDurationMs) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxDurationMs",
          current: elapsed,
          limit: s.config.maxDurationMs,
          message: `Duration budget exceeded: ${Math.round(elapsed / 1000)}s / ${Math.round(s.config.maxDurationMs / 1000)}s`,
          sessionID,
        }))
      }
      if (s.destructiveOps >= s.config.maxDestructiveOps) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxDestructiveOps",
          current: s.destructiveOps,
          limit: s.config.maxDestructiveOps,
          message: `[BUDGET] Destructive ops: ${s.destructiveOps}/${s.config.maxDestructiveOps} — limit reached. Run paused.`,
          sessionID,
        }))
      }
      if (s.filesTouched >= s.config.maxFilesTouched) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxFilesTouched",
          current: s.filesTouched,
          limit: s.config.maxFilesTouched,
          message: `[BUDGET] Files touched: ${s.filesTouched}/${s.config.maxFilesTouched} — limit reached. Run paused.`,
          sessionID,
        }))
      }
      if (s.locChanged >= s.config.maxLocChanged) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxLocChanged",
          current: s.locChanged,
          limit: s.config.maxLocChanged,
          message: `[BUDGET] LOC changed: ${s.locChanged}/${s.config.maxLocChanged} — limit reached. Run paused.`,
          sessionID,
        }))
      }
      if (s.externalCalls >= s.config.maxExternalCalls) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxExternalCalls",
          current: s.externalCalls,
          limit: s.config.maxExternalCalls,
          message: `[BUDGET] External calls: ${s.externalCalls}/${s.config.maxExternalCalls} — limit reached. Run paused.`,
          sessionID,
        }))
      }
    })

    const recordDestructive = Effect.fn("SessionBudget.recordDestructive")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.destructiveOps++
    })

    const recordFileTouch = Effect.fn("SessionBudget.recordFileTouch")(function* (
      sessionID: SessionID,
      count = 1,
    ) {
      const s = yield* ensure(sessionID)
      s.filesTouched += count
    })

    const recordLocChange = Effect.fn("SessionBudget.recordLocChange")(function* (
      sessionID: SessionID,
      added = 0,
      removed = 0,
    ) {
      const s = yield* ensure(sessionID)
      s.locChanged += added + removed
    })

    const recordExternalCall = Effect.fn("SessionBudget.recordExternalCall")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.externalCalls++
    })

    const checkDuration = Effect.fn("SessionBudget.checkDuration")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      if (!s.enabled) return
      const elapsed = Date.now() - s.startTime
      if (elapsed >= s.config.maxDurationMs) {
        return yield* Effect.fail(new BudgetExceededError({
          budget: "maxDurationMs",
          current: elapsed,
          limit: s.config.maxDurationMs,
          message: `Duration budget exceeded: ${Math.round(elapsed / 1000)}s / ${Math.round(s.config.maxDurationMs / 1000)}s`,
          sessionID,
        }))
      }
    })

    const reset = Effect.fn("SessionBudget.reset")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      data.set(sessionID, createInitialState())
    })

    const disable = Effect.fn("SessionBudget.disable")(function* (sessionID: SessionID) {
      const s = yield* ensure(sessionID)
      s.enabled = false
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

export * as SessionBudget from "./budget"
