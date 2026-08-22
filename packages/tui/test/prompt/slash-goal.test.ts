/**
 * Unit coverage for /goal and /loop command handlers (component/prompt/slash-goal.ts).
 *
 * Only synchronous paths + injected goal-module spies: no real state, no disk.
 * Return contract under test: `true` = handled/stop chain; `undefined` =
 * fall off the end (mirrors the original if/else-if branch semantics).
 */
import { describe, expect, test } from "bun:test"
import { runGoalCommand, runLoopCommand, type SlashGoalDeps } from "../../src/component/prompt/slash-goal"
import { errorMessage } from "../../src/util/error"

function makeHarness(inputText: string, opts: { goalStatus?: string; goal?: string } = {}) {
  const shown: any[] = []
  const setSessionGoalCalls: Array<{ sessionID: string; patch: any }> = []
  const goalModule = {
    setSessionGoal: (sessionID: string, patch: any) => {
      setSessionGoalCalls.push({ sessionID, patch })
    },
    getSessionGoal: (_sessionID: string) => ({
      status: opts.goalStatus ?? "unset",
      goal: opts.goal ?? "",
    }),
    formatActiveGoalBlock: (_o: any) => "<active-goal>block</active-goal>",
  }
  const deps: SlashGoalDeps = {
    inputText,
    targetSessionID: "ses_test",
    agentName: "build",
    toast: { show: (t: any) => shown.push(t) },
    loadGoalModule: () => Promise.resolve(goalModule as any),
  }
  return { deps, shown, setSessionGoalCalls }
}

const flush = () => new Promise<void>(r => setTimeout(r, 0))

describe("runGoalCommand", () => {
  test("rejects multi-slash submissions with a warning and handled=true", async () => {
    const { deps, shown, setSessionGoalCalls } = makeHarness("/goal fix the bug\n/lint please")
    const res = runGoalCommand(deps)
    await flush()
    expect(res).toBe(true)
    expect(shown[0].variant).toBe("warning")
    expect(shown[0].message).toContain("separately")
    expect(setSessionGoalCalls.length).toBe(0)
  })

  test("bare /goal shows usage info and is handled", async () => {
    const { deps, shown, setSessionGoalCalls } = makeHarness("/goal ")
    const res = runGoalCommand(deps)
    await flush()
    expect(res).toBe(true)
    expect(shown[0].title).toBe("Goal")
    expect(shown[0].variant).toBe("info")
    expect(setSessionGoalCalls.length).toBe(0)
  })

  test("valid goal sets in_progress then falls off the chain end", async () => {
    const { deps, shown, setSessionGoalCalls } = makeHarness("/goal ship the release")
    const res = runGoalCommand(deps)
    await flush()
    // fall-off contract: undefined lets the submit chain continue past /goal
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls).toEqual([
      { sessionID: "ses_test", patch: { goal: "ship the release", status: "in_progress" } },
    ])
    expect(shown[0].title).toBe("Goal set")
    expect(shown[0].variant).toBe("success")
  })
})

describe("runLoopCommand", () => {
  test("rejects multi-slash submissions", () => {
    const { deps, shown } = makeHarness("/loop set x\n/goal y")
    const res = runLoopCommand(deps)
    expect(res).toBe(true)
    expect(shown[0].variant).toBe("warning")
  })

  test("/loop set without description shows usage warning and is handled", () => {
    const { deps, shown } = makeHarness("/loop set")
    const res = runLoopCommand(deps)
    expect(res).toBe(true)
    expect(shown[0].title).toBe("Loop")
    expect(shown[0].variant).toBe("warning")
  })

  test("status path does not call setSessionGoal", async () => {
    const { deps, setSessionGoalCalls } = makeHarness("/loop status", { goalStatus: "in_progress", goal: "x" })
    const res = runLoopCommand(deps)
    await flush()
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls.length).toBe(0)
  })

  test("done maps an existing goal to complete_unverified", async () => {
    const { deps, shown, setSessionGoalCalls } = makeHarness("/loop done", {
      goalStatus: "in_progress",
      goal: "ship it",
    })
    const res = runLoopCommand(deps)
    await flush()
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls).toEqual([
      { sessionID: "ses_test", patch: { goal: "ship it", status: "complete_unverified" } },
    ])
    expect(shown.at(-1)?.message).toBe("complete_unverified")
  })
})
