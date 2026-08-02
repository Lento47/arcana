/**
 * Standalone assertion runner for getSpineLayout hysteresis (S4).
 * Mirrors test/spine-layout-hysteresis.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-spine-layout-hysteresis.standalone.ts`
 */
import { getSpineLayout } from "../src/shell/command-spine/spine-types"

let failures = 0
let assertions = 0
function check(name: string, actual: string, expected: string) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${expected}, got ${actual}`)
  }
}

// ─── fresh breakpoints ──────────────────────────────────────────────
check("fresh 120 → wide", getSpineLayout(120), "wide")
check("fresh 100 → compact", getSpineLayout(100), "compact")
check("fresh 80 → narrow", getSpineLayout(80), "narrow")
check("fresh 50 → minimal", getSpineLayout(50), "minimal")
check("fresh 119 → compact", getSpineLayout(119), "compact")
check("fresh 99 → narrow", getSpineLayout(99), "narrow")
check("fresh 79 → minimal", getSpineLayout(79), "minimal")

// ─── hysteresis dead zones ──────────────────────────────────────────
check("wide holds 119", getSpineLayout(119, "wide"), "wide")
check("wide holds 115", getSpineLayout(115, "wide"), "wide")
check("wide releases 114 → compact", getSpineLayout(114, "wide"), "compact")
check("compact holds 99", getSpineLayout(99, "compact"), "compact")
check("compact holds 95", getSpineLayout(95, "compact"), "compact")
check("compact holds 124", getSpineLayout(124, "compact"), "compact")
check("compact releases 94 → narrow", getSpineLayout(94, "compact"), "narrow")
check("compact releases 125 → wide", getSpineLayout(125, "compact"), "wide")
check("narrow holds 79", getSpineLayout(79, "narrow"), "narrow")
check("narrow holds 75", getSpineLayout(75, "narrow"), "narrow")
check("narrow holds 104", getSpineLayout(104, "narrow"), "narrow")
check("narrow releases 74 → minimal", getSpineLayout(74, "narrow"), "minimal")
check("narrow releases 105 → compact", getSpineLayout(105, "narrow"), "compact")
check("minimal holds 84", getSpineLayout(84, "minimal"), "minimal")
check("minimal releases 85 → narrow", getSpineLayout(85, "minimal"), "narrow")

// ─── flap-stop at boundary oscillation (the S4 regression) ──────────
{
  let current = getSpineLayout(120) // fresh → wide
  current = getSpineLayout(119, current)
  current = getSpineLayout(120, current)
  current = getSpineLayout(119, current)
  check("119↔120 oscillation ends wide (no flap)", current, "wide")
}
{
  let current = getSpineLayout(100) // fresh → compact
  current = getSpineLayout(99, current)
  current = getSpineLayout(100, current)
  current = getSpineLayout(99, current)
  check("99↔100 oscillation ends compact (no flap)", current, "compact")
}
{
  let current = getSpineLayout(80) // fresh → narrow
  current = getSpineLayout(79, current)
  current = getSpineLayout(80, current)
  current = getSpineLayout(79, current)
  check("79↔80 oscillation ends narrow (no flap)", current, "narrow")
}
{
  let current = getSpineLayout(120) // wide
  for (const w of [118, 116, 114, 110, 104, 100, 96, 94, 90, 84, 80, 76, 74]) {
    current = getSpineLayout(w, current)
  }
  check("sustained shrink crosses to minimal", current, "minimal")
}

if (failures > 0) {
  console.log(`${failures}/${assertions} spine-layout assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} spine-layout hysteresis assertions passed.`)
