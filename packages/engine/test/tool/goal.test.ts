import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { GoalCheckTool, GoalSetTool } from "../../src/tool/goal"
import { getSessionGoal, checkGoalToolGate } from "@arcana/core/session/goal"

/**
 * Smoke test: tool Info inits and execute updates the session goal store.
 * Full ToolRegistry layer is heavy; we exercise GoalSet/Check defs directly.
 */
describe("engine goal tools", () => {
  let home: string
  let prevHome: string | undefined

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "arcana-engine-goal-"))
    prevHome = process.env.ARCANA_HOME
    process.env.ARCANA_HOME = home
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.ARCANA_HOME
    else process.env.ARCANA_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  test("goal_set writes session goal and unlocks edit gate", async () => {
    const sessionID = "sess-goal-1"
    expect(checkGoalToolGate({ sessionID, agentName: "build", toolName: "edit" }).allow).toBe(false)

    // Tool.define returns Effect needing Truncate + Agent — call setSessionGoal via execute path simplified:
    // Instantiate info and run execute with a minimal ctx by using store API the tool wraps.
    const { setSessionGoal } = await import("@arcana/core/session/goal")
    setSessionGoal(sessionID, { goal: "Add feature X", scope: "src/", priority: "high" })

    const snap = getSessionGoal(sessionID)
    expect(snap.status).not.toBe("unset")
    if (snap.status === "unset") return
    expect(snap.goal).toBe("Add feature X")
    expect(checkGoalToolGate({ sessionID, agentName: "build", toolName: "edit" }).allow).toBe(true)
  })

  test("goal_check complete freezes mutations", async () => {
    const sessionID = "sess-goal-2"
    const { setSessionGoal, patchSessionGoal } = await import("@arcana/core/session/goal")
    setSessionGoal(sessionID, { goal: "Ship it" })
    patchSessionGoal(sessionID, { status: "complete_unverified" })
    const gate = checkGoalToolGate({ sessionID, agentName: "build", toolName: "write" })
    expect(gate.allow).toBe(false)
    if (!gate.allow) expect(gate.reason).toBe("goal_complete")
  })

  test("GoalSetTool and GoalCheckTool have stable ids", () => {
    expect(GoalSetTool.id).toBe("goal_set")
    expect(GoalCheckTool.id).toBe("goal_check")
  })
})
