/**
 * Standalone assertion runner for compactSpineElapsed (T6 unit preservation).
 * Mirrors test/spine-elapsed.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-spine-elapsed.standalone.ts`
 */
import { compactSpineElapsed } from "../src/shell/command-spine/spine-types"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── guards ─────────────────────────────────────────────────────────
check("undefined, 5 → ''", compactSpineElapsed(undefined, 5), "")
check("'', 5 → ''", compactSpineElapsed("", 5), "")
check("'   ', 5 → ''", compactSpineElapsed("   ", 5), "")
check("'+5s', 0 → ''", compactSpineElapsed("+5s", 0), "")

// ─── fits unchanged ─────────────────────────────────────────────────
check("'+5s', 5 → '+5s'", compactSpineElapsed("+5s", 5), "+5s")
check("'+12s', 5 → '+12s'", compactSpineElapsed("+12s", 5), "+12s")
check("'+12.3s', 7 → '+12.3s'", compactSpineElapsed("+12.3s", 7), "+12.3s")
check("'+123ms', 7 → '+123ms'", compactSpineElapsed("+123ms", 7), "+123ms")
check("'+1h', 5 → '+1h'", compactSpineElapsed("+1h", 5), "+1h")
check("'+5m', 5 → '+5m'", compactSpineElapsed("+5m", 5), "+5m")
check("'12s', 5 → '12s'", compactSpineElapsed("12s", 5), "12s")

// ─── fractional-second compaction ───────────────────────────────────
check("'+12.3s', 5 → '+12s'", compactSpineElapsed("+12.3s", 5), "+12s")

// ─── T6: unit never eaten — re-render at coarser precision ──────────
check("'+123ms', 5 → '+0.1s'", compactSpineElapsed("+123ms", 5), "+0.1s")
check("'+999ms', 5 → '+1s'", compactSpineElapsed("+999ms", 5), "+1s")
check("'+1234ms', 5 → '+1.2s'", compactSpineElapsed("+1234ms", 5), "+1.2s")
check("'+1234ms', 7 → '+1234ms'", compactSpineElapsed("+1234ms", 7), "+1234ms")

// ─── unit kept even when no tier fits ───────────────────────────────
check("'+1h', 2 → '+1h'", compactSpineElapsed("+1h", 2), "+1h")

if (failures > 0) {
  console.log(`${failures}/${assertions} spine-elapsed assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} spine-elapsed assertions passed.`)
