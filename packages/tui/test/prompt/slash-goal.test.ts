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

function makeHarness(inputText: string, opts: { goalStatus?: string; goal?: string; targetSessionID?: string } = {}) {
  const shown: any[] = []
  const setSessionGoalCalls: Array<{ sessionID: string; patch: any }> = []
  const claimCompletionCalls: string[] = []
  const kickoffs: string[] = []
  const goalModule = {
    setSessionGoal: (sessionID: string, patch: any) => {
      setSessionGoalCalls.push({ sessionID, patch })
    },
    getSessionGoal: (_sessionID: string) => ({
      status: opts.goalStatus ?? "unset",
      goal: opts.goal ?? "",
    }),
    formatActiveGoalBlock: (_o: any) => "<active-goal>block</active-goal>",
    patchSessionGoal: (sessionID: string, patch: any) => {
      setSessionGoalCalls.push({ sessionID, patch })
    },
    claimSessionGoalCompletion: (sessionID: string) => {
      claimCompletionCalls.push(sessionID)
    },
  }
  const deps: SlashGoalDeps = {
    inputText,
    targetSessionID: opts.targetSessionID ?? "ses_test",
    agentName: "build",
    toast: { show: (t: any) => shown.push(t) },
    loadGoalModule: () => Promise.resolve(goalModule as any),
    onKickoff: (task: string) => kickoffs.push(task),
  }
  return { deps, shown, setSessionGoalCalls, claimCompletionCalls, kickoffs }
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

  test("valid goal sets in_progress then kicks the turn off", async () => {
    const { deps, shown, setSessionGoalCalls, kickoffs } = makeHarness("/goal ship the release")
    const res = runGoalCommand(deps)
    await flush()
    // fall-off contract: the caller reaches markSubmit; the kickoff callback
    // submits the self-driven turn after the goal is durably stored.
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls).toEqual([
      { sessionID: "ses_test", patch: { goal: "ship the release", status: "in_progress", newRevision: true } },
    ])
    expect(kickoffs).toEqual(["ship the release"])
    expect(shown[0].title).toBe("Goal set")
    expect(shown[0].variant).toBe("success")
  })

  test("without a session the goal is never written to an empty path", async () => {
    const { deps, shown, setSessionGoalCalls, kickoffs } = makeHarness("/goal ship it", { targetSessionID: "" })
    const res = runGoalCommand(deps)
    await flush()
    expect(res).toBe(true)
    expect(setSessionGoalCalls.length).toBe(0)
    expect(kickoffs.length).toBe(0)
    expect(shown[0].message).toContain("Open a session first")
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
    const { deps, setSessionGoalCalls, kickoffs } = makeHarness("/loop status", { goalStatus: "in_progress", goal: "x" })
    const res = runLoopCommand(deps)
    await flush()
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls.length).toBe(0)
    expect(kickoffs.length).toBe(0)
  })

  test("/loop set records the goal and kicks the turn off", async () => {
    const { deps, setSessionGoalCalls, kickoffs } = makeHarness("/loop set ship the release")
    runLoopCommand(deps)
    await flush()
    expect(setSessionGoalCalls).toEqual([
      { sessionID: "ses_test", patch: { goal: "ship the release", status: "in_progress", newRevision: true } },
    ])
    expect(kickoffs).toEqual(["ship the release"])
  })

  test("/loop <task> drives even when a goal is already open", async () => {
    const { deps, setSessionGoalCalls, kickoffs } = makeHarness("/loop fix the failing tests", {
      goalStatus: "in_progress",
      goal: "ship the release",
    })
    runLoopCommand(deps)
    await flush()
    expect(setSessionGoalCalls.length).toBe(0)
    expect(kickoffs).toEqual(["fix the failing tests"])
  })

  test("/loop <task> auto-sets the goal when unset and drives with the full text", async () => {
    const { deps, setSessionGoalCalls, kickoffs } = makeHarness("/loop fix the failing tests", { goalStatus: "unset" })
    runLoopCommand(deps)
    await flush()
    expect(setSessionGoalCalls[0]?.patch.goal).toBe("fix the failing tests")
    expect(kickoffs).toEqual(["fix the failing tests"])
  })

  test("/loop <task> never kicks off while completion is pending verification", async () => {
    const { deps, shown, kickoffs } = makeHarness("/loop keep going", { goalStatus: "complete_pending_verify" })
    runLoopCommand(deps)
    await flush()
    expect(kickoffs.length).toBe(0)
    // The state is named in the title; the message names the way out of it.
    expect(shown[0].title).toContain("pending verification")
    expect(shown[0].message).toContain("/goal")
  })

  test("done submits the existing goal for independent verification", async () => {
    const { deps, shown, setSessionGoalCalls, claimCompletionCalls, kickoffs } = makeHarness("/loop done", {
      goalStatus: "in_progress",
      goal: "ship it",
    })
    const res = runLoopCommand(deps)
    await flush()
    expect(res).toBeUndefined()
    expect(setSessionGoalCalls).toEqual([])
    expect(claimCompletionCalls).toEqual(["ses_test"])
    expect(kickoffs.length).toBe(0)
    expect(shown.at(-1)?.message).toBe("complete_pending_verify")
  })
})
