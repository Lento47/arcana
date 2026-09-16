import { describe, expect, test } from "bun:test"
import { compareOrderingKeys, createOrderingKey } from "../src/shell/command-spine/spine-ordering"

function key(
  input: Partial<{
    sessionId: string
    sequence: number
    timestamp: string
    occurredAt: number
    source: string
    sourceEventId: string
  }> = {},
) {
  return createOrderingKey({
    sessionId: "sess-1",
    sequence: 0,
    timestamp: "",
    source: "MESSAGE",
    sourceEventId: "id",
    ...input,
  })
}

describe("spine ordering: wall clock places cross-source rows", () => {
  test("an approval created mid-turn sorts after the request that triggered it", () => {
    const userAsk = key({
      sequence: 1,
      timestamp: "5:46 PM",
      occurredAt: 1_000,
      source: "MESSAGE",
      sourceEventId: "ask",
    })
    const approval = key({
      sequence: 0,
      timestamp: "",
      occurredAt: 2_000,
      source: "APPROVAL",
      sourceEventId: "approval",
    })
    const nextTurn = key({
      sequence: 4,
      timestamp: "5:50 PM",
      occurredAt: 3_000,
      source: "MESSAGE",
      sourceEventId: "next",
    })

    expect(compareOrderingKeys(userAsk, approval)).toBeLessThan(0)
    expect(compareOrderingKeys(approval, nextTurn)).toBeLessThan(0)
  })

  test("without wall clock the sequence order is preserved", () => {
    const message = key({ sequence: 3 })
    const approval = key({ sequence: 0, source: "APPROVAL" })
    expect(compareOrderingKeys(approval, message)).toBeLessThan(0)
  })

  test("equal wall clocks fall back to the within-source sequence", () => {
    const first = key({ sequence: 1, occurredAt: 1_000, sourceEventId: "a" })
    const second = key({ sequence: 2, occurredAt: 1_000, sourceEventId: "b" })
    expect(compareOrderingKeys(first, second)).toBeLessThan(0)
  })

  test("sessions never interleave", () => {
    const a = key({ sessionId: "sess-a", occurredAt: 9_000 })
    const b = key({ sessionId: "sess-b", occurredAt: 1_000 })
    expect(compareOrderingKeys(a, b)).toBeLessThan(0)
  })
})
