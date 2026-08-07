/**
 * S7 — spine-entry toggle predicates consolidation (audit S7 row, Medium).
 *
 * The five overlapping "can toggle?" encodings (canToggle, showToggleRow,
 * toggleLabel, headerDisclosure, headerToggleable) each re-derived the rule
 * and had drifted — headerToggleable required a think body and included agent
 * entries, while canToggle used bare isThink() and omitted agent entries.
 * The fix: one pure `computeSpineToggle(facts)` helper + a single `toggle`
 * memo in SpineEntry. Source contracts fail on the old code; behavior tests
 * pin the drift cases.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { computeSpineToggle } from "../src/shell/command-spine/spine-entry"

const entry = () =>
  readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"), "utf8").replace(
    /\r\n/g,
    "\n",
  )

const facts = (overrides: Partial<Parameters<typeof computeSpineToggle>[0]> = {}) => ({
  onToggle: false,
  isThink: false,
  hasThinkBody: false,
  hasDiff: false,
  diffBody: "",
  hasListing: false,
  hasToolBody: false,
  hasChildren: false,
  childCount: 0,
  isAgentEntry: false,
  expanded: false,
  bodyLabel: undefined as string | undefined,
  ...overrides,
})

describe("S7 — the five predicates collapse into computeSpineToggle", () => {
  test("old overlapping predicate declarations are gone", () => {
    const src = entry()
    // The bare identifier names survive inside computeSpineToggle (local
    // `canToggle` gate, `headerToggleable` result field, doc-comment prose), so
    // contract on the OLD declaration shapes: canToggle/showToggleRow were
    // createMemos, toggleLabel/headerDisclosure/headerToggleable were arrow fns.
    expect(src).not.toContain("const canToggle = createMemo(")
    expect(src).not.toContain("const showToggleRow = createMemo(")
    expect(src).not.toContain("const toggleLabel = ()")
    expect(src).not.toContain("const headerDisclosure = ()")
    expect(src).not.toContain("const headerToggleable = ()")
  })
  test("one memo consumes the pure helper; consumers read toggle().", () => {
    const src = entry()
    expect(src).toContain("const toggle = createMemo(")
    expect(src).toContain("computeSpineToggle(")
    expect(src).toContain("toggle().headerToggleable")
    expect(src).toContain("toggle().disclosure")
  })
})

describe("S7 — drift cases behave consistently (single rule)", () => {
  test("plain entry: nothing toggles", () => {
    expect(computeSpineToggle(facts())).toEqual({
      headerToggleable: false,
      disclosure: "",
      rowToggleable: false,
      label: "▸ show details",
    })
  })

  test("think with body: header toggle only (no explicit row)", () => {
    const r = computeSpineToggle(facts({ isThink: true, hasThinkBody: true }))
    expect(r.headerToggleable).toBe(true)
    expect(r.disclosure).toBe("▸")
    expect(r.rowToggleable).toBe(false)
  })

  test("think without body: NOT header-togglable (was the drift — canToggle said true)", () => {
    const r = computeSpineToggle(facts({ isThink: true, hasThinkBody: false }))
    expect(r.headerToggleable).toBe(false)
    expect(r.disclosure).toBe("")
  })

  test("agent entry: header-togglable even without children/tool body", () => {
    const r = computeSpineToggle(facts({ isAgentEntry: true }))
    expect(r.headerToggleable).toBe(true)
    // rowToggleable still requires the broad canToggle gate (agent alone is not enough)
    expect(r.rowToggleable).toBe(false)
  })

  test("agent entry with tool body: both header and row toggle", () => {
    const r = computeSpineToggle(facts({ isAgentEntry: true, hasToolBody: true }))
    expect(r.headerToggleable).toBe(true)
    expect(r.rowToggleable).toBe(false)
    expect(r.label).toBe("▸ show details")
  })

  test("diff with body: header toggle only", () => {
    const r = computeSpineToggle(facts({ hasDiff: true, diffBody: "diff --git a/x b/x" }))
    expect(r.headerToggleable).toBe(true)
    expect(r.rowToggleable).toBe(false)
  })

  test("diff without body: not toggleable (was the drift — canToggle said true)", () => {
    const r = computeSpineToggle(facts({ hasDiff: true, diffBody: "" }))
    expect(r.headerToggleable).toBe(false)
  })

  test("children: command-count label + both toggles", () => {
    const r = computeSpineToggle(facts({ hasChildren: true, childCount: 3 }))
    expect(r.headerToggleable).toBe(true)
    expect(r.rowToggleable).toBe(false)
    expect(r.label).toBe("▸ show 3 commands")
    expect(computeSpineToggle(facts({ hasChildren: true, childCount: 1, expanded: true })).label).toBe(
      "▾ hide 1 command",
    )
  })

  test("listing: row toggle via broad gate (no header toggle)", () => {
    const r = computeSpineToggle(facts({ hasListing: true }))
    expect(r.headerToggleable).toBe(false)
    expect(r.rowToggleable).toBe(false)
  })

  test("disclosure flips on expanded", () => {
    const base = facts({ hasToolBody: true })
    expect(computeSpineToggle(base).disclosure).toBe("▸")
    expect(computeSpineToggle({ ...base, expanded: true }).disclosure).toBe("▾")
  })

  test("bodyLabel drives the toggle-row label", () => {
    expect(computeSpineToggle(facts({ hasToolBody: true, bodyLabel: "matches" })).label).toBe("▸ show matches")
  })

  test("onToggle alone does NOT force header toggle (matches old headerToggleable)", () => {
    expect(computeSpineToggle(facts({ onToggle: true })).headerToggleable).toBe(false)
    expect(computeSpineToggle(facts({ onToggle: true })).rowToggleable).toBe(false)
  })

  test("agent entry + onToggle → row toggle shows (the shell always passes onToggle)", () => {
    const r = computeSpineToggle(facts({ isAgentEntry: true, onToggle: true }))
    expect(r.headerToggleable).toBe(true)
    expect(r.rowToggleable).toBe(false)
  })
})
