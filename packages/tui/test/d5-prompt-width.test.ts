/**
 * D5 — prompt violates the spine width contract (audit D5 row, Medium).
 *
 * The prompt did its own raw `dimensions()` math instead of the spine's
 * centralized width contract ("No component subtracts its own padding",
 * command-spine-shell.tsx:69-71):
 *   - `maxHeight = Math.max(6, Math.floor(dimensions().height / 3))`
 *   - `moveLabelWidth = Math.max(12, Math.min(44, dimensions().width - 48))`
 *     — DEAD CODE: zero consumers repo-wide (verified 2026-07-31).
 *
 * Fix (best practice, mirrors B6 `homePromptMaxWidth` / B7 `dialogVerticalPad`
 * in util/geometry.ts): one centralized `promptMaxHeight(termHeight)` helper —
 * non-negative integer clamp at computation time per layout.mdx — and the
 * prompt consumes it. The dead `moveLabelWidth` memo is deleted.
 *
 * Source contracts fail on the old code.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { promptMaxHeight } from "../src/util/geometry"

const read = (rel: string) =>
  readFileSync(join(import.meta.dir, rel), "utf8").replace(/\r\n/g, "\n")

const prompt = () => read("../src/component/prompt/index.tsx")
const geometry = () => read("../src/util/geometry.ts")

describe("D5 — prompt geometry routes through the centralized contract", () => {
  test("the dead moveLabelWidth memo is deleted", () => {
    const src = prompt()
    expect(src).not.toContain("moveLabelWidth")
    expect(src).not.toContain("dimensions().width - 48")
  })
  test("maxHeight no longer does raw dimensions math in the component", () => {
    const src = prompt()
    expect(src).not.toContain("Math.floor(dimensions().height / 3)")
  })
  test("maxHeight consumes the centralized promptMaxHeight helper", () => {
    const src = prompt()
    expect(src).toContain("promptMaxHeight(dimensions().height)")
  })
  test("geometry.ts exports the centralized promptMaxHeight", () => {
    const src = geometry()
    expect(src).toContain("export function promptMaxHeight(")
    expect(src).toContain("Number.isFinite(termHeight)")
    expect(src).toContain("Math.floor(term / 3)")
    expect(src).toContain("Math.max(6,")
  })
})

describe("D5 — promptMaxHeight behavior (identical to the old inline math)", () => {
  test("whole-cell floor with a 6-row minimum", () => {
    expect(promptMaxHeight(30)).toBe(10) // floor(30/3) = 10
    expect(promptMaxHeight(21)).toBe(7) // floor(21/3) = 7
    expect(promptMaxHeight(20)).toBe(6) // floor(20/3) = 6 → max(6, 6)
    expect(promptMaxHeight(9)).toBe(6) // floor(9/3) = 3 → floored at 6
  })
  test("degenerate heights never go below the 6-row minimum", () => {
    expect(promptMaxHeight(0)).toBe(6)
    expect(promptMaxHeight(-5)).toBe(6)
    expect(promptMaxHeight(Number.NaN)).toBe(6)
  })
})
