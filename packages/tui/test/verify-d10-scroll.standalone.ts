/**
 * Standalone assertion runner for the D10 scroll-policy fix.
 * Mirrors test/d10-scroll-policy.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-d10-scroll.standalone.ts`
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { shouldShowScrollButton } from "../src/util/geometry"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── shouldShowScrollButton (pure geometry policy) ────────────────────
check("at bottom → hidden", shouldShowScrollButton(100, 90, 10), false)
check("exactly half away → hidden (5 > 5 is false)", shouldShowScrollButton(100, 85, 10), false)
check("just past half → shown", shouldShowScrollButton(100, 84, 10), true)
check("just under half → hidden", shouldShowScrollButton(100, 86, 10), false)
check("top of tall content → shown", shouldShowScrollButton(500, 0, 10), true)
check("content fits viewport → hidden", shouldShowScrollButton(10, 0, 10), false)
check("zero-height viewport → hidden (no div-by-zero)", shouldShowScrollButton(100, 0, 0), false)
check("negative distance → hidden", shouldShowScrollButton(10, 5, 10), false)
check("odd viewport, far → shown", shouldShowScrollButton(100, 80, 11), true)
check("odd viewport, near → hidden", shouldShowScrollButton(100, 85, 11), false)

// ─── D10 source contract ──────────────────────────────────────────────
const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)
const scrollSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/use-spine-scroll.ts"),
  "utf8",
)
const viewportSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-viewport.tsx"),
  "utf8",
)
const entrySrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"),
  "utf8",
)

check("shell has no scrollPollInterval", shellSrc.includes("scrollPollInterval"), false)
check("shell has no entryNodes map", shellSrc.includes("entryNodes"), false)
check("viewport wires onMouseScroll={props.handleMouseScroll}", viewportSrc.includes("onMouseScroll={props.handleMouseScroll}"), true)
check("scroll hook uses scrollChildIntoView(entryID)", scrollSrc.includes("scrollChildIntoView(entryID)"), true)
check("scroll hook has refreshScrollButton", scrollSrc.includes("refreshScrollButton"), true)
check("entry boxes carry id={entry().id}", entrySrc.includes("id={entry().id}"), true)
check("entry has no nodeRef prop", entrySrc.includes("nodeRef"), false)

if (failures > 0) {
  console.log(`${failures}/${assertions} D10 assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} D10 assertions passed.`)
