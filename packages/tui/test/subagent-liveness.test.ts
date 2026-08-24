import { describe, expect, test } from "bun:test"
import { projectSubagentLiveness } from "../src/shell/command-spine/use-spine-projection"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"

function failRow(childID: string): SpineEntry {
  return {
    id: "m1:p1",
    index: 1,
    elapsed: "+1s",
    kind: "fail",
    glyph: "✗",
    actor: "explore",
    summary: "Interrupted before completion · recovery required",
    source: { messageID: "m1", partID: "p1", kind: "subtask", sessionID: childID },
  }
}

describe("projectSubagentLiveness (S1)", () => {
  test("busy child flips a failed agent row to alive", () => {
    const [row] = projectSubagentLiveness({
      entries: [failRow("child-1")],
      statuses: { "child-1": { type: "busy" } },
    })
    expect(row!.kind).toBe("agent")
    expect(row!.streaming).toBe(true)
    expect(row!.startMs).toBeGreaterThan(0)
    expect(row!.summary.startsWith("resumed · ")).toBe(true)
  })

  test("retry child counts as alive; live agent rows get the alive suffix once", () => {
    const [retried] = projectSubagentLiveness({
      entries: [failRow("c")],
      statuses: { c: { type: "retry" } },
    })
    expect(retried!.streaming).toBe(true)

    const agent: SpineEntry = {
      ...failRow("c"),
      kind: "agent",
      glyph: "◆",
      streaming: false,
      summary: "did work",
      source: { messageID: "m1", kind: "subtask", sessionID: "c" },
    }
    const [live] = projectSubagentLiveness({ entries: [agent], statuses: { c: { type: "busy" } } })
    expect(live!.summary).toBe("did work · alive")
    const [stillOne] = projectSubagentLiveness({
      entries: [{ ...agent, summary: "did work · alive" }],
      statuses: { c: { type: "busy" } },
    })
    expect(stillOne!.summary).toBe("did work · alive")
  })

  test("idle child keeps terminal history and marks resumed once", () => {
    const entry = failRow("c")
    const [marked] = projectSubagentLiveness({
      entries: [entry],
      statuses: { c: { type: "idle" } },
    })
    expect(marked!.kind).toBe("fail")
    expect(marked!.summary.endsWith("· resumed")).toBe(true)
    const [idempotent] = projectSubagentLiveness({
      entries: [marked!],
      statuses: { c: { type: "idle" } },
    })
    expect(idempotent!.summary).toBe(marked!.summary)
  })

  test("unknown/absent status leaves rows untouched (no false positives)", () => {
    const entry = failRow("c")
    const outNoMap = projectSubagentLiveness({ entries: [entry], statuses: {} })
    expect(outNoMap[0]).toBe(entry)
    const outUnknownChild = projectSubagentLiveness({
      entries: [entry],
      statuses: { other: { type: "busy" } },
    })
    expect(outUnknownChild[0]).toBe(entry)
    // Non-agent rows never change even with matching status
    const tool: SpineEntry = { ...entry, kind: "run", glyph: "#" }
    const outTool = projectSubagentLiveness({ entries: [tool], statuses: { c: { type: "busy" } } })
    expect(outTool[0]).toBe(tool)
  })

  test("rows without a stamped child are untouched", () => {
    const orphan: SpineEntry = { ...failRow("c"), source: { messageID: "m1", kind: "subtask" } }
    const out = projectSubagentLiveness({ entries: [orphan], statuses: { c: { type: "busy" } } })
    expect(out[0]).toBe(orphan)
  })
})
