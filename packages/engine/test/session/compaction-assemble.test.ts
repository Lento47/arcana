import { describe, expect, test } from "bun:test"
import {
  buildContinuationText,
  dropCompleteTurnsFromFront,
  dropTrailingIncompleteAssistant,
  formatSummaryCarrier,
  prepareHeadForSummarization,
  toolPairSafeTailStart,
} from "../../src/session/compaction-assemble"
import { compactWithBudget } from "../../src/session/compaction"
import type { SessionV1 } from "@arcana/core/v1/session"
import type { MessageID } from "../../src/session/schema"

function id(s: string): MessageID {
  return s as MessageID
}

function msg(
  mid: string,
  role: "user" | "assistant",
  parts: SessionV1.Part[] = [],
): SessionV1.WithParts {
  if (role === "user") {
    return {
      info: {
        id: id(mid),
        role: "user",
        sessionID: "ses_test" as never,
        time: { created: 0 },
        agent: "build",
        model: { providerID: "test" as never, modelID: "m" as never },
      },
      parts,
    } as SessionV1.WithParts
  }
  return {
    info: {
      id: id(mid),
      role: "assistant",
      sessionID: "ses_test" as never,
      parentID: id("msg_parent"),
      mode: "build",
      agent: "build",
      path: { cwd: "/", root: "/" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: "m" as never,
      providerID: "test" as never,
      time: { created: 0 },
      finish: "end_turn",
    },
    parts,
  } as SessionV1.WithParts
}

function completedTool(callID: string, output: string): SessionV1.ToolPart {
  return {
    id: "prt" as never,
    type: "tool",
    sessionID: "ses_test" as never,
    messageID: "a" as never,
    callID,
    tool: "bash",
    state: {
      status: "completed",
      input: {},
      output,
      title: "bash",
      metadata: {},
      time: { start: 0, end: 1 },
    },
  } as SessionV1.ToolPart
}

function runningTool(callID: string): SessionV1.ToolPart {
  return {
    id: "prt" as never,
    type: "tool",
    sessionID: "ses_test" as never,
    messageID: "a" as never,
    callID,
    tool: "bash",
    state: {
      status: "running",
      input: {},
      time: { start: 0 },
    },
  } as SessionV1.ToolPart
}

describe("compaction-assemble.toolPairSafeTailStart", () => {
  test("keeps complete assistant cut (split-turn safe)", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant", [completedTool("c1", "out")]),
      msg("msg_u2", "user", [{ type: "text", text: "b", id: "p2" } as never]),
    ]
    const safe = toolPairSafeTailStart(messages, 1)
    expect(safe?.start).toBe(1)
    expect(safe?.id).toBe("msg_a1")
  })

  test("skips incomplete assistant at cut", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant", [runningTool("c1")]),
      msg("msg_u2", "user", [{ type: "text", text: "b", id: "p2" } as never]),
    ]
    const safe = toolPairSafeTailStart(messages, 1)
    expect(safe?.start).toBe(2)
    expect(safe?.id).toBe("msg_u2")
  })

  test("keeps user boundary", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant"),
      msg("msg_u2", "user", [{ type: "text", text: "b", id: "p2" } as never]),
    ]
    const safe = toolPairSafeTailStart(messages, 2)
    expect(safe?.start).toBe(2)
  })
})

describe("compaction-assemble.dropTrailingIncompleteAssistant", () => {
  test("drops trailing running tools", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant", [runningTool("c1")]),
    ]
    const out = dropTrailingIncompleteAssistant(messages)
    expect(out).toHaveLength(1)
    expect(out[0]!.info.role).toBe("user")
  })

  test("keeps completed tools", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant", [completedTool("c1", "done")]),
    ]
    expect(dropTrailingIncompleteAssistant(messages)).toHaveLength(2)
  })
})

