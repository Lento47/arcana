import { describe, expect, test } from "bun:test"
import { createEngineAction } from "@/kernel"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import { sovereigntyCompatView, sovereigntyNeedsAttention } from "./cockpit.sovereignty-compat"

describe("Arcana sovereignty compat panel", () => {
  test("renders empty state without provider or compat", () => {
    const view = sovereigntyCompatView(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(view.empty).toBe(true)
    expect(view.provider).toBe("unknown")
    expect(view.route).toBe("unknown")
    expect(sovereigntyNeedsAttention(view)).toBe(true)
  })

  test("renders known gateway provider", () => {
    const view = sovereigntyCompatView(createEmptyCockpitProjection({ run_id: "run_1" }), "openrouter")

    expect(view.empty).toBe(false)
    expect(view.provider).toBe("openrouter")
    expect(view.region).toBe("global")
    expect(view.route).toBe("gateway")
    expect(view.usage_style).toBe("openai-compatible")
  })

  test("infers provider from provider action", () => {
    const action = createEngineAction({
      id: "act_provider",
      source: "builder",
      kind: "provider",
      name: "ollama",
      input_summary: "route local model",
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "action", action })
    const view = sovereigntyCompatView(projection)

    expect(view.provider).toBe("ollama")
    expect(view.route).toBe("local")
  })

  test("renders compat health", () => {
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
    const view = sovereigntyCompatView(projection, "deepseek")

    expect(view.compat).toBe("2 active / 1 blocking")
    expect(sovereigntyNeedsAttention(view)).toBe(true)
  })
})
