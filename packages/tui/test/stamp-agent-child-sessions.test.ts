import { describe, expect, test } from "bun:test"
import { stampAgentChildSessions } from "../src/shell/command-spine/use-spine-projection"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"

function agentEntry(id: string, actor: string, sessionID?: string): SpineEntry {
  return {
    id,
    index: 0,
    elapsed: "",
    kind: "agent",
    glyph: "◈",
    summary: `subagent: ${actor}`,
    label: actor,
    actor,
    source: { messageID: "msg-1", partID: id, kind: "agent", sessionID },
  } as SpineEntry
}

describe("stampAgentChildSessions", () => {
  test("leaves entries unchanged when there are no child sessions", () => {
    const entries = [agentEntry("p1", "research")]
    const result = stampAgentChildSessions({ entries, sessions: [], parentSessionID: "parent" })
    expect(result[0]!.source?.sessionID).toBeUndefined()
  })

  test("stamps the newest child when no agent name matches", () => {
    const entries = [agentEntry("p1", "unmatched")]
    const sessions = [
      { id: "child-1", parentID: "parent", time: { created: 1000 }, title: "task (@research subagent)" },
      { id: "child-2", parentID: "parent", time: { created: 2000 }, title: "task (@general subagent)" },
    ]
    const result = stampAgentChildSessions({ entries, sessions, parentSessionID: "parent" })
    expect(result[0]!.source?.sessionID).toBe("child-2")
  })

  test("matches each agent row to the child whose title names its actor", () => {
    const entries = [
      agentEntry("p1", "research"),
      agentEntry("p2", "general"),
      agentEntry("p3", "unknown"),
    ]
    const sessions = [
      { id: "research-child", parentID: "parent", time: { created: 2000 }, title: "t1 (@research subagent)" },
      { id: "general-child", parentID: "parent", time: { created: 1000 }, title: "t2 (@general subagent)" },
    ]
    const result = stampAgentChildSessions({ entries, sessions, parentSessionID: "parent" })
    expect(result[0]!.source?.sessionID).toBe("research-child")
    expect(result[1]!.source?.sessionID).toBe("general-child")
    expect(result[2]!.source?.sessionID).toBe("research-child")
  })

  test("does not overwrite an existing per-part sessionID", () => {
    const entries = [agentEntry("p1", "research", "already-linked")]
    const sessions = [{ id: "child-1", parentID: "parent", time: { created: 1000 }, title: "t (@research subagent)" }]
    const result = stampAgentChildSessions({ entries, sessions, parentSessionID: "parent" })
    expect(result[0]!.source?.sessionID).toBe("already-linked")
  })

  test("ignores sessions belonging to other parents", () => {
    const entries = [agentEntry("p1", "research")]
    const sessions = [{ id: "child-1", parentID: "other", time: { created: 1000 }, title: "t (@research subagent)" }]
    const result = stampAgentChildSessions({ entries, sessions, parentSessionID: "parent" })
    expect(result[0]!.source?.sessionID).toBeUndefined()
  })
})
