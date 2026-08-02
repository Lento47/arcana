/**
 * S6(a) — memo purity fix (audit S6 spine-mapper cache row).
 * Standalone mirror of s6-memo-purity.test.ts (bun:test suite crashes on
 * Windows Bun, so each contract is duplicated here with plain asserts).
 *
 * The `entries` createMemo in command-spine-shell.tsx called
 * `messagesToSpineEntriesCached` and then MUTATED `state.cache` /
 * `state.previousEntries` inside the memo body. Solid requires memos to be
 * pure — side effects in a memo can re-trigger dependencies and loop
 * (create-memo.mdx: "This function should be pure (it should not modify
 * other reactive values)"). The fix: the memo returns the mapper result
 * `{ entries, cache }` untouched, and a createEffect keyed on the memo
 * result persists the LRU/cache write.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Normalize CRLF → LF: the file is CRLF on Windows and the multi-line effect
// anchor below is a literal \n string.
const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
).replace(/\r\n/g, "\n")

// The memo body = the block between `const entries = createMemo(() => {`
// and the closing `\n  })` (lazy match — the mapper call is inside).
const memoMatch = shellSrc.match(/const entries = createMemo\(\(\) => \{([\s\S]*?)\n  \}\)/)
const memoBody = memoMatch?.[1] ?? ""

let failures = 0
let checks = 0
const check = (cond: boolean, msg: string) => {
  checks++
  if (cond) {
    console.log(`  ok — ${msg}`)
  } else {
    failures++
    console.error(`  FAIL — ${msg}`)
  }
}

console.log("verify-s6-memo-purity:")

console.log("entries memo body is pure:")
check(memoBody.length > 0, "memo body exists (structural anchor)")
check(!memoBody.includes("state.cache ="), "memo body contains no state.cache write")
check(!memoBody.includes("state.previousEntries ="), "memo body contains no state.previousEntries write")
check(memoBody.includes("return messagesToSpineEntriesCached({"), "memo returns the mapper result untouched")
check(!memoBody.includes("let cache: SpineEntriesCache"), "no leftover cache alias in memo")
check(!memoBody.includes("let previousEntries"), "no leftover previousEntries alias in memo")

console.log("LRU write lives in a createEffect keyed on the memo:")
check(shellSrc.includes("const result = entries()"), "effect reads the memo result")
check(shellSrc.includes("state.cache = result.cache"), "effect persists the cache write")
check(shellSrc.includes("state.previousEntries = result.entries"), "effect persists the previousEntries write")
check(
  shellSrc.indexOf("createEffect(() => {\n    const result = entries()") >= 0,
  "effect is keyed on the memo result (tracking read at effect top)",
)
check(shellSrc.includes("entries().entries"), "visibleEntries derives from the result's entries array")

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
