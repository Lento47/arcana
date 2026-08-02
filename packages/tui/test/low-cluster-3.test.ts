/**
 * Low-cluster pass #3 — S12 + D7 (audit rows S12, D7, both Low).
 *
 * S12: `spine-diff.tsx` `formatLineNumber` used `padStart(5).slice(-5)` — line
 * numbers ≥ 100000 silently clipped (123456 → "23456"), the "slice instead of
 * min" malformat habit. Fix: `padStart(5)` without the slice.
 *
 * D7: toasts rendered per-route (`<Toast />` in home + session) rather than
 * app-global — plugin-route toasts had no surface. Fix: one app-global
 * `<Toast />` in the app.tsx root box; the per-route instances deleted.
 *
 * Source contracts fail on the old code.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (rel: string) =>
  readFileSync(join(import.meta.dir, rel), "utf8").replace(/\r\n/g, "\n")

const spineDiff = () => read("../src/shell/command-spine/spine-diff.tsx")
const app = () => read("../src/app.tsx")
const home = () => read("../src/routes/home.tsx")
const session = () => read("../src/routes/session/index.tsx")

describe("S12 — formatLineNumber never silently clips", () => {
  test("the padStart(5).slice(-5) clip is gone from spine-diff.tsx", () => {
    const src = spineDiff()
    // Contract on the exact buggy concatenation (only ever present in the old
    // code) — a bare ".slice(-5)" check would also match the S12 fix comment
    // which explains the clip in prose.
    expect(src).not.toContain("padStart(5).slice(-5)")
  })
  test("formatLineNumber keeps a padded 5-col field", () => {
    const src = spineDiff()
    expect(src).toContain("padStart(5)")
    // The undefined/NaN guard still returns the 5-space filler.
    expect(src).toContain('return "     "')
  })
})

describe("D7 — toast surface is app-global, not per-route", () => {
  test("app.tsx renders one global <Toast /> surface", () => {
    const src = app()
    expect(src).toContain("<Toast />")
    // Imported from ui/toast alongside the provider.
    expect(src).toContain('ToastProvider, Toast, useToast } from "./ui/toast"')
  })
  test("home.tsx no longer renders or imports Toast", () => {
    const src = home()
    expect(src).not.toContain("<Toast />")
    expect(src).not.toContain('from "../ui/toast"')
  })
  test("session/index.tsx no longer renders <Toast /> (keeps useToast)", () => {
    const src = session()
    expect(src).not.toContain("<Toast />")
    expect(src).toContain('import { useToast } from "../../ui/toast"')
    expect(src).not.toContain("Toast, useToast")
  })
})
