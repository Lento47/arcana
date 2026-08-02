/**
 * S6(a) — memo purity fix (audit S6 spine-mapper cache row).
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
import { describe, expect, test } from "bun:test"
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

describe("entries memo body is pure", () => {
  test("memo body exists (structural anchor)", () => {
    expect(memoBody.length).toBeGreaterThan(0)
  })

  test("memo body contains no state.cache write", () => {
    expect(memoBody).not.toContain("state.cache =")
  })

  test("memo body contains no state.previousEntries write", () => {
    expect(memoBody).not.toContain("state.previousEntries =")
  })

  test("memo returns the mapper result untouched", () => {
    expect(memoBody).toContain("return messagesToSpineEntriesCached({")
  })

  test("no leftover local cache aliases", () => {
    expect(memoBody).not.toContain("let cache: SpineEntriesCache")
    expect(memoBody).not.toContain("let previousEntries")
  })
})

describe("LRU write lives in a createEffect keyed on the memo", () => {
  test("effect reads the memo result", () => {
    expect(shellSrc).toContain("const result = entries()")
  })

  test("effect persists the cache write", () => {
    expect(shellSrc).toContain("state.cache = result.cache")
    expect(shellSrc).toContain("state.previousEntries = result.entries")
  })

  test("effect is keyed on the memo result (not untracked)", () => {
    // `createEffect(() => { const result = entries() ... })` — the read
    // establishes the tracking edge so the write runs after each recompute.
    const effectIdx = shellSrc.indexOf("createEffect(() => {\n    const result = entries()")
    expect(effectIdx).toBeGreaterThanOrEqual(0)
  })

  test("visibleEntries derives from the result's entries array", () => {
    expect(shellSrc).toContain("entries().entries")
  })
})
