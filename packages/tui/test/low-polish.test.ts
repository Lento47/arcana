/**
 * Low polish cluster tests (audit B8, B9, T8, M10, C4, C5, O5).
 *
 * B8: spineRailCell — display-width, grapheme-safe rail cell (never slices a
 *     surrogate pair; a 2-col glyph fills the 2-col rail without trailing space).
 * B9: fitHeaderTabs — caps header tabs to those that fit contentWidth, reports overflow.
 * T8: formatElapsedMs — canonical unit-preserving tiers (ms/s/m/h/d), consistent
 *     precision across ranges (delegates spine-mapper's old local formatElapsed).
 * M10: approvalIdFromEntryID — ONE parse of "approval:<id>:<version>" shared by the
 *      shell's extract path and focusEntryID select path.
 * C4: statusbar chip edge — chips flush with the bar's left edge when leading.
 * C5: ensureMinContrast hue preservation — lightness walk toward the pole opposite
 *     the background keeps hue+saturation, so adjacent spine kinds never collapse.
 * O5: statusbar bar clamp — minWidth 0 + overflow hidden on the segment row.
 */
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { RGBA } from "@opentui/core"
import { displayWidth } from "../src/util/locale"
import { spineRailCell, formatElapsedMs, compactSpineElapsed } from "../src/shell/command-spine/spine-types"
import { fitHeaderTabs } from "../src/feature-plugins/system/which-key"
import { approvalIdFromEntryID } from "../src/shell/command-spine/approval-spine-adapter"
import { ensureMinContrast, rgbaToHsl } from "../src/theme/contrast"

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8")
const statusbarSrc = read("../src/feature-plugins/system/statusbar.tsx")
const mapperSrc = read("../src/shell/command-spine/spine-mapper.ts")
const shellSrc = read("../src/shell/command-spine/command-spine-shell.tsx")
const adapterSrc = read("../src/shell/command-spine/approval-spine-adapter.ts")

// ─── B8 spineRailCell ────────────────────────────────────────────────
describe("B8 spineRailCell", () => {
  test("1-col glyph pads with a trailing space to width", () => {
    expect(spineRailCell("│", 2)).toBe("│ ")
  })

  test("2-col glyph fills the 2-col rail with no trailing space", () => {
    expect(spineRailCell("汉", 2)).toBe("汉")
  })

  test("2-col emoji fills the rail without splitting the surrogate pair", () => {
    expect(spineRailCell("😀", 2)).toBe("😀")
  })

  test("ZWJ emoji sequence is never sliced mid-sequence", () => {
    expect(spineRailCell("👨‍💻", 2)).toBe("👨‍💻")
  })

  test("cell never exceeds the rail width for common rail glyphs", () => {
    for (const glyph of ["│", "◤", "⤷", "😀", "│ ", "─"]) {
      expect(displayWidth(spineRailCell(glyph, 2))).toBeLessThanOrEqual(2)
    }
  })

  test("width 1 keeps a 1-col glyph", () => {
    expect(spineRailCell("│", 1)).toBe("│")
  })

  test("width <= 0 returns empty", () => {
    expect(spineRailCell("│", 0)).toBe("")
  })
})

// ─── B9 fitHeaderTabs ────────────────────────────────────────────────
describe("B9 fitHeaderTabs", () => {
  test("all tabs fit when contentWidth is ample", () => {
    const fit = fitHeaderTabs(["a", "b", "c"], 40, 1, 2)
    expect(fit.shown).toBe(3)
    expect(fit.overflow).toBe(false)
  })

  test("caps to the prefix that fits (3-col tabs, gap 1, width 10)", () => {
    // a=3, b=3, c=3 → 3+1+3=7 fits, +1+3=11 > 10
    const fit = fitHeaderTabs(["a", "b", "c"], 10, 1, 2)
    expect(fit.shown).toBe(2)
    expect(fit.overflow).toBe(true)
  })

  test("label display width counts (not code units)", () => {
    // CJK label = 2 cols + 2 pad = 4
    const fit = fitHeaderTabs(["文", "b"], 6, 0, 2)
    expect(fit.shown).toBe(1)
    expect(fit.overflow).toBe(true)
  })

  test("always shows at least one tab even when the first is wider than the width", () => {
    const fit = fitHeaderTabs(["toolong"], 3, 1, 2)
    expect(fit.shown).toBe(1)
    expect(fit.overflow).toBe(false)
  })

  test("empty labels → shown 0, no overflow", () => {
    const fit = fitHeaderTabs([], 20, 1, 2)
    expect(fit.shown).toBe(0)
    expect(fit.overflow).toBe(false)
  })
})

// ─── T8 formatElapsedMs ──────────────────────────────────────────────
describe("T8 formatElapsedMs", () => {
  test("undefined / negative / zero → empty (no +0ms noise)", () => {
    expect(formatElapsedMs(undefined)).toBe("")
    expect(formatElapsedMs(-1)).toBe("")
    expect(formatElapsedMs(0)).toBe("")
  })

  test("sub-second keeps ms unit", () => {
    expect(formatElapsedMs(123)).toBe("+123ms")
  })

  test("seconds get tenths precision (consistent, was rounded ints)", () => {
    expect(formatElapsedMs(12300)).toBe("+12.3s")
    expect(formatElapsedMs(5000)).toBe("+5s")
  })

  test("minutes floor instead of rounding up (90s → +1m, was +2m)", () => {
    expect(formatElapsedMs(90000)).toBe("+1m")
    expect(formatElapsedMs(120000)).toBe("+2m")
  })

  test("hours keep the unit and floor minutes", () => {
    expect(formatElapsedMs(3600000)).toBe("+1h")
    expect(formatElapsedMs(5400000)).toBe("+1h")
  })

  test("days tier", () => {
    expect(formatElapsedMs(90061000)).toBe("+1d")
  })

  test("non-finite → empty", () => {
    expect(formatElapsedMs(Number.NaN)).toBe("")
    expect(formatElapsedMs(Number.POSITIVE_INFINITY)).toBe("")
  })

  test("outputs are consumable by compactSpineElapsed (unit never eaten)", () => {
    const narrow = formatElapsedMs(123456)
    expect(compactSpineElapsed(narrow, 4)).toMatch(/^\+?\d/)
    expect(compactSpineElapsed(narrow, 4)).not.toContain("…")
  })

  test("mapper delegates — no local tier logic remains", () => {
    expect(mapperSrc.includes("function formatElapsed(")).toBe(false)
    expect(mapperSrc.includes("formatElapsedMs")).toBe(true)
  })
})

