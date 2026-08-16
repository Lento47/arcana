import { afterEach, describe, expect, test } from "bun:test"
import {
  addOptimisticMessage,
  allOptimisticMessages,
  clearOptimisticMessages,
  filterCoveredOptimistics,
  normalizeOptimisticText,
  realUserMessageHasText,
  remapOptimisticSession,
  type OptimisticUserMessage,
} from "../src/component/prompt/optimistic"
import { messagesToSpineEntries } from "../src/shell/command-spine/spine-mapper"
import type { Message, Part } from "@arcana/sdk/v2"

describe("optimistic merge helpers", () => {
  afterEach(() => {
    clearOptimisticMessages()
  })

  test("realUserMessageHasText is false without text parts", () => {
    expect(realUserMessageHasText({ id: "u1", role: "user" }, [])).toBe(false)
    expect(
      realUserMessageHasText(
        { id: "u1", role: "user" },
        [{ type: "text", text: "  ", synthetic: false }],
      ),
    ).toBe(false)
  })

  test("realUserMessageHasText is true with non-empty text part", () => {
    expect(
      realUserMessageHasText(
        { id: "u1", role: "user" },
        [{ type: "text", text: "hello world", synthetic: false }],
      ),
    ).toBe(true)
  })

  test("filterCoveredOptimistics keeps echo until real text arrives", () => {
    const opts: OptimisticUserMessage[] = [
      {
        id: "optimistic-1",
        sessionID: "s1",
        text: "can you create a game?",
        timestamp: 1,
        agent: "build",
        model: { providerID: "x", modelID: "y" },
      },
    ]
    expect(filterCoveredOptimistics(opts, [])).toHaveLength(1)
    expect(filterCoveredOptimistics(opts, ["can you create a game?"])).toHaveLength(0)
  })

  test("normalizeOptimisticText trims", () => {
    expect(normalizeOptimisticText("  hi\r\n")).toBe("hi")
  })

  test("remapOptimisticSession moves only the pending stub's local echo", () => {
    const message = {
      id: "optimistic-1",
      sessionID: "pending-stub",
      text: "hello",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    } satisfies OptimisticUserMessage
    const unrelated = { ...message, id: "optimistic-2", sessionID: "other-session" }
    addOptimisticMessage(message)
    addOptimisticMessage(unrelated)

    remapOptimisticSession("pending-stub", "real-session")

    const messages = allOptimisticMessages()
    expect(messages.find((item) => item.id === "optimistic-1")?.sessionID).toBe("real-session")
    expect(messages.find((item) => item.id === "optimistic-2")?.sessionID).toBe("other-session")
  })

  test("clearOptimisticMessages removes only the requested session's echo", () => {
    const message = {
      id: "optimistic-1",
      sessionID: "session-a",
      text: "hello",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    } satisfies OptimisticUserMessage
    addOptimisticMessage(message)
    addOptimisticMessage({ ...message, id: "optimistic-2", sessionID: "session-b" })

    clearOptimisticMessages("session-a")

    expect(allOptimisticMessages()).toEqual([
      { ...message, id: "optimistic-2", sessionID: "session-b" },
    ])
  })
})

describe("user ask never permanent ellipsis", () => {
  function partsLookup(parts: Part[]): (id: string) => Part[] {
    const map = new Map<string, Part[]>()
    for (const p of parts) {
      const arr = map.get(p.messageID) ?? []
      arr.push(p)
      map.set(p.messageID, arr)
    }
    return (id: string) => map.get(id) ?? []
  }

  test("optimistic proxy with text field and no parts still shows prompt", () => {
    const msg = {
      id: "optimistic-abc",
      sessionID: "sess-1",
      role: "user",
      time: { created: 1000 },
      agent: "build",
      model: { providerID: "p", modelID: "m" },
      text: "can you create a game?",
    } as Message & { text: string }

    const result = messagesToSpineEntries({
      messages: [msg],
      getParts: () => [],
      assistantDuration: new Map(),
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.kind).toBe("ask")
    expect(result[0]!.summary).toBe("can you create a game?")
    expect(result[0]!.summary).not.toBe("…")
  })

  test("real user message with empty parts yields no permanent ellipsis row", () => {
    const msg = {
      id: "u-real",
      sessionID: "sess-1",
      role: "user",
      time: { created: 1000 },
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    } as Message

    const result = messagesToSpineEntries({
      messages: [msg],
      getParts: partsLookup([]),
      assistantDuration: new Map(),
    })

    // Prefer omit over "you …"
    expect(result.filter((e) => e.kind === "ask")).toHaveLength(0)
  })
})
