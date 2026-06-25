import { describe, expect, test } from "bun:test"
import { allow, createEngineAction, lowRisk } from "./action"
import { SessionID, MessageID } from "@/session/schema"

describe("createEngineAction", () => {
  test("creates a stable action envelope with defaults", () => {
    const action = createEngineAction({
      sessionID: SessionID.descending("ses_test"),
      messageID: MessageID.ascending("msg_test"),
      source: "agent",
      kind: "tool",
      name: "read",
      input: { path: "src/index.ts" },
    })

    expect(action.id.startsWith("act_")).toBe(true)
    expect(action.sessionID).toBe("ses_test")
    expect(action.messageID).toBe("msg_test")
    expect(action.source).toBe("agent")
    expect(action.kind).toBe("tool")
    expect(action.name).toBe("read")
    expect(action.risk.level).toBe("low")
    expect(action.policy.action).toBe("allow")
    expect(action.reversible).toBe(false)
    expect(action.time.created).toBeGreaterThan(0)
  })

  test("preserves explicit risk and policy", () => {
    const risk = lowRisk("test risk", ["verifier"])
    const policy = allow("test policy", ["tool output"])

    const action = createEngineAction({
      sessionID: SessionID.descending("ses_test"),
      source: "system",
      kind: "model",
      name: "verifier",
      input: "review this",
      risk,
      policy,
      reversible: true,
    })

    expect(action.risk).toEqual(risk)
    expect(action.policy).toEqual(policy)
    expect(action.reversible).toBe(true)
  })
})
