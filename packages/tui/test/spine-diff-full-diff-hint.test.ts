/**
 * S15: the truncated-diff notice in `spine-diff.tsx` advertised `o`, but `o`
 * opens the spine entry *details* dialog (`command-spine-shell.tsx`), a view
 * with no diff/patch rendering — so the hint sent the operator to a screen
 * that cannot show the remaining changes. The full diff is `d`.
 *
 * The contract fails on the old code and on any future rebinding that moves
 * `openFocusedEntryDiff` off `d` without moving the hint.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (rel: string) =>
  readFileSync(join(import.meta.dir, rel), "utf8").replace(/\r\n/g, "\n")

const spineDiff = () => read("../src/shell/command-spine/spine-diff.tsx")
const shell = () => read("../src/shell/command-spine/command-spine-shell.tsx")

describe("S15 — truncated-diff hint names the key that actually opens the diff", () => {
  test("the notice advertises `d`, not `o`", () => {
    const src = spineDiff()
    expect(src).toContain("d · open full diff for remaining changes")
    expect(src).not.toContain("o · open full diff")
  })

  test("`d` is the binding that opens the focused diff", () => {
    const src = shell()
    expect(src).toContain('key: "d", desc: "Open focused spine diff"')
    expect(src).toContain("openFocusedEntryDiff")
    // `o` opens details — the hint must never point there for a diff.
    expect(src).toContain('key: "o", desc: "Open spine entry details"')
  })
})
