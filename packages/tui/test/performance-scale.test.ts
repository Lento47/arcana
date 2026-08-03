import { describe, expect, test } from "bun:test"
import { performance } from "node:perf_hooks"
import type { Message, Part } from "@arcana/sdk/v2"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { applyViewFilter, SPINE_VIEW_FILTERS } from "../src/shell/command-spine/spine-view-filter"
import {
  buildGovernanceGroup,
  groupGovernanceEntries,
} from "../src/shell/command-spine/spine-governance-group"
import { messagesToSpineEntriesCached } from "../src/shell/command-spine/spine-mapper"

function timed<T>(label: string, fn: () => T): { value: T; ms: number } {
  const start = performance.now()
  const value = fn()
  const ms = performance.now() - start
  console.log(`[perf] ${label}: ${ms.toFixed(2)}ms`)
  return { value, ms }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mixedEntry(index: number): SpineEntry {
  const bucket = index % 25
  if (bucket < 10) {
    // 40% chat rows
    return {
      id: `msg:chat-${index}`,
      index,
      elapsed: "",
      kind: "ask",
      glyph: "?",
      label: "user",
      summary: `chat row ${index}`,
      collapsible: false,
      source: { messageID: `chat-${index}`, kind: "message" },
    }
  }
  if (bucket < 17) {
    // 28% tool rows
    return {
      id: `tool:run-${index}`,
      index,
      elapsed: "",
      kind: "run",
      glyph: ">",
      label: "run",
      summary: `tool row ${index}`,
      collapsible: false,
      source: { messageID: `tool-${index}`, kind: "tool" },
    }
  }
  if (bucket < 21) {
    // 16% governance events
    return {
      id: `governance:e${index}`,
      index,
      elapsed: "",
      occurredAt: index,
      kind: "ok",
      glyph: "v",
      label: index % 4 === 0 ? "authorization" : "authorized",
      summary: `governance event ${index}`,
      collapsible: true,
      expandedByDefault: false,
      source: { messageID: `gov-${index}`, kind: "governance" },
    }
  }
  if (bucket < 24) {
    // 12% proof rows
    return {
      id: `governance-proof:p${index}`,
      index,
      elapsed: "",
      kind: "ok",
      glyph: "v",
      label: "proof",
      summary: `proof ${index}`,
      collapsible: false,
      source: { messageID: `proof-${index}`, kind: "governance" },
    }
  }
  // 4% security-critical rows that break through every filter
  return {
    id: `fail:denied-${index}`,
    index,
    elapsed: "",
    kind: "fail",
    glyph: "!",
    label: "denied",
    summary: `denied ${index}`,
    collapsible: false,
  }
}

function governanceBurstEntry(index: number): SpineEntry {
  const label = ["authorization", "authorized", "executed", "denied"][index % 4]!
  return {
    id: `governance:burst-${index}`,
    index,
    elapsed: "",
    occurredAt: 1000 + index,
    kind: label === "denied" ? "fail" : label === "authorization" ? "inspect" : "ok",
    glyph: "v",
    label,
    summary: `${label} ${index}`,
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: `burst-${index}`, kind: "governance" },
  }
}

function proofEntry(index: number): SpineEntry {
  return {
    id: `governance-proof:burst-proof-${index}`,
    index,
    elapsed: "",
    kind: "ok",
    glyph: "v",
    label: "proof",
    summary: `proof burst ${index}`,
    collapsible: false,
    source: { messageID: `burst-proof-${index}`, kind: "governance" },
  }
}

