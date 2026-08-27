import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { toSpineEntryView } from "../src/shell/command-spine/spine-entry-view"
import {
  collapseWorkActivities,
  isWorkActivityEntry,
  isWorkActivityKind,
  summarizeWorkActivity,
} from "../src/shell/command-spine/spine-activity"

function entry(id: string, kind: SpineEntry["kind"], overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id,
    index: Number(id.replace(/\D/g, "")) || 1,
    elapsed: "",
    kind,
    glyph: "▸",
    label: kind,
    summary: `${kind} ${id}`,
    collapsible: true,
    expandedByDefault: false,
    ...overrides,
  }
}

function turnEntry(
  id: string,
  kind: SpineEntry["kind"],
  turn = "turn-1",
  overrides: Partial<SpineEntry> = {},
): SpineEntry {
  return entry(id, kind, {
    source: { messageID: turn, kind: kind === "think" ? "reasoning" : kind === "patch" ? "patch" : kind === "agent" ? "agent" : "tool" },
    ...overrides,
  })
}

describe("spine activity reel projection", () => {
  test("recognizes only the approved work primitives", () => {
    for (const kind of ["think", "run", "inspect", "patch", "agent"] as const) {
      expect(isWorkActivityKind(kind)).toBe(true)
      expect(isWorkActivityEntry(turnEntry(kind, kind))).toBe(true)
    }
    expect(isWorkActivityEntry(turnEntry("fail", "fail"))).toBe(false)
    expect(isWorkActivityEntry(turnEntry("approval", "approve"))).toBe(false)
    expect(isWorkActivityEntry(turnEntry("governance", "inspect", "g", {
      source: { messageID: "g", kind: "governance" },
    }))).toBe(false)
  })

  test("collapses same-turn work into one stable parent and preserves children", () => {
    const first = turnEntry("think-1", "think", "turn-1", { occurredAt: 1000, streaming: true })
    const second = turnEntry("run-1", "run", "turn-1", {
      occurredAt: 1400,
      elapsedMs: 120,
      receipt: { label: "run", status: "ok", summary: "rg found 2 matches" },
    })
    const third = turnEntry("inspect-1", "inspect", "turn-1", { occurredAt: 2200 })
    const rows = collapseWorkActivities([first, second, third])

    expect(rows).toHaveLength(1)
    const activity = rows[0]!
    expect(activity.id).toBe("activity:think-1")
    expect(activity.activity).toEqual({ type: "work", turnID: "turn-1", childCount: 3 })
    expect(activity.children?.map((child) => child.id)).toEqual(["think-1", "run-1", "inspect-1"])
    expect(activity.summary).toBe("3 steps · 2 tools · 1 thought")
    expect(activity.streaming).toBe(true)
    expect(activity.glyph).toBe("●")
    expect(activity.elapsedMs).toBe(1200)
    expect(activity.elapsed).toBe("+1.2s")
    expect(activity.source).toEqual(first.source)
    expect(first.activity).toBeUndefined()
  })

  test("freezes a settled summary and respects turn/prose/security boundaries", () => {
    const settled = collapseWorkActivities([
      turnEntry("run-1", "run", "turn-1", { elapsedMs: 20 }),
      turnEntry("patch-1", "patch", "turn-1", { elapsedMs: 30 }),
      turnEntry("plan-1", "plan", "turn-1"),
      turnEntry("run-2", "run", "turn-1"),
      turnEntry("run-3", "run", "turn-2"),
      turnEntry("fail-1", "fail", "turn-2"),
      turnEntry("inspect-2", "inspect", "turn-2"),
    ])

    expect(settled.map((row) => row.id)).toEqual([
      "activity:run-1",
      "plan-1",
      "run-2",
      "run-3",
      "fail-1",
      "inspect-2",
    ])
    expect(settled[0]!.summary).toBe("2 actions · 2 tools")
    expect(settled[0]!.streaming).toBe(false)
    expect(settled[0]!.glyph).toBe("✓")
    expect(settled[0]!.elapsed).toBe("+50ms")
  })

  test("does not create nested reels and keeps an agent's child context atomic", () => {
    const groupedRun = turnEntry("run-group", "run", "turn-1", {
      children: [
        turnEntry("run-a", "run", "turn-1"),
        turnEntry("run-b", "run", "turn-1"),
      ],
    })
    const agent = turnEntry("agent-1", "agent", "turn-1", {
      children: [turnEntry("child-run", "run", "child-turn")],
    })
    const rows = collapseWorkActivities([groupedRun, agent])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.children?.map((child) => child.id)).toEqual(["run-a", "run-b", "agent-1"])
    expect(rows[0]!.children?.some((child) => child.activity?.type === "work")).toBe(false)
    expect(rows[0]!.children?.find((child) => child.id === "agent-1")?.children).toHaveLength(1)
    expect(agent.children).toHaveLength(1)
  })

  test("keeps a mixed synthetic parent standalone so failures cannot hide in a reel", () => {
    const mixed = turnEntry("run-group", "run", "turn-1", {
      children: [
        turnEntry("run-a", "run", "turn-1"),
        turnEntry("fail-a", "fail", "turn-1"),
      ],
    })
    const next = turnEntry("inspect-1", "inspect", "turn-1")
    const rows = collapseWorkActivities([mixed, next])
    expect(rows.map((row) => row.id)).toEqual(["run-group", "inspect-1"])
    expect(rows[0]!.children?.map((child) => child.id)).toEqual(["run-a", "fail-a"])
    expect(rows[0]!.activity).toBeUndefined()
  })

  test("passes through a lone work row instead of inventing a disclosure parent", () => {
    const lone = turnEntry("run-1", "run", "turn-1")
    expect(collapseWorkActivities([lone])).toEqual([lone])
    expect(summarizeWorkActivity([lone], false)).toBe("1 actions · 1 tools")
  })

  test("classifies a reel at the render boundary and forwards child liveness", () => {
    const source = turnEntry("run-1", "run", "turn-1", { streaming: true })
    const grouped = collapseWorkActivities([
      source,
      turnEntry("inspect-1", "inspect", "turn-1"),
    ])[0]!
    const view = toSpineEntryView(grouped, { layout: "wide" })
    expect(view.type).toBe("activity")
    if (view.type !== "activity") return
    expect(view.activity.turnID).toBe("turn-1")
    expect(view.children).toHaveLength(2)
    expect(view.children[0]!.streaming).toBe(true)
  })
})
