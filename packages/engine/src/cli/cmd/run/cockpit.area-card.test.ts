import { describe, expect, test } from "bun:test"
import { createEmptyCockpitProjection } from "./cockpit.projection-store"
import { createCockpitShell } from "./cockpit.shell"
import { cockpitAreaCardLine, cockpitAreaCardView, cockpitAreaCardViews } from "./cockpit.area-card"

describe("Arcana cockpit area cards", () => {
  test("creates one view per shell area", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" }))
    const views = cockpitAreaCardViews(shell)

    expect(views).toHaveLength(8)
    expect(views[0]?.id).toBe("mission-header")
    expect(views[1]?.id).toBe("action-timeline")
  })

  test("maps state to card metadata", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1" }))
    const view = cockpitAreaCardView({ ...shell.areas[1]!, state: "active" })

    expect(view.state_label).toBe("live")
    expect(view.tone).toBe("normal")
    expect(view.focusable).toBe(true)
  })

  test("creates stable text line", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1" }))
    const line = cockpitAreaCardLine(cockpitAreaCardView(shell.areas[1]!))

    expect(line.includes("Action Timeline")).toBe(true)
    expect(line.includes("actions")).toBe(true)
  })
})
