import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  checkGoalToolGate,
  formatActiveGoalBlock,
  getSessionGoal,
  setSessionGoal,
  suggestAgents,
  patchSessionGoal,
} from "../../src/session/goal"

describe("session goal store", () => {
  let home: string
  let prevHome: string | undefined

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "arcana-goal-"))
    prevHome = process.env.ARCANA_HOME
    process.env.ARCANA_HOME = home
  })

  afterEach(() => {
    if (prevHome === undefined) delete process.env.ARCANA_HOME
    else process.env.ARCANA_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  test("unset by default", () => {
    expect(getSessionGoal("s1").status).toBe("unset")
  })

  test("set and get goal", () => {
    setSessionGoal("s1", { goal: "Add dark mode", scope: "UI only", priority: "high" })
    const g = getSessionGoal("s1")
    expect(g.status).not.toBe("unset")
    if (g.status === "unset") return
    expect(g.goal).toBe("Add dark mode")
    expect(g.scope).toBe("UI only")
    expect(g.priority).toBe("high")
    expect(g.status).toBe("in_progress")
  })

  test("format inject block includes agent fields", () => {
    setSessionGoal("s1", { goal: "Ship feature X" })
    const block = formatActiveGoalBlock({
      sessionID: "s1",
      sessionAgent: "build",
      actorAgent: "explore",
      actorRole: "subagent",
    })
    expect(block).toContain("<active-goal>")
    expect(block).toContain("Ship feature X")
    expect(block).toContain("session_agent: build")
    expect(block).toContain("actor_agent: explore")
    expect(block).toContain("actor_role: subagent")
  })

  test("unset block is explicit", () => {
    const block = formatActiveGoalBlock({ sessionID: "empty", sessionAgent: "build" })
    expect(block).toContain("status: unset")
    expect(block).toContain("goal_set")
  })

  test("tier B denies build edit without goal", () => {
    const r = checkGoalToolGate({ sessionID: "s1", agentName: "build", toolName: "edit" })
    expect(r.allow).toBe(false)
    if (r.allow) return
    expect(r.reason).toBe("goal_required")
  })

  test("explore read allowed without goal", () => {
    const r = checkGoalToolGate({ sessionID: "s1", agentName: "explore", toolName: "grep" })
    expect(r.allow).toBe(true)
  })

  test("build edit allowed after goal set", () => {
    setSessionGoal("s1", { goal: "Do the thing" })
    const r = checkGoalToolGate({ sessionID: "s1", agentName: "build", toolName: "edit" })
    expect(r.allow).toBe(true)
  })

  test("complete freezes mutations", () => {
    setSessionGoal("s1", { goal: "Done work", status: "complete_unverified" })
    const r = checkGoalToolGate({ sessionID: "s1", agentName: "build", toolName: "write" })
    expect(r.allow).toBe(false)
    if (r.allow) return
    expect(r.reason).toBe("goal_complete")
  })

  test("goal_set always allowed", () => {
    const r = checkGoalToolGate({ sessionID: "s1", agentName: "build", toolName: "goal_set" })
    expect(r.allow).toBe(true)
  })

  test("patch status to complete", () => {
    setSessionGoal("s1", { goal: "X" })
    patchSessionGoal("s1", { status: "complete_unverified" })
    const g = getSessionGoal("s1")
    expect(g.status).toBe("complete_unverified")
  })
})

describe("suggestAgents", () => {
  const sessionAgents = [
    { name: "build", mode: "primary" },
    { name: "plan", mode: "primary" },
    { name: "client", mode: "all" },
    { name: "architect", mode: "all" },
    { name: "reviewer", mode: "all" },
    { name: "tester", mode: "all" },
    { name: "explore", mode: "subagent", routing: { keywords: ["search", "find", "where is"] } },
    { name: "general", mode: "subagent", routing: { keywords: ["implement", "refactor"] } },
    { name: "qa", mode: "subagent", routing: { keywords: ["bug", "edge case"] } },
    { name: "title", mode: "primary", hidden: true },
  ]

  test("suggests architect for ADR request", () => {
    const s = suggestAgents({
      prompt: "Write an ADR for the new system design and boundaries",
      currentSessionAgent: "build",
      sessionAgents,
    })
    expect(s.sessionAgent?.name).toBe("architect")
  })

  test("suggests explore delegation for search", () => {
    const s = suggestAgents({
      prompt: "Where is the auth middleware defined?",
      currentSessionAgent: "build",
      sessionAgents,
    })
    expect(s.delegation?.name).toBe("explore")
  })

  test("does not suggest current session agent", () => {
    const s = suggestAgents({
      prompt: "implement a dark mode toggle",
      currentSessionAgent: "build",
      sessionAgents,
    })
    // build is current — either no session suggestion or another agent
    if (s.sessionAgent) expect(s.sessionAgent.name).not.toBe("build")
  })

  test("hidden agents never suggested for session", () => {
    const s = suggestAgents({
      prompt: "generate a title for this thread",
      currentSessionAgent: "build",
      sessionAgents,
    })
    expect(s.sessionAgent?.name).not.toBe("title")
  })
})
