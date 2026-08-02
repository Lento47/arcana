import { describe, expect, test } from "bun:test"
import {
  scorecardBadgeWidth,
  scorecardLabelMax,
  packScorecardRows,
} from "../src/shell/command-spine/spine-report"
import type { SpineReportData } from "../src/shell/command-spine/spine-types"

type Item = SpineReportData["scorecard"][0]
const item = (label: string, status: Item["status"] = "pass"): Item => ({ label, status })

describe("spine-report.scorecardBadgeWidth (O2)", () => {
  test("label + space + glyph + 2 padding cells", () => {
    expect(scorecardBadgeWidth("Authz")).toBe(9) // 5 + 1 + 1 + 2
    expect(scorecardBadgeWidth("Secrets")).toBe(11) // 7 + 4
    expect(scorecardBadgeWidth("Type safety")).toBe(15) // 11 + 4
    expect(scorecardBadgeWidth("Resource usage")).toBe(18) // 14 + 4
  })

  test("empty label is just glyph + padding", () => {
    expect(scorecardBadgeWidth("")).toBe(4)
  })
})

describe("spine-report.scorecardLabelMax (O2)", () => {
  test("budget minus glyph/space/padding, floored at 1", () => {
    expect(scorecardLabelMax(30)).toBe(26)
    expect(scorecardLabelMax(10)).toBe(6)
    expect(scorecardLabelMax(4)).toBe(1)
    expect(scorecardLabelMax(1)).toBe(1)
    expect(scorecardLabelMax(0)).toBe(1)
  })
})

describe("spine-report.packScorecardRows (O2)", () => {
  test("empty scorecard produces no rows", () => {
    expect(packScorecardRows([], 40)).toEqual([])
  })

  test("fits in one row when budget allows (incl. exact fit with gaps)", () => {
    // 9 + 1 + 11 = 21 — fits exactly at 21
    expect(packScorecardRows([item("Authz"), item("Secrets")], 21)).toEqual([
      [item("Authz"), item("Secrets")],
    ])
    // 9 + 1 + 9 + 1 + 9 = 29 — fits exactly at 29
    expect(packScorecardRows([item("Authz"), item("Authz"), item("Authz")], 29)).toEqual([
      [item("Authz"), item("Authz"), item("Authz")],
    ])
  })

  test("overflows into a second row", () => {
    // 9 + 1 + 11 = 21 > 20
    expect(packScorecardRows([item("Authz"), item("Secrets")], 20)).toEqual([
      [item("Authz")],
      [item("Secrets")],
    ])
    // 15 + 1 + 18 = 34 > 33
    expect(packScorecardRows([item("Type safety"), item("Resource usage")], 33)).toEqual([
      [item("Type safety")],
      [item("Resource usage")],
    ])
  })

  test("greedy pack — the 6-item report at 30 cols (audit case)", () => {
    const report = [
      item("Type safety"),
      item("Resource usage"),
      item("Cryptography"),
      item("Authz"),
      item("Secrets"),
      item("Supply chain"),
    ]
    expect(packScorecardRows(report, 30)).toEqual([
      [item("Type safety")], // 15
      [item("Resource usage")], // 18 (15+1+18 = 34 > 30)
      [item("Cryptography"), item("Authz")], // 16 + 1 + 9 = 26 ≤ 30
      [item("Secrets"), item("Supply chain")], // 11 + 1 + 16 = 28 ≤ 30
    ])
  })

  test("same 6-item report at 60 cols packs into 2 rows", () => {
    const report = [
      item("Type safety"),
      item("Resource usage"),
      item("Cryptography"),
      item("Authz"),
      item("Secrets"),
      item("Supply chain"),
    ]
    expect(packScorecardRows(report, 60)).toEqual([
      [item("Type safety"), item("Resource usage"), item("Cryptography")], // 51 ≤ 60, +1+9 = 61 > 60
      [item("Authz"), item("Secrets"), item("Supply chain")], // 9+1+11+1+16 = 38 ≤ 60
    ])
  })

  test("a single over-wide badge keeps its own row (render-time truncation clamps it)", () => {
    expect(packScorecardRows([item("Resource usage")], 10)).toEqual([[item("Resource usage")]])
    // and stays at the front of the next row when it fits after a row break
    expect(packScorecardRows([item("Authz"), item("Resource usage")], 15)).toEqual([
      [item("Authz")],
      [item("Resource usage")],
    ])
  })
})
