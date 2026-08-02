/**
 * Standalone assertion runner for the M5 count-cell width fix.
 * Mirrors test/m5-count-cells.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-m5-count-cells.standalone.ts`
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { countCellWidth } from "../src/shell/command-spine/spine-receipt"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── countCellWidth (pure cell-width policy) ─────────────────────────
check("+0 → 2 cols", countCellWidth(0), 2)
check("+5 → 2 cols", countCellWidth(5), 2)
check("+9 → 2 cols", countCellWidth(9), 2)
check("+12 → 3 cols", countCellWidth(12), 3)
check("+123 → 4 cols", countCellWidth(123), 4)
check("+1000 → 5 cols", countCellWidth(1000), 5)
check("+100000 → 7 cols", countCellWidth(100000), 7)

// ─── ShowCounts source contract ──────────────────────────────────────
const receiptSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-receipt.tsx"),
  "utf8",
)

check("no fixed width={8} cells", receiptSrc.includes("width={8}"), false)
check("added cell sizes from digit count", receiptSrc.includes("minWidth={countCellWidth(props.added)}"), true)
check("removed cell sizes from digit count", receiptSrc.includes("minWidth={countCellWidth(props.removed)}"), true)
check("no added < 0 sentinel", receiptSrc.includes("added < 0"), false)
check("no removed < 0 sentinel", receiptSrc.includes("removed < 0"), false)
check("zero-pair · path retained", receiptSrc.includes("added === 0 && props.removed === 0"), true)
check("spineDiffAdd tone kept", receiptSrc.includes("props.theme.spineDiffAdd"), true)
check("spineDiffRemove tone kept", receiptSrc.includes("props.theme.spineDiffRemove"), true)

if (failures > 0) {
  console.log(`${failures}/${assertions} M5 assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} M5 assertions passed.`)
