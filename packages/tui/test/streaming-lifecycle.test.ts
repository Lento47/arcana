import { describe, expect, test } from "bun:test"
import { messagesToSpineEntriesCached } from "../src/shell/command-spine/spine-mapper"
import type { Message, Part } from "@arcana/sdk/v2"

/**
 * REPRO: replay the exact event sequence from tui-debug.log through
 * messagesToSpineEntriesCached with the SAME cache object reused across runs
 * (mirrors CommandSpineShell's sessionState.cache) and message/part object
 * identity kept stable (mirrors SolidJS store proxies surviving reconcile).
 */
function makeFixtures() {
  const userMsg: Message = {
    id: "u1",
    sessionID: "sess-1",
    role: "user",
    time: { created: 1000 },
    agent: "default",
    model: { providerID: "test", modelID: "test" },
  } as Message
  const userPart: Part = {
    id: "u1-text-0",
    sessionID: "sess-1",
    messageID: "u1",
    type: "text",
    text: "hi",
  } as Part

  const asstMsg: Message = {
    id: "a1",
    sessionID: "sess-1",
    role: "assistant",
    time: { created: 2000 },
    parentID: "parent-0",
    modelID: "test-model",
    providerID: "test-provider",
    mode: "default",
    agent: "default",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  } as Message

  const reasoning: Part = {
    id: "r1",
    sessionID: "sess-1",
    messageID: "a1",
    type: "reasoning",
    text: "thinking about the reply",
  } as Part
  const text: Part = {
    id: "t1",
    sessionID: "sess-1",
    messageID: "a1",
    type: "text",
    text: "Hello!",
  } as Part

  const messages = [userMsg, asstMsg]
  const parts: Part[] = [reasoning, text]

  const getParts = (id: string) => (id === "a1" ? parts : id === "u1" ? [userPart] : [])

  return { messages, parts, reasoning, text, getParts }
}

describe("repro: streaming lifecycle through cached mapper (debug-log replay)", () => {
  test("final idle run must produce streaming=false entries even with reused cache", () => {
    const { messages, parts, getParts } = makeFixtures()
    const assistantDuration = new Map<string, number>()
    const getPartRevision = () => 0
    let cache: ReturnType<typeof messagesToSpineEntriesCached>["cache"] | undefined
    let previousEntries: ReturnType<typeof messagesToSpineEntriesCached>["entries"] = []

    const run = (sessionStatusType: string | undefined) => {
      const result = messagesToSpineEntriesCached({
        messages,
        getParts,
        getPartRevision,
        assistantDuration,
        cache,
        previousEntries,
        sessionStatusType,
      })
      cache = result.cache
      previousEntries = result.entries
      return result.entries
    }

    // Phase 1: busy, parts open → plan streams (debug log: 10x busy msgs=2).
    // Think already superseded once the text part exists (hasLaterContentPart) — by design.
    let entries = run("busy")
    const think1 = entries.find((e) => e.kind === "think")
    const plan1 = entries.find((e) => e.kind === "plan")
    expect(think1?.streaming).toBe(false) // superseded by later text part
    expect(plan1?.streaming).toBe(true)

    // Phase 2: reasoning part gets time.end (debug log line) — think stops, plan continues
    ;(parts[0] as any).time = { end: 3000 }
    entries = run("busy")
    expect(entries.find((e) => e.kind === "think")?.streaming).toBe(false)
    expect(entries.find((e) => e.kind === "plan")?.streaming).toBe(true)

    // Phase 3: text part gets time.end — plan stops via partEnded even while busy
    ;(parts[1] as any).time = { end: 3200 }
    entries = run("busy")
    expect(entries.find((e) => e.kind === "plan")?.streaming).toBe(false)

    // Phase 4: message.updated completed + session idle (debug log: final idle fire)
    ;(messages[1] as any).time.completed = 3400
    entries = run("idle")
    expect(entries.find((e) => e.kind === "think")?.streaming).toBe(false)
    expect(entries.find((e) => e.kind === "plan")?.streaming).toBe(false)

    // Phase 5: subsequent runs (cache hit) must NOT resurrect stale streaming=true
    entries = run("idle")
    expect(entries.find((e) => e.kind === "think")?.streaming).toBe(false)
    expect(entries.find((e) => e.kind === "plan")?.streaming).toBe(false)

    // Phase 6: status key missing after poll (engine default idle) — still stopped
    entries = run(undefined)
    expect(entries.find((e) => e.kind === "think")?.streaming).toBe(false)
    expect(entries.find((e) => e.kind === "plan")?.streaming).toBe(false)
  })

  test("part revision invalidates a completed message cached with a truncated prefix", () => {
    const { messages, reasoning, text, getParts } = makeFixtures()
    const assistant = messages[1] as any
    assistant.time.completed = 3400
    assistant.finish = "stop"
    ;(reasoning as any).time = { end: 3200 }
    ;(text as any).time = { end: 3300 }
    ;(reasoning as any).text = "The user is starting a new project"
    ;(text as any).text = "What kind"

    const revisions = new Map<string, number>([[assistant.id, 1]])
    const assistantDuration = new Map<string, number>()
    let cache: ReturnType<typeof messagesToSpineEntriesCached>["cache"] | undefined
    let previousEntries: ReturnType<typeof messagesToSpineEntriesCached>["entries"] = []

    const run = () => {
      const result = messagesToSpineEntriesCached({
        messages,
        getParts,
        getPartRevision: (messageID) => revisions.get(messageID) ?? 0,
        assistantDuration,
        cache,
        previousEntries,
        sessionStatusType: "idle",
      })
      cache = result.cache
      previousEntries = result.entries
      return result.entries
    }

    let entries = run()
    const prefixPlan = entries.find((entry) => entry.kind === "plan")
    const prefixThink = entries.find((entry) => entry.kind === "think")
    expect(prefixPlan?.summary).toBe("What kind")
    expect(prefixThink?.body).toBe("The user is starting a new project")

    // Solid store proxies and the parts array keep their identity while the
    // event handlers mutate text in place. Only the semantic revision moves.
    ;(reasoning as any).text =
      "The user is starting a new project and wants to get it ready. They need a clarifying question."
    ;(text as any).text = 'What kind of project? What does "ready" look like for you?'
    revisions.set(assistant.id, 2)

    entries = run()
    const completePlan = entries.find((entry) => entry.kind === "plan")
    const completeThink = entries.find((entry) => entry.kind === "think")
    expect(completePlan?.summary).toBe('What kind of project? What does "ready" look like for you?')
    expect(completeThink?.body).toBe(
      "The user is starting a new project and wants to get it ready. They need a clarifying question.",
    )
    expect(completePlan).not.toBe(prefixPlan)
    expect(completeThink).not.toBe(prefixThink)

    const cold = messagesToSpineEntriesCached({
      messages,
      getParts,
      getPartRevision: (messageID) => revisions.get(messageID) ?? 0,
      assistantDuration,
      sessionStatusType: "idle",
    }).entries
    expect(completePlan?.summary).toBe(cold.find((entry) => entry.kind === "plan")?.summary)
    expect(completeThink?.body).toBe(cold.find((entry) => entry.kind === "think")?.body)

    entries = run()
    expect(entries.find((entry) => entry.kind === "plan")).toBe(completePlan)
    expect(entries.find((entry) => entry.kind === "think")).toBe(completeThink)
  })
})
