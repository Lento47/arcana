/**
 * Standalone assertion runner for the M9/S8/M11/T7 quick-win cleanup pass.
 * Mirrors test/cleanup-pass.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-cleanup-pass.standalone.ts`
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { currency, truncate, truncateMiddle } from "../src/util/locale"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── M11 Locale.currency (locale-robust) ──────────────────────────────
check("currency(NaN) === ''", currency(NaN), "")
check("currency(Infinity) === ''", currency(Infinity), "")
check("currency(0) contains a 0 digit", currency(0).includes("0"), true)
check("currency(1.5) is non-empty", currency(1.5) !== "", true)

// ─── T7 display-width cuts ────────────────────────────────────────────
check("truncateMiddle 17-col parity", truncateMiddle("0123456789ABCDEFGHIJKLMNOP", 17), "01234567…IJKLMNOP")
check("truncateMiddle short passthrough", truncateMiddle("abc123", 17), "abc123")
check("truncate 40-col title parity", truncate("x".repeat(45), 40), "x".repeat(39) + "…")
check("truncate short passthrough", truncate("short title", 40), "short title")

// ─── source reads ─────────────────────────────────────────────────────
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8")
const spineProseSrc = read("../src/shell/command-spine/spine-prose.tsx")
const shellSrc = read("../src/shell/command-spine/command-spine-shell.tsx")
const indexSrc = read("../src/shell/command-spine/index.ts")
const localeSrc = read("../src/util/locale.ts")
const appSrc = read("../src/app.tsx")
const statusbarSrc = read("../src/feature-plugins/system/statusbar.tsx")
const metricsBarSrc = read("../src/component/prompt/metrics-bar.tsx")
const sidebarCtxSrc = read("../src/feature-plugins/sidebar/context.tsx")
const subagentFooterSrc = read("../src/routes/session/subagent-footer.tsx")

// ─── M9 dead ternary ──────────────────────────────────────────────────
check("codePad is a constant", spineProseSrc.includes("const codePad = () => 1"), true)
check("no identical ternary", spineProseSrc.includes("? 1 : 1"), false)

// ─── S8 scaffolding ───────────────────────────────────────────────────
check("shell has no USE_SAMPLE_SPINE", shellSrc.includes("USE_SAMPLE_SPINE"), false)
check("shell has no SAMPLE_ENTRIES", shellSrc.includes("SAMPLE_ENTRIES"), false)
check(
  "sample-entries.ts deleted",
  existsSync(join(import.meta.dir, "../src/shell/command-spine/sample-entries.ts")),
  false,
)
check("index.ts no sample-entries re-export", indexSrc.includes("sample-entries"), false)

// ─── M11 consolidation ────────────────────────────────────────────────
check("locale.ts has currency export", localeSrc.includes("export function currency"), true)
check("locale.ts no hardcoded en-US", localeSrc.includes('"en-US"'), false)
check("statusbar no USD formatter", statusbarSrc.includes('currency: "USD"'), false)
check("metrics-bar no USD formatter", metricsBarSrc.includes('currency: "USD"'), false)
check("sidebar/context no USD formatter", sidebarCtxSrc.includes('currency: "USD"'), false)
check("subagent-footer no USD formatter", subagentFooterSrc.includes('currency: "USD"'), false)
check("statusbar uses Locale.currency", statusbarSrc.includes("Locale.currency"), true)
check("metrics-bar uses Locale.currency", metricsBarSrc.includes("Locale.currency"), true)
check("sidebar/context uses Locale.currency", sidebarCtxSrc.includes("Locale.currency"), true)
check("subagent-footer uses Locale.currency", subagentFooterSrc.includes("Locale.currency"), true)

// ─── T7 ───────────────────────────────────────────────────────────────
check("app.tsx truncateMiddle(id, 17)", appSrc.includes("truncateMiddle(id, 17)"), true)
check("app.tsx truncate(label, 40)", appSrc.includes("truncate(label, 40)"), true)
check("app.tsx no id.slice(0, 10)", appSrc.includes("id.slice(0, 10)"), false)
check("app.tsx no label.slice(0, 37)", appSrc.includes("label.slice(0, 37)"), false)

if (failures > 0) {
  console.log(`${failures}/${assertions} cleanup-pass assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} cleanup-pass assertions passed.`)
