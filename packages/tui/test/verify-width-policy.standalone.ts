// Standalone verification of the corrected width policy. Runs with plain `bun run`
// (bun test segfaults on this Windows env). Asserts the same contract as
// spine-prose-width.test.ts without depending on the test harness.
// NOTE: this mirrors spine-prose-width.test.ts — keep the two files in sync.
import {
  getSpineLayout,
  spineProseWidth,
} from "../src/shell/command-spine/spine-types"

let failures = 0
const assert = (cond: boolean, msg: string) => {
  if (cond) {
    console.log("ok: " + msg)
  } else {
    failures++
    console.error("FAIL: " + msg)
  }
}

// --- No 80-fallback: narrow terminals derive real (small) widths ---
assert(
  spineProseWidth(30, "minimal", "chat") === 22,
  "30-col minimal chat -> 22 (was 72 via 80-fallback)",
)
assert(
  spineProseWidth(40, "minimal", "chat") === 32,
  "40-col minimal chat -> 32 (no 40-floor)",
)
assert(
  spineProseWidth(10, "minimal", "chat") === 2,
  "10-col minimal chat -> 2",
)

// --- Clamp >= 1, no negatives/NaN ---
assert(
  spineProseWidth(0, "wide", "chat") === 1,
  "0-col wide chat -> 1 (clamp)",
)
assert(
  spineProseWidth(1, "minimal", "chat") === 1,
  "1-col minimal chat -> 1",
)
assert(
  spineProseWidth(Number.NaN, "wide", "chat") === 1,
  "NaN -> 1",
)

// --- Known chrome arithmetic at wide sizes ---
// minimal: outerPad 0 + gutter 2 + (chat: border1+padL2+padR1) + scrollbar2 = 8
assert(
  spineProseWidth(120, "minimal", "chat") === 112,
  "120-col minimal chat -> 112",
)
// wide: outerPad 1 + gutter 2 + (think: rail2+1) + scrollbar2 = 8
assert(
  spineProseWidth(120, "wide", "think") === 112,
  "120-col wide think -> 112",
)
// wide chat: outerPad 1 + gutter 2 + (border1+padL2+padR1) + scrollbar2 = 9
assert(
  spineProseWidth(120, "wide", "chat") === 111,
  "120-col wide chat -> 111",
)

// --- Layout mapping ---
assert(getSpineLayout(120) === "wide", "120 -> wide")
assert(getSpineLayout(100) === "compact", "100 -> compact")
assert(getSpineLayout(90) === "narrow", "90 -> narrow")
assert(getSpineLayout(50) === "minimal", "50 -> minimal")

if (failures > 0) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log("\nAll width-policy assertions passed.")
