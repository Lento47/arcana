import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { activateSpineEntryDisclosure, canToggleSpineEntry, nextSpineFocusID, navigableSpineEntries } from "../src/shell/command-spine/spine-navigation"

function entry(id: string, overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id,
    index: Number(id.replace(/\D/g, "")) || 1,
    elapsed: "+0s",
    kind: "plan",
    glyph: "├",
    summary: id,
    ...overrides,
  }
}

describe("command-spine navigation", () => {
  test("navigable entries skip hidden rows", () => {
    const rows = [entry("a"), entry("b", { hidden: true }), entry("c")]
    expect(navigableSpineEntries(rows).map((row) => row.id)).toEqual(["a", "c"])
  })

  test("next focus starts at the first or last visible entry", () => {
    const rows = [entry("a"), entry("b"), entry("c")]
    expect(nextSpineFocusID(rows, undefined, 1)).toBe("a")
    expect(nextSpineFocusID(rows, undefined, -1)).toBe("c")
  })

  test("next focus clamps at visible edges", () => {
    const rows = [entry("a"), entry("b"), entry("c")]
    expect(nextSpineFocusID(rows, "b", 1)).toBe("c")
    expect(nextSpineFocusID(rows, "c", 1)).toBe("c")
    expect(nextSpineFocusID(rows, "b", -1)).toBe("a")
    expect(nextSpineFocusID(rows, "a", -1)).toBe("a")
  })

  test("toggleability follows expandable artifacts", () => {
    expect(canToggleSpineEntry(entry("plain"))).toBe(false)
    expect(canToggleSpineEntry(entry("body", { body: "details" }))).toBe(true)
    expect(canToggleSpineEntry(entry("diff", { diff: { files: "a.ts", stats: "+1 -1", body: "diff --git" } }))).toBe(true)
    expect(canToggleSpineEntry(entry("locked", { body: "details", collapsible: false }))).toBe(false)
  })

  test("mouse and keyboard disclosure share focus-before-toggle semantics", () => {
    const calls: string[] = []
    const target = entry("thought", { kind: "think", body: "reasoning", collapsible: true })
    expect(activateSpineEntryDisclosure(target, {
      focus: () => calls.push("focus"),
      toggle: () => calls.push("toggle"),
    })).toBe(true)
    expect(calls).toEqual(["focus", "toggle"])

    expect(activateSpineEntryDisclosure(entry("empty", { kind: "think", collapsible: false }), {
      focus: () => calls.push("bad-focus"),
      toggle: () => calls.push("bad-toggle"),
    })).toBe(false)
    expect(calls).toEqual(["focus", "toggle"])
  })
})
