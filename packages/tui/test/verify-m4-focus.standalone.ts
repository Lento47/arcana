/**
 * Standalone assertion runner for the M4 double-focus fix.
 * Mirrors test/m4-focus-policy.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-m4-focus.standalone.ts`
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── M4 source contract ──────────────────────────────────────────────
const entrySrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"),
  "utf8",
)

check("row keeps onMouseDown={handleFocus}", entrySrc.includes("onMouseDown={handleFocus}"), true)
check("row no longer binds onMouseUp={handleFocus}", entrySrc.includes("onMouseUp={handleFocus}"), false)
check("suppressNextFocusMouseUp removed", entrySrc.includes("suppressNextFocusMouseUp"), false)
check("releaseFocusSuppression removed", entrySrc.includes("releaseFocusSuppression"), false)
check("handleToggle keeps lastToggleAt debounce", entrySrc.includes("lastToggleAt"), true)
check("120ms debounce threshold kept", entrySrc.includes("now - lastToggleAt < 120"), true)
check("handleHeaderMouseDown still wired", entrySrc.includes("handleHeaderMouseDown"), true)
check("handleHeaderMouseUp still wired", entrySrc.includes("handleHeaderMouseUp"), true)

if (failures > 0) {
  console.log(`${failures}/${assertions} M4 assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} M4 assertions passed.`)
