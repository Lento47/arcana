import { describe, expect, test } from "bun:test"
import { createEngineAction, createPipelinePlan } from "@/kernel"
import { createEmptyCockpitProjection } from "./cockpit.projection-store"
import {
  cockpitPerformanceGate,
  cockpitQACoversSteps61To63,
  cockpitRenderSnapshot,
  replayCockpitProjection,
} from "./cockpit.qa-gates"

describe("Arcana cockpit QA gates", () => {
  test("covers steps 61 through 63", () => {
    expect(cockpitQACoversSteps61To63()).toBe(true)
  })

  test("creates deterministic render snapshot", () => {
    const snapshot = cockpitRenderSnapshot(createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" }))

    expect(snapshot.step).toBe(61)
    expect(snapshot.fingerprint).toContain("14:mission-header")
    expect(snapshot.lines[0]).toContain("ARCANA MISSION")
  })

  test("replays projection events", () => {
    const plan = createPipelinePlan({ id: "pipe_1", pipeline: "migration", objective: "native cockpit", risk: "medium" })
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_read", name: "read", input_summary: "read file" })
    const replay = replayCockpitProjection({
      run_id: "run_1",
      events: [
        { type: "pipeline", plan },
        { type: "action", action },
      ],
    })

    expect(replay.step).toBe(62)
    expect(replay.event_count).toBe(2)
    expect(replay.projection.objective).toBe("native cockpit")
    expect(replay.projection.actions).toHaveLength(1)
  })

  test("evaluates render performance budget", () => {
    const passed = cockpitPerformanceGate([
      { render_ms: 2, rows: 20 },
      { render_ms: 6, rows: 24 },
      { render_ms: 10, rows: 30 },
    ])
    const failed = cockpitPerformanceGate([{ render_ms: 33, rows: 100 }])

    expect(passed.step).toBe(63)
    expect(passed.passed).toBe(true)
    expect(failed.passed).toBe(false)
  })

})