function mapperMessages(count: number) {
  const messages: Message[] = []
  const partsByMessage = new Map<string, Part[]>()
  for (let index = 0; index < count; index++) {
    const id = index % 2 === 0 ? `msg_user_${index}` : `msg_asst_${index}`
    if (index % 2 === 0) {
      messages.push({
        id,
        sessionID: "perf-session",
        role: "user",
        time: { created: index },
        agent: "default",
        model: { providerID: "test", modelID: "test" },
      } as Message)
      continue
    }
    const reasoning: Part = {
      id: `${id}:reasoning`,
      sessionID: "perf-session",
      messageID: id,
      type: "reasoning",
      text: `reasoning body ${index}`.repeat(5),
    } as Part
    const text: Part = {
      id: `${id}:text`,
      sessionID: "perf-session",
      messageID: id,
      type: "text",
      text: `streamed answer ${index}`,
    } as Part
    partsByMessage.set(id, [reasoning, text])
    messages.push({
      id,
      sessionID: "perf-session",
      role: "assistant",
      time: { created: index, completed: index + 1 },
      parentID: `msg_user_${index - 1}`,
      modelID: "test-model",
      providerID: "test-provider",
      mode: "default",
      agent: "default",
      path: { cwd: "/", root: "/" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as Message)
  }
  return {
    messages,
    getParts: (id: string) => partsByMessage.get(id) ?? [],
  }
}

// ---------------------------------------------------------------------------
// Scale measurements
// ---------------------------------------------------------------------------

describe("TUI performance at scale (grouping, aggregation, filters)", () => {
  test("view filters at 4000 rows classify exactly and stay far inside the frame budget", () => {
    const rows = Array.from({ length: 4000 }, (_, index) => mixedEntry(index))
    const chat = rows.filter((row) => row.kind === "ask").length
    const tools = rows.filter((row) => row.kind === "run").length
    const governance = rows.filter((row) => row.source?.kind === "governance" && !row.id.startsWith("governance-proof:")).length
    const proof = rows.filter((row) => row.id.startsWith("governance-proof:")).length
    const critical = rows.filter((row) => row.kind === "fail").length

    for (const filter of SPINE_VIEW_FILTERS) {
      const { value: filtered, ms } = timed(`applyViewFilter(${filter}, 4000)`, () => applyViewFilter(rows, filter))
      expect(ms).toBeLessThan(2000)
      switch (filter) {
        case "all":
          expect(filtered).toHaveLength(4000)
          break
        case "conversation":
          expect(filtered).toHaveLength(chat + critical)
          break
        case "tools":
          expect(filtered).toHaveLength(tools + critical)
          break
        case "governance":
          expect(filtered).toHaveLength(governance + critical)
          break
        case "proof":
          expect(filtered).toHaveLength(proof + critical)
          break
      }
    }
  })

  test("governance aggregation at 4000 events collapses bursts without losing evidence", () => {
    const burst = Array.from({ length: 4000 }, (_, index) => governanceBurstEntry(index))
    burst.splice(2000, 0, proofEntry(0))
    const { value: grouped, ms } = timed("groupGovernanceEntries(4001)", () => groupGovernanceEntries(burst))
    expect(ms).toBeLessThan(2000)

    // Two contiguous bursts split by the standalone proof row.
    const groups = grouped.filter((row) => row.id.startsWith("governance-group:"))
    expect(groups).toHaveLength(2)
    const first = groups[0]!
    expect(first.children).toHaveLength(2000)
    // 25% denied, 25% authorization, 25% authorized, 25% executed.
    expect(first.summary).toContain("2000 governed actions")
    expect(first.summary).toContain("500 denied")
    expect(first.summary).toContain("500 authorized")
    expect(first.summary).toContain("500 executed")
    expect(first.kind).toBe("fail")
    // The standalone proof row survives between the two bursts.
    expect(grouped.some((row) => row.id.startsWith("governance-proof:"))).toBe(true)
    expect(grouped.find((row) => row.id.startsWith("governance-proof:"))?.id).toBe(
      proofEntry(0).id,
    )

    const { ms: groupMs } = timed("buildGovernanceGroup(4000 children)", () =>
      buildGovernanceGroup(Array.from({ length: 4000 }, (_, index) => governanceBurstEntry(index))),
    )
    expect(groupMs).toBeLessThan(2000)
  })

  test("spine mapper at 400 messages (200 assistant turns with parts) caches and reuses work", () => {
    const { messages, getParts } = mapperMessages(400)
    const assistantDuration = new Map<string, number>()
    const getPartRevision = () => 0

    const cold = timed("messagesToSpineEntriesCached cold (400 messages)", () =>
      messagesToSpineEntriesCached({
        messages,
        getParts,
        getPartRevision,
        assistantDuration,
        sessionStatusType: "idle",
      }),
    )
    const warm = timed("messagesToSpineEntriesCached warm (same cache)", () =>
      messagesToSpineEntriesCached({
        messages,
        getParts,
        getPartRevision,
        assistantDuration,
        cache: cold.value.cache,
        previousEntries: cold.value.entries,
        sessionStatusType: "idle",
      }),
    )

    expect(cold.value.entries.length).toBeGreaterThanOrEqual(messages.length)
    expect(cold.ms).toBeLessThan(5000)
    expect(warm.ms).toBeLessThan(1000)
    // The cache must help, never hurt: warm stays at or under cold cost.
    expect(warm.ms).toBeLessThanOrEqual(cold.ms + 50)
    // Identical stable row ids between cold and warm passes (no duplication).
    const coldIDs = cold.value.entries.map((entry) => entry.id)
    expect(warm.value.entries.map((entry) => entry.id)).toEqual(coldIDs)
    expect(new Set(coldIDs).size).toBe(coldIDs.length)
  })
})
