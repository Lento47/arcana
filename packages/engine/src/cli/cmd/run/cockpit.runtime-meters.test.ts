import { describe, expect, test } from "bun:test"
import { createEngineAction } from "@/kernel"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import {
  cacheHitRatioMeter,
  compatBlockerMeter,
  contextPressureMeter,
  cockpitRuntimeMeters,
  cockpitRuntimeMetersCoverSteps51To56,
  providerRouteMeter,
  providerStateMeter,
  tokenBurnMeter,
} from "./cockpit.runtime-meters"

describe("Arcana cockpit runtime meters", () => {
  test("covers steps 51 through 56", () => {
    const meters = cockpitRuntimeMeters(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(cockpitRuntimeMetersCoverSteps51To56(meters)).toBe(true)
  })

  test("shows estimated versus actual token burn", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "token.reconciliation",
        reconciliation: {
          action_id: "act_1",
          status: "over_estimate",
          estimated_total: 100,
          actual_total: 140,
          delta: 40,
          reason: "over",
        },
      },
    )

    expect(tokenBurnMeter(projection).value).toBe("100 estimated / 140 actual")
    expect(tokenBurnMeter(projection).severity).toBe("danger")
  })

  test("computes cache hit ratio", () => {
    const meter = cacheHitRatioMeter({ cache_read_tokens: 90, cache_write_tokens: 0, uncached_input_tokens: 10 })

    expect(meter.value).toBe("90%")
    expect(meter.severity).toBe("calm")
  })

  test("tracks context pressure and compaction", () => {
    const meter = contextPressureMeter({ context_tokens: 900, context_budget_tokens: 1000, compaction_active: true })

    expect(meter.value).toContain("90%")
    expect(meter.severity).toBe("attention")
  })

  test("shows provider route and region", () => {
    const action = createEngineAction({ id: "act_provider", source: "builder", kind: "provider", name: "openrouter", input_summary: "route" })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "action", action })

    expect(providerRouteMeter(projection).value).toContain("openrouter")
    expect(providerRouteMeter(projection).value).toContain("gateway")
  })

  test("shows opaque provider-state indicator", () => {
    expect(providerStateMeter({ opaque_provider_state_ref: "opaque_1" }).severity).toBe("attention")
    expect(providerStateMeter({}).severity).toBe("calm")
  })

  test("shows compatibility blocker meter", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      {
        type: "compat",
        compat: {
          total_shims: 10,
          active_shims: 2,
          observed_hits: 1,
          blocking_shims: 1,
          ready_for_contraction: false,
        },
      },
    )

    expect(compatBlockerMeter(projection).value).toBe("1 blocking / 2 active")
    expect(compatBlockerMeter(projection).severity).toBe("attention")
  })
})
