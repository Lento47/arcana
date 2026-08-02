import { describe, expect, test } from "bun:test"
import { nodeMetaStrip } from "../src/shell/command-spine/spine-node"

describe("spine-node.nodeMetaStrip (M1)", () => {
  test("no disclosure or elapsed → no meta parts", () => {
    expect(nodeMetaStrip("", "")).toEqual([])
  })

  test("disclosure alone → single summary-tone part", () => {
    expect(nodeMetaStrip("▸", "")).toEqual([{ text: " ▸", tone: "summary" }])
    expect(nodeMetaStrip("▾", "")).toEqual([{ text: " ▾", tone: "summary" }])
  })

  test("elapsed alone → single elapsed-tone part", () => {
    expect(nodeMetaStrip("", "+1.2s")).toEqual([{ text: " · +1.2s", tone: "elapsed" }])
    expect(nodeMetaStrip("", "+1h 2m")).toEqual([{ text: " · +1h 2m", tone: "elapsed" }])
  })

  test("both → chevron before elapsed, two tones", () => {
    expect(nodeMetaStrip("▾", "+1h 2m")).toEqual([
      { text: " ▾", tone: "summary" },
      { text: " · +1h 2m", tone: "elapsed" },
    ])
  })

  test("the M1 contract: meta is never a substring of the summary text node", () => {
    // The wrapping summary text must contain ONLY the summary — the chevron and
    // elapsed are separate, tone-tagged parts rendered in a flexShrink={0}
    // sibling. If a part ever leaked into the summary, it would detach onto its
    // own line when the summary wraps (the bug being fixed).
    const summary = "Scanning the codebase for orphaned exports across 40 packages"
    const parts = nodeMetaStrip("▾", "+1h 2m")
    const metaText = parts.map((p) => p.text).join("")
    expect(summary.includes(metaText)).toBe(false)
    expect(summary.includes("▾")).toBe(false)
    expect(summary.includes("+1h")).toBe(false)
  })
})
