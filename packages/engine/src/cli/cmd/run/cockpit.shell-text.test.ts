import { describe, expect, test } from "bun:test"
import { createEmptyCockpitProjection } from "./cockpit.projection-store"
import { createCockpitShell } from "./cockpit.shell"
import { cockpitMissionLine, cockpitShellFingerprint, cockpitShellText } from "./cockpit.shell-text"

describe("Arcana cockpit shell text view", () => {
  test("renders a mission-first text view", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" }))
    const lines = cockpitShellText(shell)

    expect(lines[0]).toContain("ARCANA MISSION")
    expect(lines[0]).toContain("ship cockpit")
    expect(lines.some((line) => line.includes("Action Timeline"))).toBe(true)
    expect(lines.some((line) => line.includes("Proof Ledger"))).toBe(true)
    expect(lines.some((line) => line.includes("Token Console"))).toBe(true)
    expect(lines.some((line) => line.includes("Sovereignty / Compat"))).toBe(true)
  })

  test("keeps deterministic shell fingerprint", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(cockpitShellFingerprint(shell)).toBe(
      "14:mission-header|15:action-timeline|16:diffgate-queue|17:risk-cockpit|18:verifier-board|19:proof-ledger|20:token-console|21:sovereignty-compat",
    )
  })

  test("mission line respects width", () => {
    const shell = createCockpitShell(createEmptyCockpitProjection({ run_id: "run_1", objective: "a very long mission objective" }))

    expect(cockpitMissionLine(shell, 20).length).toBeLessThanOrEqual(20)
  })
})
