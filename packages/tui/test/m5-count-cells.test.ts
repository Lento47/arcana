/**
 * M5 — receipt count-cell width fix (audit M5: fixed `width={8}` cells for
 * `+N`/`-N` and a dead `added < 0 && removed < 0` "no data" sentinel).
 *
 * The mapper (spine-mapper.ts:1521-1522) computes counts via
 * `(body.match(...) ?? []).length` — always >= 0 — so the negative sentinel
 * was unreachable-by-construction. The fix sizes each cell from its digit
 * count (sign + digits) instead of a fixed 8 columns, and drops the sentinel.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { countCellWidth } from "../src/shell/command-spine/spine-receipt"

const receiptSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-receipt.tsx"),
  "utf8",
)

describe("countCellWidth (pure cell-width policy)", () => {
  test("sign + digit count: +0 → 2 cols", () => {
    expect(countCellWidth(0)).toBe(2)
  })

  test("single digit → 2 cols", () => {
    expect(countCellWidth(5)).toBe(2)
    expect(countCellWidth(9)).toBe(2)
  })

  test("multi-digit → sign + digits", () => {
    expect(countCellWidth(12)).toBe(3)
    expect(countCellWidth(123)).toBe(4)
    expect(countCellWidth(1000)).toBe(5)
    expect(countCellWidth(100000)).toBe(7)
  })
})

describe("ShowCounts source contract", () => {
  test("no fixed width={8} cells remain", () => {
    expect(receiptSrc).not.toContain("width={8}")
  })

  test("cells size from digit count via minWidth", () => {
    expect(receiptSrc).toContain("minWidth={countCellWidth(props.added)}")
    expect(receiptSrc).toContain("minWidth={countCellWidth(props.removed)}")
  })

  test("dead negative sentinel branch removed", () => {
    expect(receiptSrc).not.toContain("added < 0")
    expect(receiptSrc).not.toContain("removed < 0")
  })

  test("zero-pair · path retained", () => {
    expect(receiptSrc).toContain("added === 0 && props.removed === 0")
  })

  test("signed colors preserved (add/remove tones)", () => {
    expect(receiptSrc).toContain("props.theme.spineDiffAdd")
    expect(receiptSrc).toContain("props.theme.spineDiffRemove")
  })
})
