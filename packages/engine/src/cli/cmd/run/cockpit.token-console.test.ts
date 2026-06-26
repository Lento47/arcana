import { describe, expect, test } from "bun:test"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import { tokenConsoleIsActionable, tokenConsoleView } from "./cockpit.token-console"

describe("Arcana token console", () => {
  test("renders empty token state", () => {
    const view = tokenConsoleView(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(view.empty).toBe(true)
    expect(view.pressure).toBe("calm")
    expect(view.budget_decision).toBe("none")
  })

  test("renders admission pressure", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "token.admission",
        admission: {
          budget_id: "tbud_1",
          decision: "compact_context",
          estimated_tokens: 4200,
          estimated_cost_micros: 99,
          remaining_tokens: 1000,
          remaining_cost_micros: 12,
          reason: "context pressure",
        },
      },
    )
    const view = tokenConsoleView(projection)

    expect(view.empty).toBe(false)
    expect(view.pressure).toBe("attention")
    expect(view.estimate).toBe("4200 tokens")
    expect(tokenConsoleIsActionable(view)).toBe(true)
  })

  test("renders reconciliation actuals", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "token.reconciliation",
        reconciliation: {
          action_id: "act_1",
          status: "exact",
          estimated_total: 100,
          actual_total: 100,
          delta: 0,
          reason: "matched",
        },
      },
    )
    const view = tokenConsoleView(projection)

    expect(view.reconciliation).toBe("exact")
    expect(view.actual).toBe("100 tokens")
    expect(tokenConsoleIsActionable(view)).toBe(false)
  })
})
