import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import {
  applyViewFilter,
  entryMatchesViewFilter,
  isQuietGovernanceLedger,
  isSecurityCritical,
  isSettledGovernanceRecord,
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

  test("activity reels follow the tools lane and never leak into conversation/governance", () => {
    const activity = entry({
      id: "activity:turn-1",
      kind: "think",
      label: "work",
      activity: { type: "work", turnID: "turn-1", childCount: 3 },
      children: [entry({ id: "run-1", kind: "run" })],
    })

    expect(entryMatchesViewFilter(activity, "all")).toBe(true)
    expect(entryMatchesViewFilter(activity, "tools")).toBe(true)
    expect(entryMatchesViewFilter(activity, "conversation")).toBe(false)
    expect(entryMatchesViewFilter(activity, "governance")).toBe(false)
  })

  test("governance filter keeps event groups and leftover proof rows; hides chat/tools", () => {
    const governance = entry({
      id: "governance-group:g1",
      kind: "ok",
      source: { messageID: "g1", kind: "governance" },
    })
    const proof = entry({ id: "governance-proof:p1", kind: "ok", source: { messageID: "p1", kind: "governance" } })
    const chat = entry({ id: "ask", kind: "ask", source: { messageID: "m1", kind: "message" } })

    expect(entryMatchesViewFilter(governance, "governance")).toBe(true)
    expect(entryMatchesViewFilter(proof, "governance")).toBe(true)
    expect(entryMatchesViewFilter(chat, "governance")).toBe(false)
  })

  test("legacy proof filter folds into governance", () => {
    const proof = entry({ id: "governance-proof:p1", kind: "ok", source: { messageID: "p1", kind: "governance" } })
    const group = entry({ id: "governance-group:g1", kind: "ok", source: { messageID: "g1", kind: "governance" } })

    expect(entryMatchesViewFilter(proof, "proof")).toBe(true)
    expect(entryMatchesViewFilter(group, "proof")).toBe(true)
    expect(spineFilterLabel("proof")).toBe("governance")
  })

  test("security-critical rows break through any filter", () => {
    const toolFail = entry({ id: "tool-fail", kind: "fail", label: "denied" })
    const approval = entry({ id: "approval", kind: "approve", label: "approval required" })

    for (const filter of SPINE_VIEW_FILTERS) {
      expect(entryMatchesViewFilter(toolFail, filter)).toBe(true)
      expect(entryMatchesViewFilter(approval, filter)).toBe(true)
    }
  })

  test("degraded session-proof ledger stays in governance, not chat", () => {
    const degradedProof = entry({
      id: "governance-proof:p1",
      kind: "fail",
      source: { messageID: "p1", kind: "governance" },
    })
    expect(entryMatchesViewFilter(degradedProof, "all")).toBe(false)
    expect(entryMatchesViewFilter(degradedProof, "conversation")).toBe(false)
    expect(entryMatchesViewFilter(degradedProof, "tools")).toBe(false)
    expect(entryMatchesViewFilter(degradedProof, "governance")).toBe(true)
  })

  test("all / conversation hide healthy governed groups; governance keeps them", () => {
    const chat = entry({ id: "chat", kind: "ask", source: { messageID: "m", kind: "message" } })
    const tool = entry({ id: "tool", kind: "inspect" })
    const group = entry({
      id: "governance-group:g1",
      kind: "ok",
      label: "governed",
      source: { messageID: "g", kind: "governance" },
    })
    const denied = entry({
      id: "governance:denied",
      kind: "fail",
      label: "denied",
      source: { messageID: "d", kind: "governance" },
    })

    expect(isQuietGovernanceLedger(group)).toBe(true)
    expect(isSettledGovernanceRecord(denied)).toBe(true)
    expect(isQuietGovernanceLedger(denied)).toBe(true)
    expect(isSecurityCritical(denied)).toBe(false)
    expect(entryMatchesViewFilter(group, "all")).toBe(false)
    expect(entryMatchesViewFilter(group, "conversation")).toBe(false)
    expect(entryMatchesViewFilter(group, "governance")).toBe(true)
    expect(entryMatchesViewFilter(denied, "all")).toBe(false)
    expect(entryMatchesViewFilter(denied, "governance")).toBe(true)
    expect(applyViewFilter([chat, tool, group, denied], "all").map((row) => row.id)).toEqual([
      "chat",
      "tool",
    ])
  })

  test("settled deny, revoke, and effect-receipt rows stay out of chat", () => {
    const deny = entry({
      id: "governance:denied",
      kind: "fail",
      label: "denied",
      source: { messageID: "d", kind: "governance" },
    })
    const revoked = entry({
      id: "governance:revoked",
      kind: "fail",
      label: "revoked",
      breakthrough: true,
      source: { messageID: "r", kind: "governance" },
    })
    const failed = entry({
      id: "proof-continuation:evt-fail",
      kind: "fail",
      label: "effect failed",
      source: { messageID: "e", kind: "governance" },
    })
    const pending = entry({
      id: "governance:approval",
      kind: "approve",
      label: "approval required",
      source: { messageID: "a", kind: "governance" },
    })

    expect(isSettledGovernanceRecord(revoked)).toBe(true)
    expect(applyViewFilter([deny, revoked, failed, pending], "all").map((row) => row.id)).toEqual([
      "governance:approval",
    ])
    expect(applyViewFilter([deny, revoked, failed, pending], "governance").map((row) => row.id)).toEqual([
      "governance:denied",
      "governance:revoked",
      "proof-continuation:evt-fail",
      "governance:approval",
    ])
  })

  test("gutter indexes are assigned after the filter so quiet ledger rows do not leave holes", () => {
    const rows = [
      entry({ id: "ask", kind: "ask", index: 1, source: { messageID: "m1", kind: "message" } }),
      entry({ id: "think", kind: "think", index: 2 }),
      entry({ id: "tool-deny", kind: "fail", index: 3, label: "denied" }),
      entry({
        id: "governance-quiet",
        kind: "inspect",
        index: 4,
        label: "authorization",
        source: { messageID: "g", kind: "governance" },
      }),
      entry({
        id: "governance:denied",
        kind: "fail",
        index: 5,
        label: "denied",
        source: { messageID: "d", kind: "governance" },
      }),
    ]
    expect(applyViewFilter(rows, "all").map((row) => `${row.index}:${row.id}`)).toEqual([
      "1:ask",
      "2:think",
      "3:tool-deny",
    ])
  })

  test("hidden attached receipts never occupy a painted row", () => {
    const attached = entry({
      id: "proof-continuation:hidden",
      kind: "fail",
      label: "effect failed",
      hidden: true,
      source: { messageID: "e", kind: "governance" },
    })
    expect(applyViewFilter([attached], "all")).toEqual([])
    expect(applyViewFilter([attached], "governance")).toEqual([])
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

  test("nextSpineViewFilter cycles four categories; leftover proof goes to all", () => {
    expect(nextSpineViewFilter("all")).toBe("conversation")
    expect(nextSpineViewFilter("conversation")).toBe("tools")
    expect(nextSpineViewFilter("tools")).toBe("governance")
    expect(nextSpineViewFilter("governance")).toBe("all")
    expect(nextSpineViewFilter("proof")).toBe("all")
    expect(spineFilterLabel("all")).toBe("all")
    expect(spineFilterLabel("governance")).toBe("governance")
    expect(SPINE_VIEW_FILTERS).not.toContain("proof")
  })
})
