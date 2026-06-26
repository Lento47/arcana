import { describe, expect, test } from "bun:test"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import { createCockpitShell } from "./cockpit.shell"
import { cockpitVisibleAreas } from "./cockpit.component"

describe("Arcana cockpit component", () => {
  test("cockpit mode renders all non-mission areas", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" }))

    expect(cockpitVisibleAreas(shell, "cockpit").map((area) => area.id)).toEqual([
      "action-timeline",
      "diffgate-queue",
      "risk-cockpit",
      "verifier-board",
      "proof-ledger",
      "token-console",
      "sovereignty-compat",
    ])
  })

  test("focus mode renders only the focused panel", () => {
    const projection = reduceCockpitProjection(
      createEmptyCockpitProjection({ run_id: "run_1" }),
      { type: "focus", focus: { panel: "tokens", index: 0 } },
    )
    const shell = createCockpitShell(projection, "focus")

    expect(cockpitVisibleAreas(shell, "focus").map((area) => area.id)).toEqual(["token-console"])
  })
})
