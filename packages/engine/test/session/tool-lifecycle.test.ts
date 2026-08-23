import { describe, expect, test } from "bun:test"
import type { SessionV1 } from "@arcana/core/v1/session"
import { recoverCompletedTurnTools } from "../../src/session/tool-lifecycle"

function assistant(id: string, parts: SessionV1.Part[], completed?: number): SessionV1.WithParts {
  return {
    info: {
      id,
      role: "assistant",
      sessionID: "session",
      parentID: "parent",
      mode: "build",
      agent: "build",
      path: { cwd: "/", root: "/" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: "model",
      providerID: "provider",
      time: { created: 100, completed },
      finish: completed === undefined ? undefined : "stop",
    },
    parts,
  } as unknown as SessionV1.WithParts
}

function running(id: string, start = 120): SessionV1.ToolPart {
  return {
    id,
    type: "tool",
    sessionID: "session",
    messageID: "assistant",
    callID: `call-${id}`,
    tool: "bash",
    state: {
      status: "running",
      input: { command: "bun test" },
      title: "bash",
      output: "partial",
      metadata: { progress: true },
      time: { start },
    },
  } as unknown as SessionV1.ToolPart
}

describe("recoverCompletedTurnTools", () => {
  test("terminalizes stale running tools without inventing success", () => {
    const result = recoverCompletedTurnTools([assistant("assistant", [running("tool")], 500)], false, 900)
    const tool = result.messages[0]!.parts[0] as SessionV1.ToolPart

    expect(result.recovered).toHaveLength(1)
    expect(tool.state).toMatchObject({
      status: "cancelled",
      reason: "recovered_stale",
      input: { command: "bun test" },
      output: "partial",
      metadata: { progress: true },
      time: { start: 120, end: 500 },
    })
  })

  test("repairs superseded assistants but leaves the live tail running", () => {
    const old = assistant("old", [running("old")])
    const live = assistant("live", [running("live")])
    const result = recoverCompletedTurnTools([old, live], false, 900)

    expect((result.messages[0]!.parts[0] as SessionV1.ToolPart).state.status).toBe("cancelled")
    expect((result.messages[1]!.parts[0] as SessionV1.ToolPart).state.status).toBe("running")
    expect(result.recovered).toHaveLength(1)
  })

  test("idle recovery can terminalize the latest orphan", () => {
    const result = recoverCompletedTurnTools([assistant("live", [running("live")])], true, 900)
    const state = (result.messages[0]!.parts[0] as SessionV1.ToolPart).state

    expect(state.status).toBe("cancelled")
    if (state.status === "cancelled") expect(state.time.end).toBe(900)
  })

  test("does not rewrite completed tools", () => {
    const completed = {
      ...running("done"),
      state: {
        status: "completed",
        input: {},
        output: "ok",
        title: "bash",
        metadata: {},
        time: { start: 120, end: 130 },
      },
    } as unknown as SessionV1.ToolPart
    const result = recoverCompletedTurnTools([assistant("assistant", [completed], 500)], true, 900)

    expect(result.recovered).toHaveLength(0)
    expect(result.messages[0]!.parts[0]).toBe(completed)
  })
})
