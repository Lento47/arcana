import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import {
  applyViewFilter,
  entryMatchesViewFilter,
  nextSpineViewFilter,
  SPINE_VIEW_FILTERS,
  spineFilterLabel,
} from "../src/shell/command-spine/spine-view-filter"

function entry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "e1",
    index: 1,
    elapsed: "",
    kind: "inspect",
    glyph: "▸",
    label: "read",
    summary: "file.ts",
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: "m1", kind: "tool" },
    ...overrides,
  }
}

describe("spine view filters (TUI-2.1 P2)", () => {
  test("conversation filter keeps chat rows and hides tools/governance/proof", () => {
    const chat = entry({ id: "ask", kind: "ask", source: { messageID: "m1", kind: "message" } })
    const tool = entry({ id: "tool" })
    const governance = entry({
      id: "governance-group:g1",
      kind: "ok",
      source: { messageID: "g1", kind: "governance" },
    })
    const proof = entry({ id: "governance-proof:p1", kind: "ok", source: { messageID: "p1", kind: "governance" } })

    expect(entryMatchesViewFilter(chat, "conversation")).toBe(true)
    expect(entryMatchesViewFilter(tool, "conversation")).toBe(false)
    expect(entryMatchesViewFilter(governance, "conversation")).toBe(false)
    expect(entryMatchesViewFilter(proof, "conversation")).toBe(false)
  })

  test("tools filter keeps think/tool rows and hides chat/governance", () => {
    const think = entry({ id: "think", kind: "think" })
    const run = entry({ id: "run", kind: "run" })
    const chat = entry({ id: "ask", kind: "ask", source: { messageID: "m1", kind: "message" } })
    const governance = entry({
      id: "governance-group:g1",
      kind: "ok",
      source: { messageID: "g1", kind: "governance" },
    })

    expect(entryMatchesViewFilter(think, "tools")).toBe(true)
    expect(entryMatchesViewFilter(run, "tools")).toBe(true)
    expect(entryMatchesViewFilter(chat, "tools")).toBe(false)
    expect(entryMatchesViewFilter(governance, "tools")).toBe(false)
  })

  test("governance filter keeps event groups and hides chat/tools/proof", () => {
    const governance = entry({
      id: "governance-group:g1",
      kind: "ok",
      source: { messageID: "g1", kind: "governance" },
    })
    const proof = entry({ id: "governance-proof:p1", kind: "ok", source: { messageID: "p1", kind: "governance" } })
    const chat = entry({ id: "ask", kind: "ask", source: { messageID: "m1", kind: "message" } })

    expect(entryMatchesViewFilter(governance, "governance")).toBe(true)
    expect(entryMatchesViewFilter(proof, "governance")).toBe(false)
    expect(entryMatchesViewFilter(chat, "governance")).toBe(false)
  })

  test("proof filter matches only RunProof rows", () => {
    const proof = entry({ id: "governance-proof:p1", kind: "ok", source: { messageID: "p1", kind: "governance" } })
    const trace = entry({ id: "governance-trace:s1", kind: "fail", source: { messageID: "s1", kind: "governance" } })
    const group = entry({ id: "governance-group:g1", kind: "ok", source: { messageID: "g1", kind: "governance" } })

    expect(entryMatchesViewFilter(proof, "proof")).toBe(true)
    // Trace rows are always fail-visible, so they break through like any
    // security state — a filter can hide noise, never evidence.
    expect(entryMatchesViewFilter(trace, "proof")).toBe(true)
    expect(entryMatchesViewFilter(group, "proof")).toBe(false)
  })

  test("security-critical rows break through any filter", () => {
    const denied = entry({ id: "denied", kind: "fail", label: "denied" })
    const approval = entry({ id: "approval", kind: "approve", label: "approval required" })
    const degradedProof = entry({ id: "governance-proof:p1", kind: "fail", source: { messageID: "p1", kind: "governance" } })

    for (const filter of SPINE_VIEW_FILTERS) {
      expect(entryMatchesViewFilter(denied, filter)).toBe(true)
      expect(entryMatchesViewFilter(approval, filter)).toBe(true)
      expect(entryMatchesViewFilter(degradedProof, filter)).toBe(true)
    }
  })

  test("all filter keeps every row", () => {
    const rows = [
      entry({ id: "chat", kind: "ask" }),
      entry({ id: "tool", kind: "inspect" }),
      entry({ id: "gov", kind: "ok", source: { messageID: "g", kind: "governance" } }),
      entry({ id: "proof", kind: "ok", source: { messageID: "p", kind: "governance" } }),
    ]
    expect(applyViewFilter(rows, "all")).toHaveLength(4)
  })

  test("applyViewFilter returns only matching rows with security break-through", () => {
    const rows = [
      entry({ id: "chat", kind: "ask", source: { messageID: "m1", kind: "message" } }),
      entry({ id: "tool", kind: "inspect" }),
      entry({ id: "denied", kind: "fail", label: "denied" }),
    ]
    const filtered = applyViewFilter(rows, "conversation")
    expect(filtered.map((row) => row.id)).toEqual(["chat", "denied"])
  })

  test("nextSpineViewFilter cycles through the five categories", () => {
    expect(nextSpineViewFilter("all")).toBe("conversation")
    expect(nextSpineViewFilter("conversation")).toBe("tools")
    expect(nextSpineViewFilter("tools")).toBe("governance")
    expect(nextSpineViewFilter("governance")).toBe("proof")
    expect(nextSpineViewFilter("proof")).toBe("all")
    expect(spineFilterLabel("all")).toBe("all")
    expect(spineFilterLabel("governance")).toBe("governance")
  })
})
