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
  spineProseWidth(30, "minimal", "chat") === 23,
  "30-col minimal chat -> 23 (scroll 2 + card 5)",
)
assert(
  spineProseWidth(40, "minimal", "chat") === 33,
  "40-col minimal chat -> 33 (no 40-floor)",
)
assert(
  spineProseWidth(10, "minimal", "chat") === 3,
  "10-col minimal chat -> 3 (10 - 7)",
)

// --- Clamp >= 1: a present-but-tiny terminal keeps its real (tiny) budget ---
assert(
  spineProseWidth(1, "minimal", "chat") === 1,
  "1-col minimal chat -> 1",
)
assert(
  spineProseWidth(4, "minimal", "chat") === 1,
  "4-col minimal chat -> 1 (clamp, not a fallback)",
)

// --- Unmeasured width is not a narrow terminal: it takes the 80 default ---
// `useTerminalDimensions` seeds from `renderer.width`, so 0/NaN is the
// first-paint race. Flooring it to 1 painted a wrap-per-character spine.
assert(
  spineProseWidth(0, "wide", "chat") === 73,
  "0-col (unmeasured) -> 73, not 1",
)
assert(
  spineProseWidth(Number.NaN, "wide", "chat") === 73,
  "NaN (unmeasured) -> 73, not 1",
)

// --- Known chrome arithmetic at wide sizes ---
// outerPad is 0 for every layout; the chat card insets padL === padR === 2.
// Chat rows own no entry gutter and the card subtracts its own marker, so the
// contract charges scroll 2 + (border1+padL2+padR2) = 7.
assert(
  spineProseWidth(120, "minimal", "chat") === 113,
  "120-col minimal chat -> 113",
)
// wide think: gutter 2 + (think: rail2+1) + scrollbar2 = 7
assert(
  spineProseWidth(120, "wide", "think") === 113,
  "120-col wide think -> 113",
)
// wide chat: scroll 2 + (border1+padL2+padR2) = 7
assert(
  spineProseWidth(120, "wide", "chat") === 113,
  "120-col wide chat -> 113",
)
// wide inline: gutter 2 + 1 + scrollbar2 = 5
assert(
  spineProseWidth(120, "wide", "inline") === 115,
  "120-col wide inline -> 115",
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
