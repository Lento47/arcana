/**
 * C2 — focus highlight is not row-aligned (audit C2 row, Medium).
 *
 * Old: `backgroundColor={backgroundElement}` + left accent border were on the
 * INNER header box only, while the `SpineGutter` column (2 cols) sits outside
 * it in the outer row box → a focused row showed a 2-column un-highlighted gap
 * at its left edge, and the highlight ended where the body began.
 *
 * Fix: move the highlight to the OUTER row box so it spans the full row —
 * gutter (no left gap) + header + body — and extract the policy as a pure
 * `rowFocusHighlight(focused, isChatProse)` helper (S7 pattern).
 *
 * Quiet Rail (2026-09): focus is structural, not a wash. Non-chat rows get a
 * whisper fill (~30% of one step); chat prose rows get no fill — the card
 * hairline and marker glyph carry focus. Focus never adds a border, so
 * focused and unfocused frames keep identical content columns.
 *
 * Source contracts fail on the old code.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { rowFocusHighlight } from "../src/shell/command-spine/spine-entry"

const entry = () =>
  readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"), "utf8").replace(/\r\n/g, "\n")

describe("C2 — focus highlight lives on the row container, not the header box", () => {
  test("the header box no longer owns the fill or accent border", () => {
    const src = entry()
    expect(src).not.toContain("backgroundColor={props.focused ? theme.backgroundElement : undefined}")
    expect(src).not.toContain('border={props.focused && !isChatProse() ? (["left"] as any) : undefined}')
  })
  test("a rowHighlight memo feeds the outer row box (bg only — Quiet Rail)", () => {
    const src = entry()
    expect(src).toContain("const rowHighlight = createMemo(")
    expect(src).toContain("backgroundColor={rowHighlight().bg}")
    // Quiet Rail: focus never adds a border, so focused and unfocused frames
    // keep identical content columns.
    expect(src).not.toContain("border={rowHighlight().border}")
    expect(src).not.toContain("borderColor={rowHighlight().borderColor}")
  })
  test("the pure policy is exported and consumed by the memo", () => {
    const src = entry()
    expect(src).toContain("export function rowFocusHighlight(")
    expect(src).toContain("rowFocusHighlight(props.focused === true, isChatProse())")
  })
  test("the bg sits on the outer row box, before the gutter (gutter inside highlight)", () => {
    const src = entry()
    const idAt = src.indexOf("id={entry().id}")
    const bgAt = src.indexOf("backgroundColor={rowHighlight().bg}")
    const gutterAt = src.indexOf("<SpineGutter")
    expect(idAt).toBeGreaterThanOrEqual(0)
    expect(idAt).toBeLessThan(bgAt)
    expect(bgAt).toBeLessThan(gutterAt)
  })
})

describe("C2 — rowFocusHighlight policy (Quiet Rail)", () => {
  test("focused non-chat rows whisper; chat prose rows signal with the rail only", () => {
    expect(rowFocusHighlight(true, false)).toBe("whisper")
    expect(rowFocusHighlight(true, true)).toBe("rail")
    expect(rowFocusHighlight(false, false)).toBe("none")
    expect(rowFocusHighlight(false, true)).toBe("none")
  })
})

describe("C2 — chat voice uses SpineChatCard", () => {
  test("prose rows render the shared card, not a second inline chrome tree", () => {
    const src = entry()
    expect(src).toContain("<SpineChatCard")
    expect(src).not.toContain("const chatSpeaker")
    expect(src).not.toContain("const chatGlyph")
  })
})
