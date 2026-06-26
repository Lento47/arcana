import { describe, expect, test } from "bun:test"
import { createEngineAction, createKernelProjection, createRunProofEvent, createRunProofProjection } from "@/kernel"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import { cockpitShellCoversSteps, cockpitShellIsArcanaNative, createCockpitAreas, createCockpitShell } from "./cockpit.shell"

describe("Arcana cockpit shell", () => {
  test("covers steps 14 through 21", () => {
    const projection = createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" })
    const shell = createCockpitShell(projection)

    expect(cockpitShellCoversSteps(shell)).toBe(true)
    expect(shell.areas.map((area) => area.step)).toEqual([14, 15, 16, 17, 18, 19, 20, 21])
  })

  test("uses Arcana-native proof and sovereignty surfaces", () => {
    const projection = createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" })
    const shell = createCockpitShell(projection)

    expect(cockpitShellIsArcanaNative(shell)).toBe(true)
    expect(shell.areas.map((area) => area.id)).toContain("proof-ledger")
    expect(shell.areas.map((area) => area.id)).toContain("sovereignty-compat")
  })

  test("mission header reflects kernel risk and proof completeness", () => {
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_read", name: "read", input_summary: "read file" })
    const kernel = createKernelProjection({
      run_id: "run_1",
      objective: "inspect runtime",
      actions: [action],
      mutations: [],
      proof_completeness: 0.72,
      compatibility_active: 1,
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "kernel", projection: kernel })
    const mission = createCockpitAreas(projection).find((area) => area.id === "mission-header")

    expect(mission?.summary).toBe("inspect runtime")
    expect(mission?.metric).toContain("72% proof")
  })

  test("action timeline and proof ledger respond to projection records", () => {
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_read", name: "read", input_summary: "read file" })
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
    const withAction = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "action", action })
    const projection = reduceCockpitProjection(withAction, { type: "proof", proof })
    const shell = createCockpitShell(projection)

    expect(shell.areas.find((area) => area.id === "action-timeline")?.metric).toBe("1 actions")
    expect(shell.areas.find((area) => area.id === "proof-ledger")?.state).toBe("attention")
  })

  test("token console reflects budget pressure", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "token.admission",
        admission: {
          budget_id: "tbud_1",
          decision: "compact_context",
          estimated_tokens: 5000,
          estimated_cost_micros: 0,
          reason: "context pressure",
        },
      },
    )
    const shell = createCockpitShell(projection)

    expect(shell.areas.find((area) => area.id === "token-console")?.state).toBe("attention")
  })
})
