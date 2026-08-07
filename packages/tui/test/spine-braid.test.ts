import { describe, expect, test } from "bun:test"
import { braidStatusFor, buildSubagentBraid } from "../src/shell/command-spine/spine-braid.ts"

describe("PR6 subagent braids", () => {
  test("running session with busy status stays running", () => {
    expect(braidStatusFor({ type: "busy" }, undefined)).toBe("running")
  })

  test("retry status is a crash with parent unaffected", () => {
    const status = { type: "retry" as const, attempt: 2, message: "spawn failed", next: 0 }
    expect(braidStatusFor(status, undefined)).toBe("crashed")
  })

  test("completed assistant marks the branch completed", () => {
    const messages = [
      { id: "u", sessionID: "child", role: "user" as const, time: { created: 1 }, agent: "a", model: { providerID: "p", modelID: "m" } },
      {
        id: "a",
        sessionID: "child",
        role: "assistant" as const,
        time: { created: 2, completed: 2000 },
        parentID: "u",
        modelID: "m",
        providerID: "p",
        mode: "mode",
        agent: "a",
        path: { cwd: "/", root: "/" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]
    expect(braidStatusFor(undefined, messages as never)).toBe("completed")
  })

  test("buildSubagentBraid renders branches with real status lines", () => {
    const braid = buildSubagentBraid({
      sessions: [
        {
          id: "child-1",
          slug: "s",
          projectID: "p",
          directory: "/repo",
          parentID: "parent",
          title: "security-review",
          agent: "security-review",
          version: "v",
          time: { created: 1, updated: 2 },
        },
      ],
      statusBySessionID: { "child-1": { type: "busy" } },
      messagesBySessionID: {},
      partsByMessageID: {},
    })

    expect(braid).toHaveLength(1)
    expect(braid[0]?.agent).toBe("security-review")
    expect(braid[0]?.status).toBe("running")
    expect(braid[0]?.line).toBe("starting")
    expect(braid[0]?.detail).toContain("pid unavailable")
  })
})
