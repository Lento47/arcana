// Standalone verification of the display-width-aware truncators.
// Runs with plain `bun run` (bun test segfaults on this Windows env). Mirrors
// locale-truncate.test.ts — keep the two files in sync.
import { displayWidth, truncate, truncateLeft, truncateMiddle } from "../src/util/locale"

let failures = 0
const assert = (cond: boolean, msg: string) => {
  if (cond) {
    console.log("ok: " + msg)
  } else {
    failures++
    console.error("FAIL: " + msg)
  }
}
// Matches only LONE surrogates (high not followed by low, or low not preceded by
// high). A plain /[\uD800-\uDFFF]/ matches every surrogate half of valid pairs too.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

// --- displayWidth ---
assert(displayWidth("abc") === 3, "displayWidth ASCII")
assert(displayWidth("日本語") === 6, "displayWidth CJK 2-col")
assert(displayWidth("a😀b") === 4, "displayWidth emoji 2-col")
assert(displayWidth("a\nb") === 2, "displayWidth newline = 0")

// --- truncate ---
assert(truncate("hi", 10) === "hi", "truncate short unchanged")
assert(truncate("hello", 5) === "hello", "truncate exact fit")
assert(truncate("", 50) === "", "truncate empty")
assert(truncate("hello world", 5) === "hell…", "truncate ASCII to budget")
assert(displayWidth(truncate("hello world", 5)) === 5, "truncate width exactly budget")
assert(truncate("日本語テキスト", 6) === "日本…", "truncate CJK by display cols")
assert(displayWidth(truncate("日本語テキスト", 6)) === 5, "truncate CJK width")
const sup = truncate("a😀b", 3)
assert(sup === "a…" && !LONE_SURROGATE.test(sup), "truncate never splits surrogate")
const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}" // 👨‍👩‍👧‍👦 — escapes: raw literals can lose ZWJ bytes on write
const zwj = truncate(`${FAMILY} family`, 4)
assert(zwj === `${FAMILY}…` && !LONE_SURROGATE.test(zwj) && displayWidth(zwj) === 3, "truncate keeps ZWJ emoji whole")
// 4 display cols (é=1, x=1, y=1, z=1) > budget 2 — forces a cut; "e\u0301x" would FIT exactly and return unchanged.
// Expected is escape-constructed too: the runtime result is DECOMPOSED (e + U+0301), so a precomposed "é" literal would not === equal.
const combining = truncate("e\u0301xyz", 2)
assert(combining === "e\u0301…", "truncate never splits combining mark from base")
assert(truncate("alpha beta  \n", 7) === "alpha…", "truncate trims trailing ws before ellipsis")
assert(truncate("abc", 0) === "", "truncate zero budget")
assert(truncate("abc", 1) === "…", "truncate tiny budget")

// --- truncateLeft ---
assert(truncateLeft("hello world", 5) === "…orld", "truncateLeft ASCII")
assert(truncateLeft("日本語テキスト", 6) === "…スト", "truncateLeft CJK by display cols")
assert(displayWidth(truncateLeft("日本語テキスト", 6)) === 5, "truncateLeft CJK width")
assert(truncateLeft("hi", 10) === "hi", "truncateLeft short unchanged")

// --- truncateMiddle ---
assert(truncateMiddle("abcdefghij", 7) === "abc…hij", "truncateMiddle ASCII")
assert(truncateMiddle("日本語テキスト", 6) === "日…ト", "truncateMiddle CJK by display cols")
assert(displayWidth(truncateMiddle("日本語テキスト", 6)) === 5, "truncateMiddle CJK width")
assert(truncateMiddle("x", 1) === "x", "truncateMiddle short unchanged")
const mid = truncateMiddle("a".repeat(100))
assert(displayWidth(mid) === 35 && mid.includes("…"), "truncateMiddle default 35 budget")

if (failures > 0) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log("\nAll locale-truncate assertions passed.")
