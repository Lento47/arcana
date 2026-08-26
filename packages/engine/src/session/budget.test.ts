import { describe, expect, test } from "bun:test"
import { Effect, Fiber } from "effect"
import { SessionBudget, toolBudgetCost, DEFAULT_BUDGET_CONFIG } from "./budget"
import { SessionID } from "./schema"
import { InstanceRef } from "@/effect/instance-ref"

const sid = "ses_budget_test" as SessionID

const ctx = {
  directory: process.cwd(),
  worktree: process.cwd(),
  project: { id: "prj_test" } as any,
  startedAt: Date.now(),
}

const run = <A>(effect: Effect.Effect<A, any, SessionBudget.Service>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(SessionBudget.defaultLayer),
      Effect.provideService(InstanceRef, ctx),
      Effect.scoped,
    ),
  )

describe("SessionBudget queue (never errors)", () => {
  test("toolBudgetCost classifies shell as destructive+external", () => {
    expect(toolBudgetCost("shell")).toEqual({ destructive: 1, files: 1, external: 1 })
    expect(toolBudgetCost("read")).toEqual({ files: 1 })
    // Softened 2026-08-24 (was 10) — long agentic turns tripped the old ceiling.
    expect(DEFAULT_BUDGET_CONFIG.maxExternalCalls).toBe(60)
  })

  test("checkOrBlock never fails when under limit", async () => {
    await run(
      Effect.gen(function* () {
        const budget = yield* SessionBudget.Service
        yield* budget.reset(sid)
        yield* budget.checkOrBlock(sid, { external: 1 })
        const st = yield* budget.status(sid)
        expect(st.externalCalls).toBe(1)
        yield* budget.release(sid, { external: 1 })
        const after = yield* budget.status(sid)
        expect(after.externalCalls).toBe(0)
      }),
    )
  })

  test("queues when full then continues after release (no error)", async () => {
    await run(
      Effect.gen(function* () {
        const budget = yield* SessionBudget.Service
        yield* budget.reset(sid)
        for (let i = 0; i < DEFAULT_BUDGET_CONFIG.maxExternalCalls; i++) {
          yield* budget.checkOrBlock(sid, { external: 1 })
        }
        const full = yield* budget.status(sid)
        expect(full.externalCalls).toBe(DEFAULT_BUDGET_CONFIG.maxExternalCalls)

        const waiter = yield* Effect.forkChild(
          budget.checkOrBlock(sid, { external: 1 }).pipe(Effect.as("ok")),
        )
        yield* Effect.sleep("30 millis")
        let st = yield* budget.status(sid)
        expect(st.queued).toBeGreaterThanOrEqual(1)

        yield* budget.release(sid, { external: 1 })
        const result = yield* Fiber.join(waiter)
        expect(result).toBe("ok")

        st = yield* budget.status(sid)
        expect(st.externalCalls).toBe(DEFAULT_BUDGET_CONFIG.maxExternalCalls)
        for (let i = 0; i < DEFAULT_BUDGET_CONFIG.maxExternalCalls; i++) {
          yield* budget.release(sid, { external: 1 })
        }
      }),
    )
  })

  test("reset wakes waiters and never throws BudgetExceededError", async () => {
    await run(
      Effect.gen(function* () {
        const budget = yield* SessionBudget.Service
        yield* budget.reset(sid)
        for (let i = 0; i < DEFAULT_BUDGET_CONFIG.maxExternalCalls; i++) {
          yield* budget.checkOrBlock(sid, { external: 1 })
        }
        const waiter = yield* Effect.forkChild(
          budget.checkOrBlock(sid, { external: 1 }).pipe(Effect.as("woke")),
        )
        yield* Effect.sleep("30 millis")
        yield* budget.reset(sid)
        const result = yield* Fiber.join(waiter)
        expect(result).toBe("woke")
      }),
    )
  })

  test("disable wakes queue and allows unlimited occupancy", async () => {
    await run(
      Effect.gen(function* () {
        const budget = yield* SessionBudget.Service
        yield* budget.reset(sid)
        for (let i = 0; i < DEFAULT_BUDGET_CONFIG.maxExternalCalls; i++) {
          yield* budget.checkOrBlock(sid, { external: 1 })
        }
        const waiter = yield* Effect.forkChild(
          budget.checkOrBlock(sid, { external: 1 }).pipe(Effect.as("go")),
        )
        yield* Effect.sleep("30 millis")
        yield* budget.disable(sid)
        expect(yield* Fiber.join(waiter)).toBe("go")
        yield* budget.checkOrBlock(sid, { external: 5 })
      }),
    )
  })
})
