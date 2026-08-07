/**
 * Standalone assertion runner for the Low polish cluster (B8, B9, T8, M10, C4, C5, O5).
 * Mirrors test/low-polish.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-low-polish.standalone.ts`
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { RGBA } from "@opentui/core"
import { displayWidth } from "../src/util/locale"
import { spineRailCell, formatElapsedMs, compactSpineElapsed } from "../src/shell/command-spine/spine-types"
import { fitHeaderTabs } from "../src/feature-plugins/system/which-key"
import { approvalIdFromEntryID } from "../src/shell/command-spine/approval-spine-adapter"
import { ensureMinContrast, rgbaToHsl } from "../src/theme/contrast"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── B8 spineRailCell ────────────────────────────────────────────────
check("rail 1-col pads with space", spineRailCell("│", 2), "│ ")
check("rail 2-col glyph fills rail, no trailing space", spineRailCell("汉", 2), "汉")
check("rail 2-col emoji never split", spineRailCell("😀", 2), "😀")
check("rail ZWJ never sliced", spineRailCell("👨‍💻", 2), "👨‍💻")
for (const glyph of ["│", "◤", "⤷", "😀", "─"]) {
  check(`rail ${glyph} never exceeds width 2`, displayWidth(spineRailCell(glyph, 2)) <= 2, true)
}
check("rail width 1 keeps glyph", spineRailCell("│", 1), "│")
check("rail width 0 empty", spineRailCell("│", 0), "")

// ─── B9 fitHeaderTabs ────────────────────────────────────────────────
const fitAll = fitHeaderTabs(["a", "b", "c"], 40, 1, 2)
check("tabs all fit", fitAll.shown, 3)
check("tabs all fit no overflow", fitAll.overflow, false)
const fitCap = fitHeaderTabs(["a", "b", "c"], 10, 1, 2)
check("tabs cap to 2 at width 10", fitCap.shown, 2)
check("tabs overflow flagged", fitCap.overflow, true)
const fitCjk = fitHeaderTabs(["文", "b"], 6, 0, 2)
check("tabs CJK display width counts", fitCjk.shown, 1)
check("tabs CJK overflow flagged", fitCjk.overflow, true)
const fitFirst = fitHeaderTabs(["toolong"], 3, 1, 2)
check("tabs always show first", fitFirst.shown, 1)
check("tabs single no overflow", fitFirst.overflow, false)
const fitEmpty = fitHeaderTabs([], 20, 1, 2)
check("tabs empty shown 0", fitEmpty.shown, 0)
check("tabs empty no overflow", fitEmpty.overflow, false)

// ─── T8 formatElapsedMs ──────────────────────────────────────────────
check("elapsed undefined → ''", formatElapsedMs(undefined), "")
check("elapsed -1 → ''", formatElapsedMs(-1), "")
check("elapsed 0 → ''", formatElapsedMs(0), "")
check("elapsed 123ms", formatElapsedMs(123), "+123ms")
check("elapsed 12.3s", formatElapsedMs(12300), "+12.3s")
check("elapsed 5s", formatElapsedMs(5000), "+5s")
check("elapsed 90s → +1m", formatElapsedMs(90000), "+1m")
check("elapsed 120s → +2m", formatElapsedMs(120000), "+2m")
check("elapsed 1h", formatElapsedMs(3600000), "+1h")
check("elapsed 1.5h floors → +1h", formatElapsedMs(5400000), "+1h")
check("elapsed 1d", formatElapsedMs(90061000), "+1d")
check("elapsed NaN → ''", formatElapsedMs(Number.NaN), "")
check("elapsed Infinity → ''", formatElapsedMs(Number.POSITIVE_INFINITY), "")
check(
  "elapsed compactSpineElapsed unit intact",
  compactSpineElapsed(formatElapsedMs(123456), 4).includes("…"),
  false,
)

const mapperSrc = readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-mapper.ts"), "utf8")
check("mapper has no local formatElapsed", mapperSrc.includes("function formatElapsed("), false)
check("mapper delegates to formatElapsedMs", mapperSrc.includes("formatElapsedMs"), true)

// ─── M10 approvalIdFromEntryID ───────────────────────────────────────
check("approval id strips version", approvalIdFromEntryID("approval:abc:1"), "abc")
check("approval id joins middle segments", approvalIdFromEntryID("approval:a:b:c:2"), "a:b:c")
check("approval non-id → undefined", approvalIdFromEntryID("nope"), undefined)
check("approval empty → undefined", approvalIdFromEntryID(""), undefined)
check("approval no version → undefined", approvalIdFromEntryID("approval:abc"), undefined)

const shellSrc = readFileSync(join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"), "utf8")
const navigationSrc = readFileSync(join(import.meta.dir, "../src/shell/command-spine/use-spine-navigation.ts"), "utf8")
const adapterSrc = readFileSync(join(import.meta.dir, "../src/shell/command-spine/approval-spine-adapter.ts"), "utf8")
check("shell no slice-based approval parse", shellSrc.includes('.slice("approval:".length)'), false)
check("shell no entryID.slice", shellSrc.includes("entryID.slice("), false)
check("navigation hook uses approvalIdFromEntryID (PR5 split)", navigationSrc.includes("approvalIdFromEntryID"), true)
check("adapter exports approvalIdFromEntryID", adapterSrc.includes("export function approvalIdFromEntryID"), true)

// ─── C4 statusbar chip edge ──────────────────────────────────────────
const statusbarSrc = readFileSync(join(import.meta.dir, "../src/feature-plugins/system/statusbar.tsx"), "utf8")
check("bar padding collapses when chip leads", statusbarSrc.includes("paddingLeft={chipAtEdge() ? 0 : 2}"), true)
check("chip compensates own left inset (3 = bar 0 + chip 3)", statusbarSrc.includes("paddingLeft={chipAtEdge() ? 3 : 1}"), true)
check("chipAtEdge gated on !busyVerb", statusbarSrc.includes("!busyVerb()"), true)

// ─── C5 hue-preserving ensureMinContrast ─────────────────────────────
const red = RGBA.fromInts(255, 0, 0, 255)
const green = RGBA.fromInts(0, 255, 0, 255)
const blue = RGBA.fromInts(0, 0, 255, 255)
// Dark enough that pure white reaches 4.5:1 (mid-gray 128 caps at ~3.95:1).
const darkGray = RGBA.fromInts(60, 60, 60, 255)

const outR = ensureMinContrast(red, darkGray, 4.5)
check("red hue preserved ≈ 0", Math.abs(rgbaToHsl(outR).h - 0) <= 2, true)
check("red lightened toward white", rgbaToHsl(outR).l > rgbaToHsl(red).l, true)
const outG = ensureMinContrast(green, darkGray, 4.5)
const outB = ensureMinContrast(blue, darkGray, 4.5)
check("green hue preserved ≈ 120", Math.abs(rgbaToHsl(outG).h - 120) <= 2, true)
check("blue hue preserved ≈ 240", Math.abs(rgbaToHsl(outB).h - 240) <= 2, true)
check(
  "adjacent hues never collapse",
  Math.abs(rgbaToHsl(outR).h - rgbaToHsl(outG).h) > 100,
  true,
)
const light = RGBA.fromInts(240, 240, 240, 255)
const softBlue = RGBA.fromInts(150, 150, 220, 255)
const outB2 = ensureMinContrast(softBlue, light, 4.5)
check("light bg hue preserved ≈ 240", Math.abs(rgbaToHsl(outB2).h - 240) <= 2, true)
check("light bg darkens toward black", rgbaToHsl(outB2).l < rgbaToHsl(softBlue).l, true)
const white = RGBA.fromInts(255, 255, 255, 255)
const black = RGBA.fromInts(0, 0, 0, 255)
check("already-passing unchanged", ensureMinContrast(white, black, 7), white)

// ─── O5 statusbar bar clamp ──────────────────────────────────────────
check("bar minWidth 0", statusbarSrc.includes("minWidth={0}"), true)
check("bar overflow hidden", statusbarSrc.includes('overflow="hidden"'), true)

// ─── summary ─────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "✅" : "❌"} Low-polish cluster: ${assertions} assertions, ${failures} failures`)
if (failures > 0) process.exit(1)
