/**
 * Standalone assertion runner for the S9 composer pulse-gating fix.
 * Mirrors test/spine-prompt-pulse.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-spine-prompt-pulse.standalone.ts`
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pulseActive } from "../src/shell/command-spine/spine-prompt"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── pulseActive (M3-narrowed gating predicate) ───────────────────────
check("working → active", pulseActive("working"), true)
check("idle → stopped", pulseActive("idle"), false)
check("stop → stopped", pulseActive("stop"), false)

// ─── S9 source contract ───────────────────────────────────────────────
const promptSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-prompt.tsx"),
  "utf8",
)
const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)

check("no 'Persistent pulse' comment", promptSrc.includes("Persistent pulse"), false)
check("no onMount interval", /onMount\(/.test(promptSrc), false)
check("interval gated via createEffect", promptSrc.includes("createEffect"), true)
check("setInterval still drives the cycle", promptSrc.includes("setInterval"), true)
check("interval cleared on deactivate", promptSrc.includes("clearInterval(pulseTimer)"), true)
check("gate reads pulseActive(props.state())", promptSrc.includes("pulseActive(props.state())"), true)
check("shell passes state typed", shellSrc.includes("state={runState}"), true)
check("no state as any", shellSrc.includes("state={runState as any}"), false)

// ─── M3 dead-branch contract ──────────────────────────────────────────
check("no thinking palette branch", promptSrc.includes('props.state() === "thinking"'), false)
check("state prop union narrowed", promptSrc.includes('state: () => "idle" | "working" | "stop"'), true)

if (failures > 0) {
  console.log(`${failures}/${assertions} S9 assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} S9 assertions passed.`)
