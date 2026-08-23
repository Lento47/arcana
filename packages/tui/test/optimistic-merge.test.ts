import { afterEach, describe, expect, test } from "bun:test"
import {
  addOptimisticMessage,
  allOptimisticMessages,
  clearOptimisticMessages,
  filterCoveredOptimistics,
  mergeOptimisticMessages,
  orderTranscriptMessages,
  pinUserBeforeOpenAssistants,
  refreshTranscriptOrder,
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
        messageID: "msg-1",
        sessionID: "s1",
        text: "can you create a game?",
        timestamp: 1,
        agent: "build",
        model: { providerID: "x", modelID: "y" },
      },
    ]
    expect(filterCoveredOptimistics(opts, new Set())).toHaveLength(1)
    expect(filterCoveredOptimistics(opts, new Set(["msg-1"]))).toHaveLength(0)
    expect(filterCoveredOptimistics(opts, new Set(["msg-other"]))).toHaveLength(1)
  })

  test("acknowledges identical prompts independently by message id", () => {
    const base: OptimisticUserMessage = {
      id: "optimistic-msg-1",
      messageID: "msg-1",
      sessionID: "s1",
      text: "same text",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    }
    const second = { ...base, id: "optimistic-msg-2", messageID: "msg-2", timestamp: 2 }

    expect(filterCoveredOptimistics([base, second], new Set(["msg-1"]))).toEqual([second])
  })

  test("delivery promotion upserts the same message id", () => {
    const base: OptimisticUserMessage = {
      id: "optimistic-msg-1",
      messageID: "msg-1",
      sessionID: "pending",
      text: "hello",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    }
    addOptimisticMessage(base)
    addOptimisticMessage({ ...base, sessionID: "real" })

    expect(allOptimisticMessages()).toEqual([{ ...base, sessionID: "real" }])
  })

  test("normalizeOptimisticText trims", () => {
    expect(normalizeOptimisticText("  hi\r\n")).toBe("hi")
  })

  test("remapOptimisticSession moves only the pending stub's local echo", () => {
    const message = {
      id: "optimistic-1",
      messageID: "msg-1",
      sessionID: "pending-stub",
      text: "hello",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    } satisfies OptimisticUserMessage
    const unrelated = { ...message, id: "optimistic-2", messageID: "msg-2", sessionID: "other-session" }
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
      messageID: "msg-1",
      sessionID: "session-a",
      text: "hello",
      timestamp: 1,
      agent: "build",
      model: { providerID: "x", modelID: "y" },
    } satisfies OptimisticUserMessage
    addOptimisticMessage(message)
    addOptimisticMessage({ ...message, id: "optimistic-2", messageID: "msg-2", sessionID: "session-b" })

    clearOptimisticMessages("session-a")

    expect(allOptimisticMessages()).toEqual([
      { ...message, id: "optimistic-2", messageID: "msg-2", sessionID: "session-b" },
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

  test("mergeOptimisticMessages puts the echo after history and before live thinking", () => {
    const history = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a1", role: "assistant" as const, time: { created: 2000, completed: 2500 } },
    ]
    const thinking = { id: "a2", role: "assistant" as const, time: { created: 4000 } }
    const opt: OptimisticUserMessage = {
      id: "optimistic-1",
      messageID: "msg-1",
      sessionID: "s1",
      text: "hello",
      timestamp: 3000,
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    }
    const prepended = [opt, ...history, thinking]
    expect(prepended.map((m) => m.id)).toEqual(["optimistic-1", "u1", "a1", "a2"])

    const merged = mergeOptimisticMessages([...history, thinking], [opt])
    expect(merged.map((m) => m.id)).toEqual(["u1", "a1", "optimistic-1", "a2"])
    expect(merged.map((m) => m.id).join()).not.toBe(prepended.map((m) => m.id).join())
  })

  test("this-turn thinking that arrived first (parentID) sits under the user send", () => {
    const jumped = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a2", role: "assistant" as const, parentID: "u2", time: { created: 1500 } },
      { id: "u2", role: "user" as const, time: { created: 3000 } },
    ]
    expect(jumped.map((m) => m.id)).toEqual(["u1", "a2", "u2"])
    expect(orderTranscriptMessages(jumped).map((m) => m.id)).toEqual(["u1", "u2", "a2"])
    expect(pinUserBeforeOpenAssistants(jumped).map((m) => m.id)).toEqual(["u1", "u2", "a2"])
  })

  test("completed prior-turn assistant stays above the next user send", () => {
    const prior = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a1", role: "assistant" as const, parentID: "u1", time: { created: 2000, completed: 2500 } },
      { id: "u2", role: "user" as const, time: { created: 3000 } },
    ]
    expect(pinUserBeforeOpenAssistants(prior).map((m) => m.id)).toEqual(["u1", "a1", "u2"])
  })

  test("open prior-turn thinking is not pulled under a later user send", () => {
    const queued = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a1", role: "assistant" as const, parentID: "u1", time: { created: 1100 } },
      { id: "u2", role: "user" as const, time: { created: 3000 } },
    ]
    expect(orderTranscriptMessages(queued).map((m) => m.id)).toEqual(["u1", "a1", "u2"])
  })

  test("id-sorted store still renders you → thought → you → thought", () => {
    // Sync inserts by id. UUID order is not send order.
    const idSorted = [
      { id: "aaa-thought-hey", role: "assistant" as const, parentID: "zzz-you-hey", time: { created: 1100 } },
      { id: "mmm-you-hi", role: "user" as const, time: { created: 3000 } },
      { id: "nnn-thought-hi", role: "assistant" as const, parentID: "mmm-you-hi", time: { created: 3100 } },
      { id: "sss-you-something", role: "user" as const, time: { created: 2000 } },
      { id: "ttt-thought-something", role: "assistant" as const, parentID: "sss-you-something", time: { created: 2100 } },
      { id: "zzz-you-hey", role: "user" as const, time: { created: 1000 } },
    ]
    expect(orderTranscriptMessages(idSorted).map((m) => m.id)).toEqual([
      "zzz-you-hey",
      "aaa-thought-hey",
      "sss-you-something",
      "ttt-thought-something",
      "mmm-you-hi",
      "nnn-thought-hi",
    ])
  })

  test("parentID wins when a later user was sent before the prior reply started", () => {
    const queued = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "u2", role: "user" as const, time: { created: 2000 } },
      { id: "a1", role: "assistant" as const, parentID: "u1", time: { created: 3000 } },
      { id: "a2", role: "assistant" as const, parentID: "u2", time: { created: 4000 } },
    ]
    expect(orderTranscriptMessages(queued).map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"])
  })

  test("mergeOptimisticMessages leaves a prior open reply on its own user", () => {
    const stored = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a2", role: "assistant" as const, parentID: "u1", time: { created: 1100 } },
    ]
    const opt: OptimisticUserMessage = {
      id: "optimistic-1",
      messageID: "msg-1",
      sessionID: "s1",
      text: "hello",
      timestamp: 5000,
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    }
    expect(mergeOptimisticMessages(stored, [opt]).map((m) => m.id)).toEqual([
      "u1",
      "a2",
      "optimistic-1",
    ])
  })

  test("mergeOptimisticMessages puts echo before a reply already parented to that send", () => {
    const stored = [
      { id: "u1", role: "user" as const, time: { created: 1000 } },
      { id: "a1", role: "assistant" as const, parentID: "u1", time: { created: 1100, completed: 1200 } },
      { id: "a2", role: "assistant" as const, parentID: "optimistic-1", time: { created: 5100 } },
    ]
    const opt: OptimisticUserMessage = {
      id: "optimistic-1",
      messageID: "msg-1",
      sessionID: "s1",
      text: "hello",
      timestamp: 5000,
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    }
    expect(mergeOptimisticMessages(stored, [opt]).map((m) => m.id)).toEqual([
      "u1",
      "a1",
      "optimistic-1",
      "a2",
    ])
  })

  test("mergeOptimisticMessages appends when nothing newer has arrived", () => {
    const history = [{ id: "u1", role: "user" as const, time: { created: 1000 } }]
    const opt: OptimisticUserMessage = {
      id: "optimistic-1",
      messageID: "msg-1",
      sessionID: "s1",
      text: "hello",
      timestamp: 3000,
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    }
    expect(mergeOptimisticMessages(history, [opt]).map((m) => m.id)).toEqual(["u1", "optimistic-1"])
  })

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

  test("mapper on ordered turns never puts a thought above its you", () => {
    const user = (id: string, created: number, text: string): Message =>
      ({
        id,
        sessionID: "sess-1",
        role: "user",
        time: { created },
        agent: "default",
        model: { providerID: "test", modelID: "test" },
        text,
      }) as Message

    const assistant = (id: string, parentID: string, created: number): Message =>
      ({
        id,
        sessionID: "sess-1",
        role: "assistant",
        time: { created },
        parentID,
        modelID: "test-model",
        providerID: "test-provider",
        mode: "default",
        agent: "default",
        path: { cwd: "/", root: "/" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      }) as Message

    const idSorted: Message[] = [
      assistant("aaa-a-hey", "zzz-u-hey", 1100),
      user("mmm-u-hi", 3000, "hi"),
      assistant("nnn-a-hi", "mmm-u-hi", 3100),
      user("sss-u-something", 2000, "something"),
      assistant("ttt-a-something", "sss-u-something", 2100),
      user("zzz-u-hey", 1000, "hey"),
    ]
    const ordered = orderTranscriptMessages(idSorted)
    const partsByMessage: Record<string, Part[]> = {
      "zzz-u-hey": [{ id: "p-hey", sessionID: "sess-1", messageID: "zzz-u-hey", type: "text", text: "hey" } as Part],
      "sss-u-something": [
        { id: "p-something", sessionID: "sess-1", messageID: "sss-u-something", type: "text", text: "something" } as Part,
      ],
      "mmm-u-hi": [{ id: "p-hi", sessionID: "sess-1", messageID: "mmm-u-hi", type: "text", text: "hi" } as Part],
      "aaa-a-hey": [
        {
          id: "r-hey",
          sessionID: "sess-1",
          messageID: "aaa-a-hey",
          type: "reasoning",
          text: "the user said hey",
        } as Part,
        { id: "t-hey", sessionID: "sess-1", messageID: "aaa-a-hey", type: "text", text: "Hello!" } as Part,
      ],
      "ttt-a-something": [
        {
          id: "r-something",
          sessionID: "sess-1",
          messageID: "ttt-a-something",
          type: "reasoning",
          text: "the user said something",
        } as Part,
        { id: "t-something", sessionID: "sess-1", messageID: "ttt-a-something", type: "text", text: "Okay." } as Part,
      ],
      "nnn-a-hi": [
        { id: "r-hi", sessionID: "sess-1", messageID: "nnn-a-hi", type: "reasoning", text: "the user said hi" } as Part,
        { id: "t-hi", sessionID: "sess-1", messageID: "nnn-a-hi", type: "text", text: "Hi!" } as Part,
      ],
    }

    const scrambled = messagesToSpineEntries({
      messages: idSorted,
      getParts: (id) => partsByMessage[id] ?? [],
      assistantDuration: new Map(),
    })
    expect(scrambled.filter((e) => !e.hidden).map((e) => `${e.kind}:${e.summary}`)).not.toEqual([
      "ask:hey",
      "think:Thought",
      "plan:Hello!",
      "ask:something",
      "think:Thought",
      "plan:Okay.",
      "ask:hi",
      "think:Thought",
      "plan:Hi!",
    ])

    const linear = messagesToSpineEntries({
      messages: ordered,
      getParts: (id) => partsByMessage[id] ?? [],
      assistantDuration: new Map(),
    })
    expect(linear.filter((e) => !e.hidden).map((e) => `${e.kind}:${e.summary}`)).toEqual([
      "ask:hey",
      "think:Thought",
      "plan:Hello!",
      "ask:something",
      "think:Thought",
      "plan:Okay.",
      "ask:hi",
      "think:Thought",
      "plan:Hi!",
    ])
  })
})

