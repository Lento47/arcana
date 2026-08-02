// Standalone verification of the fence-aware HR stripper + underscore escape.
// Runs with plain `bun run` (bun test segfaults on this Windows env). Mirrors
// spine-prose-hr.test.ts — keep the two files in sync.
import {
  escapeMarkdownUnderscoreEmphasis,
  stripMarkdownHorizontalRules,
} from "../src/shell/command-spine/spine-prose"

let failures = 0
const assert = (cond: boolean, msg: string) => {
  if (cond) {
    console.log("ok: " + msg)
  } else {
    failures++
    console.error("FAIL: " + msg)
  }
}

// --- stripMarkdownHorizontalRules ---
assert(stripMarkdownHorizontalRules("a\n---\nb") === "a\nb", "plain --- stripped")
assert(stripMarkdownHorizontalRules("a\n────\nb") === "a\nb", "box-drawing ─ stripped")
assert(stripMarkdownHorizontalRules("a\n━━━\nb") === "a\nb", "box-drawing ━ stripped")
assert(stripMarkdownHorizontalRules("a\n═══\nb") === "a\nb", "box-drawing ═ stripped")
assert(stripMarkdownHorizontalRules("a\n---  \nb") === "a\nb", "trailing whitespace stripped")
assert(stripMarkdownHorizontalRules("a\n--\nb") === "a\n--\nb", "short -- preserved")

const fenced = "```js\nconst a = 1\n---\nconst b = 2\n```"
assert(stripMarkdownHorizontalRules(fenced) === fenced, "HR inside fence preserved")

const mixed = "top\n---\n```js\n---\nconst x = 1\n```\nbottom\n---"
assert(
  stripMarkdownHorizontalRules(mixed) === "top\n```js\n---\nconst x = 1\n```\nbottom",
  "outside stripped, inside fence preserved",
)

const multi = "```\n---\n```\n---\n```\n---\n```"
assert(stripMarkdownHorizontalRules(multi) === "```\n---\n```\n```\n---\n```", "multiple fences handled")

assert(stripMarkdownHorizontalRules("") === "", "empty input")
assert(stripMarkdownHorizontalRules("```\n---\n```") === "```\n---\n```", "fence-only input")

// --- escapeMarkdownUnderscoreEmphasis (fence-aware regression) ---
assert(escapeMarkdownUnderscoreEmphasis("_a_ and `_b_`") === "\\_a\\_ and `_b_`", "underscores escaped outside code")
assert(escapeMarkdownUnderscoreEmphasis("```\n_a_\n```") === "```\n_a_\n```", "underscores preserved inside fence")

if (failures > 0) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log("\nAll HR-stripper assertions passed.")
