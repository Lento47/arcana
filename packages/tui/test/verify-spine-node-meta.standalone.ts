/**
 * Standalone assertion runner for the M1 meta-strip helper (spine-node).
 * Mirrors test/spine-node-meta.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-spine-node-meta.standalone.ts`
 */
import { nodeMetaStrip } from "../src/shell/command-spine/spine-node"

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

// ─── nodeMetaStrip (M1) ─────────────────────────────────────────────
check("no meta → []", nodeMetaStrip("", ""), [])
check("disclosure ▸ alone", nodeMetaStrip("▸", ""), [{ text: " ▸", tone: "summary" }])
check("disclosure ▾ alone", nodeMetaStrip("▾", ""), [{ text: " ▾", tone: "summary" }])
check("elapsed alone", nodeMetaStrip("", "+1.2s"), [{ text: " · +1.2s", tone: "elapsed" }])
check("elapsed long", nodeMetaStrip("", "+1h 2m"), [{ text: " · +1h 2m", tone: "elapsed" }])
check("both, chevron first", nodeMetaStrip("▾", "+1h 2m"), [
  { text: " ▾", tone: "summary" },
  { text: " · +1h 2m", tone: "elapsed" },
])

// M1 contract: meta never leaks into the wrapping summary text node.
{
  const summary = "Scanning the codebase for orphaned exports across 40 packages"
  const parts = nodeMetaStrip("▾", "+1h 2m")
  const metaText = parts.map((p) => p.text).join("")
  checkTrue("summary excludes joined meta", !summary.includes(metaText))
  checkTrue("summary excludes chevron", !summary.includes("▾"))
  checkTrue("summary excludes elapsed", !summary.includes("+1h"))
}

if (failures > 0) {
  console.log(`${failures}/${assertions} spine-node-meta assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} spine-node-meta assertions passed.`)
