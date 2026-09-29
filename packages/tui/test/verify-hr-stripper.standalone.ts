// Standalone verification of the fence-aware HR stripper + underscore emphasis.
// Runs with plain `bun run` (bun test segfaults on this Windows env). Mirrors
// spine-prose-hr.test.ts — keep the two files in sync.
import { stripMarkdownEmphasis } from "../src/shell/command-spine/chat-prose"
import {
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
// A real HR is preceded by a blank line — `a\n---\nb` is a setext H2, not an HR.
assert(stripMarkdownHorizontalRules("a\n\n---\n\nb") === "a\n\n\nb", "plain --- stripped")
assert(stripMarkdownHorizontalRules("a\n────\nb") === "a\nb", "box-drawing ─ stripped")
assert(stripMarkdownHorizontalRules("a\n━━━\nb") === "a\nb", "box-drawing ━ stripped")
assert(stripMarkdownHorizontalRules("a\n═══\nb") === "a\nb", "box-drawing ═ stripped")
assert(stripMarkdownHorizontalRules("a\n\n---  \n\nb") === "a\n\n\nb", "trailing whitespace stripped")
assert(stripMarkdownHorizontalRules("a\n--\nb") === "a\n--\nb", "short -- preserved")
assert(stripMarkdownHorizontalRules("Heading\n-------\n\nbody") === "Heading\n-------\n\nbody", "setext H2 underline preserved")
assert(stripMarkdownHorizontalRules("- item\n---\nnext") === "- item\nnext", "rule after list item stripped")

const fenced = "```js\nconst a = 1\n---\nconst b = 2\n```"
assert(stripMarkdownHorizontalRules(fenced) === fenced, "HR inside fence preserved")

const mixed = "top\n\n---\n\n```js\n---\nconst x = 1\n```\nbottom\n\n---"
assert(
  stripMarkdownHorizontalRules(mixed) === "top\n\n\n```js\n---\nconst x = 1\n```\nbottom\n",
  "outside stripped, inside fence preserved",
)

const multi = "```\n---\n```\n---\n```\n---\n```"
assert(stripMarkdownHorizontalRules(multi) === "```\n---\n```\n```\n---\n```", "multiple fences handled")

assert(stripMarkdownHorizontalRules("") === "", "empty input")
assert(stripMarkdownHorizontalRules("```\n---\n```") === "```\n---\n```", "fence-only input")

// --- stripMarkdownEmphasis: underscore emphasis is stripped, not escaped ---
assert(
  stripMarkdownEmphasis("_a_ and `_b_`") === "a and `_b_`",
  "underscore emphasis stripped outside inline code",
)
assert(
  stripMarkdownEmphasis("```\n_a_\n```") === "```\n_a_\n```",
  "underscores preserved inside fence",
)
assert(
  stripMarkdownEmphasis("ma_cross(3,10) and max_open_positions") === "ma_cross(3,10) and max_open_positions",
  "snake_case identifiers never gain escape backslashes",
)

if (failures > 0) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log("\nAll HR-stripper assertions passed.")