// ─── M10 approvalIdFromEntryID ───────────────────────────────────────
describe("M10 approvalIdFromEntryID", () => {
  test("parses approval:<id>:<version> stripping the version", () => {
    expect(approvalIdFromEntryID("approval:abc:1")).toBe("abc")
  })

  test("joins middle segments when the approval id itself contains ':'", () => {
    expect(approvalIdFromEntryID("approval:a:b:c:2")).toBe("a:b:c")
  })

  test("non-approval ids → undefined", () => {
    expect(approvalIdFromEntryID("nope")).toBeUndefined()
    expect(approvalIdFromEntryID("")).toBeUndefined()
  })

  test("id without a version segment → undefined (format requires :<version>)", () => {
    expect(approvalIdFromEntryID("approval:abc")).toBeUndefined()
  })

  test("shell uses the shared parse — no second slice-based parsing", () => {
    expect(shellSrc.includes('.slice("approval:".length)')).toBe(false)
    expect(shellSrc.includes("entryID.slice(")).toBe(false)
    expect(shellSrc.includes("approvalIdFromEntryID")).toBe(true)
  })
})

// ─── C4 statusbar chip edge ──────────────────────────────────────────
describe("C4 statusbar chip edge", () => {
  test("bar padding collapses when a chip leads so its bg reaches the edge", () => {
    expect(statusbarSrc.includes("paddingLeft={chipAtEdge() ? 0 : 2}")).toBe(true)
  })

  test("leading chip compensates its own left inset (3 = bar 0 + chip 3)", () => {
    expect(statusbarSrc.includes("paddingLeft={chipAtEdge() ? 3 : 1}")).toBe(true)
  })

  test("chipAtEdge only when the chip is the first visible element", () => {
    expect(statusbarSrc.includes("!busyVerb()")).toBe(true)
  })
})

// ─── C5 hue-preserving ensureMinContrast ─────────────────────────────
describe("C5 ensureMinContrast hue preservation", () => {
  const red = RGBA.fromInts(255, 0, 0, 255)
  const green = RGBA.fromInts(0, 255, 0, 255)
  const blue = RGBA.fromInts(0, 0, 255, 255)
  // Dark enough that pure white reaches 4.5:1 (mid-gray 128 caps at ~3.95:1 —
  // the ratio must be physically reachable for the lightness walk to converge).
  const darkGray = RGBA.fromInts(60, 60, 60, 255)

  test("red on dark gray lightens toward white but keeps hue ≈ 0°", () => {
    const out = ensureMinContrast(red, darkGray, 4.5)
    const hue = rgbaToHsl(out).h
    expect(Math.abs(hue - 0)).toBeLessThanOrEqual(2)
    expect(rgbaToHsl(out).l).toBeGreaterThan(rgbaToHsl(red).l)
  })

  test("green keeps hue ≈ 120°, blue keeps hue ≈ 240°", () => {
    const outG = ensureMinContrast(green, darkGray, 4.5)
    const outB = ensureMinContrast(blue, darkGray, 4.5)
    expect(Math.abs(rgbaToHsl(outG).h - 120)).toBeLessThanOrEqual(2)
    expect(Math.abs(rgbaToHsl(outB).h - 240)).toBeLessThanOrEqual(2)
  })

  test("adjacent spine hues never collapse onto the same shifted color", () => {
    const outR = ensureMinContrast(red, darkGray, 4.5)
    const outG = ensureMinContrast(green, darkGray, 4.5)
    const dHue = Math.abs(rgbaToHsl(outR).h - rgbaToHsl(outG).h)
    expect(dHue).toBeGreaterThan(100)
  })

  test("light background darkens toward black, hue preserved", () => {
    const light = RGBA.fromInts(240, 240, 240, 255)
    // A soft blue whose luminance against the light bg fails 4.5:1, so the
    // walk must darken — pure blue already passes on light bg, so it must
    // fail first (mid-tone needed).
    const softBlue = RGBA.fromInts(150, 150, 220, 255)
    const out = ensureMinContrast(softBlue, light, 4.5)
    expect(Math.abs(rgbaToHsl(out).h - 240)).toBeLessThanOrEqual(2)
    expect(rgbaToHsl(out).l).toBeLessThan(rgbaToHsl(softBlue).l)
  })

  test("already-passing contrast returns the color unchanged", () => {
    const white = RGBA.fromInts(255, 255, 255, 255)
    const black = RGBA.fromInts(0, 0, 0, 255)
    expect(ensureMinContrast(white, black, 7)).toBe(white)
  })
})

// ─── O5 statusbar bar clamp ──────────────────────────────────────────
describe("O5 statusbar bar clamp", () => {
  test("segment row has minWidth 0 + overflow hidden (no right-edge push-off)", () => {
    expect(statusbarSrc.includes("minWidth={0}")).toBe(true)
    expect(statusbarSrc.includes('overflow="hidden"')).toBe(true)
  })
})
