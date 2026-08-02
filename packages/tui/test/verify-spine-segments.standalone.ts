/**
 * Standalone assertion runner for the S2/S3 gutter label + header segments.
 * Mirrors test/spine-segments.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-spine-segments.standalone.ts`
 */
import { gutterStepLabel } from "../src/shell/command-spine/spine-gutter"
import { buildStatusSegments } from "../src/shell/command-spine/spine-segments"
import { COMPACT_NOW_PERCENT, COMPACT_SOON_PERCENT } from "../src/util/context-pressure"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}
function checkTrue(name: string, cond: boolean) {
  assertions++
  if (!cond) {
    failures++
    console.log(`FAIL ${name}`)
  }
}

// ─── gutterStepLabel (S2) ───────────────────────────────────────────
check("gutterStepLabel(0) === '  '", gutterStepLabel(0), "  ")
check("gutterStepLabel(-1) === '  '", gutterStepLabel(-1), "  ")
check("gutterStepLabel(1) === '01'", gutterStepLabel(1), "01")
check("gutterStepLabel(5) === '05'", gutterStepLabel(5), "05")
check("gutterStepLabel(42) === '42'", gutterStepLabel(42), "42")
check("gutterStepLabel(99) === '99'", gutterStepLabel(99), "99")
check("gutterStepLabel(100) === '100'", gutterStepLabel(100), "100")
check("gutterStepLabel(1000) === '1000'", gutterStepLabel(1000), "1000")
check("gutterStepLabel(118, 3) === '118'", gutterStepLabel(118, 3), "118")

// ─── buildStatusSegments (S3) ───────────────────────────────────────
check("empty → []", buildStatusSegments({}), [])
check("undefined branch/session → []", buildStatusSegments({ sessionID: undefined, branch: undefined }), [])
check(
  "branch → accent",
  buildStatusSegments({ branch: "main" }),
  [{ key: "branch", label: "branch", value: "main", tone: "accent" }],
)
check(
  "model → brand",
  buildStatusSegments({ model: "gpt-4o" }),
  [{ key: "model", label: "model", value: "gpt-4o", tone: "brand" }],
)
check(
  "ctx 34 → 34% info",
  buildStatusSegments({ ctxPercent: 34 }),
  [{ key: "ctx", label: "ctx", value: "34%", tone: "info" }],
)
checkTrue(
  "ctx just below SOON → info",
  buildStatusSegments({ ctxPercent: COMPACT_SOON_PERCENT - 1 })[0]?.tone === "info",
)
checkTrue(
  "ctx at SOON → warning",
  buildStatusSegments({ ctxPercent: COMPACT_SOON_PERCENT })[0]?.tone === "warning",
)
checkTrue(
  "ctx at NOW → error",
  buildStatusSegments({ ctxPercent: COMPACT_NOW_PERCENT })[0]?.tone === "error",
)
check("ctx null → []", buildStatusSegments({ ctxPercent: null }), [])
check("ctx NaN → []", buildStatusSegments({ ctxPercent: Number.NaN }), [])
check("ctx undefined → []", buildStatusSegments({ ctxPercent: undefined }), [])
check("state idle → [] (noise)", buildStatusSegments({ state: "idle" }), [])
check(
  "state busy → info",
  buildStatusSegments({ state: "busy" }),
  [{ key: "state", label: "state", value: "busy", tone: "info" }],
)
checkTrue("state retry → warning", buildStatusSegments({ state: "retry" })[0]?.tone === "warning")
checkTrue("state error → error", buildStatusSegments({ state: "error" })[0]?.tone === "error")
check(
  "session → muted",
  buildStatusSegments({ sessionID: "abc123" }),
  [{ key: "session", label: "session", value: "abc123", tone: "muted" }],
)
check(
  "path → muted",
  buildStatusSegments({ path: "/repo/src" }),
  [{ key: "path", label: "path", value: "/repo/src", tone: "muted" }],
)
check(
  "full source → stable order",
  buildStatusSegments({ sessionID: "sess-42", branch: "feat/audit", model: "claude", ctxPercent: 60, state: "busy", path: "/repo" }).map((s) => s.key),
  ["branch", "model", "ctx", "state", "session", "path"],
)

if (failures > 0) {
  console.log(`${failures}/${assertions} spine-segments assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} spine-segments assertions passed.`)