describe("refreshTranscriptOrder", () => {
  const u1 = { id: "u1", role: "user" as const, time: { created: 1000 } }
  const a1 = { id: "a1", role: "assistant" as const, parentID: "u1", time: { created: 2000 } }
  const u2 = { id: "u2", role: "user" as const, time: { created: 3000 } }

  test("returns the same array when membership and objects are unchanged", () => {
    const stored = [u1, a1, u2]
    const first = refreshTranscriptOrder(stored, undefined)
    const second = refreshTranscriptOrder(stored, first)
    expect(second).toBe(first)
  })

  test("remaps object slots without reordering when identities change", () => {
    const stored = [u1, a1, u2]
    const first = refreshTranscriptOrder(stored, undefined)
    const a1b = { ...a1, time: { created: 2000, completed: 2500 } }
    const nextStored = [u1, a1b, u2]
    const remapped = refreshTranscriptOrder(nextStored, first)
    expect(remapped).not.toBe(first)
    expect(remapped.map((m) => m.id)).toEqual(first.map((m) => m.id))
    expect(remapped.find((m) => m.id === "a1")).toBe(a1b)
  })

  test("reorders when membership changes", () => {
    const first = refreshTranscriptOrder([u1, a1], undefined)
    const next = refreshTranscriptOrder([u1, a1, u2], first)
    expect(next.map((m) => m.id)).toEqual(["u1", "a1", "u2"])
    expect(next).not.toBe(first)
  })
})
