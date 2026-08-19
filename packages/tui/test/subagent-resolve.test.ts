import { describe, expect, test } from "bun:test"
import { resolveChildSession } from "../src/routes/session/subagent-resolve"

const sessions = [
  { id: "reviewer-1", parentID: "parent", time: { created: 1000 }, title: "review main crates (@reviewer subagent)" },
  { id: "reviewer-2", parentID: "parent", time: { created: 2000 }, title: "architectural review (@reviewer subagent)" },
  { id: "explore-1", parentID: "parent", time: { created: 1500 }, title: "explore core (@explore subagent)" },
]

describe("resolveChildSession", () => {
  test("returns undefined without children", () => {
    expect(resolveChildSession({ actor: "reviewer", parentID: "parent", sessions: [] })).toBeUndefined()
  })

  test("prefers the child whose title names the actor", () => {
    expect(resolveChildSession({ actor: "explore", parentID: "parent", sessions })).toBe("explore-1")
  })

  test("falls back to the newest child when the actor does not match", () => {
    expect(resolveChildSession({ actor: "unknown", parentID: "parent", sessions })).toBe("reviewer-2")
  })

  test("ignores sessions belonging to other parents", () => {
    const other = [{ id: "child", parentID: "other", time: { created: 3000 }, title: "x (@reviewer subagent)" }]
    expect(resolveChildSession({ actor: "reviewer", parentID: "parent", sessions: [...sessions, ...other] })).toBe(
      "reviewer-2",
    )
  })

  test("is case-insensitive on the actor title", () => {
    expect(resolveChildSession({ actor: "Reviewer", parentID: "parent", sessions })).toBe("reviewer-2")
  })
})