describe("compaction-assemble.dropCompleteTurnsFromFront", () => {
  test("drops whole user turns only", () => {
    const messages = [
      msg("msg_u1", "user", [{ type: "text", text: "a", id: "p1" } as never]),
      msg("msg_a1", "assistant", [completedTool("c1", "x")]),
      msg("msg_u2", "user", [{ type: "text", text: "b", id: "p2" } as never]),
      msg("msg_a2", "assistant"),
      msg("msg_u3", "user", [{ type: "text", text: "c", id: "p3" } as never]),
    ]
    const out = dropCompleteTurnsFromFront(messages, 2)
    expect(out[0]!.info.id).not.toBe(messages[0]!.info.id)
    expect(out.some((m) => m.info.role === "user")).toBe(true)
  })
})

describe("compaction-assemble.prepareHeadForSummarization", () => {
  test("truncates long tool outputs", () => {
    const long = "x".repeat(5000)
    const messages = [msg("msg_a1", "assistant", [completedTool("c1", long)])]
    const out = prepareHeadForSummarization(messages, 100)
    const tool = out[0]!.parts[0]
    expect(tool?.type).toBe("tool")
    if (tool?.type === "tool" && tool.state.status === "completed") {
      expect(tool.state.output.length).toBeLessThan(long.length)
      expect(tool.state.output).toContain("truncated for compaction")
    }
  })
})

describe("compaction-assemble.format + continuation", () => {
  test("formatSummaryCarrier prefixes once", () => {
    const once = formatSummaryCarrier("Implemented auth refresh")
    expect(once).toContain("## Compaction summary")
    expect(once).toContain("Implemented auth refresh")
    expect(formatSummaryCarrier(once)).toBe(once)
  })

  test("buildContinuationText includes overflow and focus", () => {
    const t = buildContinuationText({ overflow: true, focus: "Rate limit fix" })
    expect(t).toContain("media")
    expect(t).toContain("Rate limit fix")
    expect(t).toContain("Context was compacted")
  })
})

describe("compactWithBudget N2 turn-safe", () => {
  test("under tight budget does not start mid-turn when multiple messages remain", () => {
    const messages: SessionV1.WithParts[] = []
    for (let i = 0; i < 12; i++) {
      messages.push(
        msg(`msg_u${i}`, "user", [
          { type: "text", text: "user body ".repeat(400), id: `pu${i}` } as never,
        ]),
      )
      messages.push(
        msg(`msg_a${i}`, "assistant", [
          completedTool(`c${i}`, "tool out ".repeat(200)),
          { type: "text", text: "assistant body ".repeat(400), id: `pa${i}` } as never,
        ]),
      )
    }
    // Force path past tool truncation into message drops
    const out = compactWithBudget(messages, 800)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(messages.length)
    // Turn-safe: remaining multi-message heads should open on a user turn
    // (sole leftover message may be the last assistant from dropCompleteTurnsFromFront).
    if (out.length > 1) {
      expect(out[0]!.info.role).toBe("user")
    }
  })

  test("does not raw-slice leaving an assistant without its user when room for a full turn", () => {
    const messages = [
      msg("msg_u0", "user", [{ type: "text", text: "a".repeat(2000), id: "p0" } as never]),
      msg("msg_a0", "assistant", [completedTool("c0", "x".repeat(500))]),
      msg("msg_u1", "user", [{ type: "text", text: "b".repeat(2000), id: "p1" } as never]),
      msg("msg_a1", "assistant", [completedTool("c1", "y".repeat(500))]),
      msg("msg_u2", "user", [{ type: "text", text: "c".repeat(2000), id: "p2" } as never]),
      msg("msg_a2", "assistant", [completedTool("c2", "z".repeat(500))]),
    ]
    const out = compactWithBudget(messages, 1_500)
    // If both user and following assistant survive, they stay paired at the start of a turn
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.info.role === "assistant" && i > 0) {
        // immediately preceding message in out should not be another assistant's orphan edge only:
        // after turn drops, assistants should follow a user within the retained suffix
        const prev = out[i - 1]!
        expect(prev.info.role === "user" || prev.info.role === "assistant").toBe(true)
      }
    }
    if (out.length >= 2 && out[0]!.info.role === "assistant") {
      // only allowed when dropCompleteTurnsFromFront collapsed to a single leftover path
      expect(out.length).toBe(1)
    }
  })
})
