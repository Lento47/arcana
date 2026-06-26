import { describe, expect, test } from "bun:test"
import { createEngineAction, createKernelProjection, createPipelinePlan, createRunProofEvent, createRunProofProjection } from "@/kernel"
import {
  cockpitProjectionSummary,
  createCockpitProjectionStore,
  createEmptyCockpitProjection,
  reduceCockpitProjection,
} from "./cockpit.projection-store"

describe("Arcana cockpit projection store", () => {
  test("starts with mission focus", () => {
    const projection = createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit", now: "2026-01-01T00:00:00.000Z" })

    expect(projection.focus.panel).toBe("mission")
    expect(projection.objective).toBe("ship cockpit")
    expect(projection.actions).toEqual([])
  })

  test("ingests pipeline and action records", () => {
    const initial = createEmptyCockpitProjection({ run_id: "run_1" })
    const plan = createPipelinePlan({ id: "pipe_1", pipeline: "migration", objective: "make TUI kernel native", risk: "medium" })
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_read", name: "read", input_summary: "read file" })

    const withPipeline = reduceCockpitProjection(initial, { type: "pipeline", plan }, "2026-01-01T00:00:00.000Z")
    const withAction = reduceCockpitProjection(withPipeline, { type: "action", action }, "2026-01-01T00:00:01.000Z")

    expect(withAction.objective).toBe("make TUI kernel native")
    expect(withAction.actions.map((item) => item.id)).toEqual(["act_1"])
  })

  test("ingests full kernel projection snapshot", () => {
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_read", name: "read", input_summary: "read file" })
    const kernel = createKernelProjection({
      run_id: "run_1",
      objective: "inspect runtime",
      actions: [action],
      mutations: [],
      proof_completeness: 0.5,
      compatibility_active: 2,
    })
    const store = createCockpitProjectionStore(createEmptyCockpitProjection({ run_id: "run_1" }))

    const next = store.dispatch({ type: "kernel", projection: kernel }, "2026-01-01T00:00:00.000Z")

    expect(next.objective).toBe("inspect runtime")
    expect(next.kernel?.risk_band).toBe("calm")
    expect(next.actions).toHaveLength(1)
  })

  test("token pressure reflects budget decisions", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "token.admission",
        admission: {
          budget_id: "tbud_1",
          decision: "require_approval",
          estimated_tokens: 2000,
          estimated_cost_micros: 5000,
          reason: "high spend",
        },
      },
    )

    expect(projection.tokens?.pressure).toBe("danger")
  })

  test("summary is stable and cockpit-oriented", () => {
    const proof = createRunProofProjection({
      run_id: "run_1",
      objective: "ship cockpit",
      events: [
        createRunProofEvent({ kind: "pipeline", summary: "pipeline" }),
        createRunProofEvent({ kind: "action", summary: "action" }),
        createRunProofEvent({ kind: "security", summary: "security" }),
        createRunProofEvent({ kind: "verification", summary: "verification" }),
      ],
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" }), { type: "proof", proof })

    expect(cockpitProjectionSummary(projection)).toContain("mission=ship cockpit")
    expect(cockpitProjectionSummary(projection)).toContain("proof=")
  })
})
