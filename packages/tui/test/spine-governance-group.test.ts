import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import {
  buildGovernanceGroup,
  collapseGovernanceEntries,
  groupGovernanceEntries,
} from "../src/shell/command-spine/spine-governance-group"

function governanceEntry(
  id: string,
  label: string,
  kind: SpineEntry["kind"],
  occurredAt: number,
  summary = `${label} event`,
): SpineEntry {
  return {
    id: `governance:${id}`,
    index: 0,
    elapsed: "",
    occurredAt,
    kind,
    glyph: "◇",
    label,
    summary,
    body: "full payload",
    bodyLabel: "governance event",
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: id, kind: "governance" },
  }
}

function proofEntry(id = "proof-1"): SpineEntry {
  return {
    id: `governance-proof:${id}`,
    index: 0,
    elapsed: "",
    kind: "ok",
    glyph: "✓",
    label: "proof",
    summary: "P1 · complete · 1 authorized",
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: id, kind: "governance" },
  }
}

describe("spine governance aggregation (TUI-2.1)", () => {
  test("honors the collapse preference without mutating the source rows", () => {
    const first = governanceEntry("e1", "authorization", "inspect", 1000)
    const second = governanceEntry("e2", "authorized", "ok", 1002)
    const entries = [first, second]
    expect(collapseGovernanceEntries(entries, { enabled: false, maxGroupSize: 12 })).toEqual(entries)
    expect(entries).toEqual([first, second])
    expect(
      collapseGovernanceEntries(entries, { enabled: true, maxGroupSize: 12 }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["governance-group:governance:e1"])
  })

  test("collapses consecutive authorization events into one summary row", () => {
    const requested = governanceEntry("e1", "authorization", "inspect", 1000, "Authorization requested")
    const allowed = governanceEntry("e2", "authorized", "ok", 1002, "Authorization allowed")
    const executed = governanceEntry("e3", "executed", "ok", 1005, "Authorized effect executed")

    const rows = groupGovernanceEntries([requested, allowed, executed])

    expect(rows).toHaveLength(1)
    const group = rows[0]!
    expect(group.id).toStartWith("governance-group:")
    expect(group.kind).toBe("ok")
    expect(group.glyph).toBe("✓")
    expect(group.label).toBe("governed")
    expect(group.summary).toContain("3 governed actions")
    expect(group.summary).toContain("1 authorized")
    expect(group.summary).toContain("1 executed")
    expect(group.summary).toContain("0 denied")
    expect(group.collapsible).toBe(true)
    expect(group.expandedByDefault).toBe(false)
    expect(group.children).toHaveLength(3)
    expect(group.elapsed).toBe("+5ms")
  })

  test("a denied event marks the group fail-visible", () => {
    const rows = groupGovernanceEntries([
      governanceEntry("e1", "authorization", "inspect", 1000),
      governanceEntry("e2", "denied", "fail", 1002, "Authorization denied · scope mismatch"),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe("fail")
    expect(rows[0]!.glyph).toBe("!")
    expect(rows[0]!.summary).toContain("1 denied")
    expect(rows[0]!.summary).toContain("1 failed")
  })

  test("pending approvals are not counted as failures", () => {
    const rows = groupGovernanceEntries([
      governanceEntry("e1", "approval required", "approve", 1000, "Approval required"),
      governanceEntry("e2", "authorized", "ok", 1002, "Authorization allowed"),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.summary).toContain("1 pending approval")
    expect(rows[0]!.summary).not.toContain("failed")
  })

  test("RunProof and trace rows stay standalone, never merged into a burst", () => {
    const before1 = governanceEntry("e1", "authorization", "inspect", 1000)
    const before2 = governanceEntry("e2", "authorized", "ok", 1002)
    const proof = proofEntry()
    const after1 = governanceEntry("e3", "authorization", "inspect", 2000)
    const after2 = governanceEntry("e4", "executed", "ok", 2002)

    const rows = groupGovernanceEntries([before1, before2, proof, after1, after2])

    expect(rows.map((row) => row.id)).toEqual([
      "governance-group:governance:e1",
      proof.id,
      "governance-group:governance:e3",
    ])
  })

  test("a single governance row stays itself (no synthetic group)", () => {
    const single = governanceEntry("e1", "contract", "plan", 1000)
    const rows = groupGovernanceEntries([single])

    expect(rows).toEqual([single])
  })

  test("buildGovernanceGroup derives duration from occurredAt range", () => {
    const group = buildGovernanceGroup([
      governanceEntry("e1", "authorization", "inspect", 1000),
      governanceEntry("e2", "authorized", "ok", 3000),
      governanceEntry("e3", "executed", "ok", 6000),
    ])

    expect(group.elapsedMs).toBe(5000)
    expect(group.elapsed).toBe("+5s")
    expect(group.occurredAt).toBe(1000)
  })
})
