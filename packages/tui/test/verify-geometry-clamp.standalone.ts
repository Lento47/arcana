/**
 * Standalone assertion runner for the B5-B7 geometry clamps.
 * Mirrors test/geometry-clamp.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-geometry-clamp.standalone.ts`
 */
import {
  diffPatchPaneWidth,
  homePromptMaxWidth,
  dialogVerticalPad,
  dialogMaxWidth,
} from "../src/util/geometry"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── diffPatchPaneWidth (B5): clamp >= 1, never negative ────────────
check("diffPatchPaneWidth(30, true) === 1 (was -7)", diffPatchPaneWidth(30, true), 1)
check("diffPatchPaneWidth(37, true) === 1 (was 0)", diffPatchPaneWidth(37, true), 1)
check("diffPatchPaneWidth(0, true) === 1", diffPatchPaneWidth(0, true), 1)
check("diffPatchPaneWidth(0, false) === 1", diffPatchPaneWidth(0, false), 1)
check("diffPatchPaneWidth(4, false) === 1", diffPatchPaneWidth(4, false), 1)
check("diffPatchPaneWidth(40, true) === 3", diffPatchPaneWidth(40, true), 3)
check("diffPatchPaneWidth(60, true) === 23", diffPatchPaneWidth(60, true), 23)
check("diffPatchPaneWidth(100, true) === 63", diffPatchPaneWidth(100, true), 63)
check("diffPatchPaneWidth(30, false) === 26", diffPatchPaneWidth(30, false), 26)
check("diffPatchPaneWidth(40, false) === 36", diffPatchPaneWidth(40, false), 36)
check("diffPatchPaneWidth(60, false) === 56", diffPatchPaneWidth(60, false), 56)

// ─── homePromptMaxWidth (B6): never wider than the terminal ─────────
check("homePromptMaxWidth(30) === 30 (was 75)", homePromptMaxWidth(30), 30)
check("homePromptMaxWidth(40) === 40", homePromptMaxWidth(40), 40)
check("homePromptMaxWidth(60) === 60", homePromptMaxWidth(60), 60)
check("homePromptMaxWidth(1) === 1", homePromptMaxWidth(1), 1)
check("homePromptMaxWidth(75) === 75", homePromptMaxWidth(75), 75)
check("homePromptMaxWidth(100) === 75", homePromptMaxWidth(100), 75)
check("homePromptMaxWidth(107) === 75", homePromptMaxWidth(107), 75)
check("homePromptMaxWidth(120) === 84", homePromptMaxWidth(120), 84)
check("homePromptMaxWidth(200) === 140", homePromptMaxWidth(200), 140)

// ─── dialogVerticalPad (B7): integer cells ──────────────────────────
check("dialogVerticalPad(25) === 6 (was 6.25)", dialogVerticalPad(25), 6)
check("dialogVerticalPad(30) === 7", dialogVerticalPad(30), 7)
check("dialogVerticalPad(20) === 5", dialogVerticalPad(20), 5)
check("dialogVerticalPad(26) === 6", dialogVerticalPad(26), 6)
check("dialogVerticalPad(0) === 0", dialogVerticalPad(0), 0)
check("dialogVerticalPad(-5) === 0", dialogVerticalPad(-5), 0)
check("dialogVerticalPad(100) === 25", dialogVerticalPad(100), 25)

// ─── dialogMaxWidth (B7): clamp >= 1, never negative ────────────────
check("dialogMaxWidth(0) === 1", dialogMaxWidth(0), 1)
check("dialogMaxWidth(1) === 1", dialogMaxWidth(1), 1)
check("dialogMaxWidth(2) === 1", dialogMaxWidth(2), 1)
check("dialogMaxWidth(3) === 1", dialogMaxWidth(3), 1)
check("dialogMaxWidth(30) === 28", dialogMaxWidth(30), 28)
check("dialogMaxWidth(40) === 38", dialogMaxWidth(40), 38)
check("dialogMaxWidth(60) === 58", dialogMaxWidth(60), 58)
check("dialogMaxWidth(100) === 98", dialogMaxWidth(100), 98)

if (failures > 0) {
  console.log(`${failures}/${assertions} geometry assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} geometry assertions passed.`)
