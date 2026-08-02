/**
 * Standalone assertion runner for the O2 scorecard row-packing helpers.
 * Mirrors test/report-scorecard.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-report-scorecard.standalone.ts`
 */
import {
  scorecardBadgeWidth,
  scorecardLabelMax,
  packScorecardRows,
} from "../src/shell/command-spine/spine-report"
import type { SpineReportData } from "../src/shell/command-spine/spine-types"

type Item = SpineReportData["scorecard"][0]
const item = (label: string, status: Item["status"] = "pass"): Item => ({ label, status })

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ─── scorecardBadgeWidth ────────────────────────────────────────────
check("badgeWidth Authz = 9", scorecardBadgeWidth("Authz"), 9)
check("badgeWidth Secrets = 11", scorecardBadgeWidth("Secrets"), 11)
check("badgeWidth 'Type safety' = 15", scorecardBadgeWidth("Type safety"), 15)
check("badgeWidth 'Resource usage' = 18", scorecardBadgeWidth("Resource usage"), 18)
check("badgeWidth '' = 4", scorecardBadgeWidth(""), 4)

// ─── scorecardLabelMax ──────────────────────────────────────────────
check("labelMax 30 = 26", scorecardLabelMax(30), 26)
check("labelMax 10 = 6", scorecardLabelMax(10), 6)
check("labelMax 4 = 1", scorecardLabelMax(4), 1)
check("labelMax 1 = 1", scorecardLabelMax(1), 1)
check("labelMax 0 = 1", scorecardLabelMax(0), 1)

// ─── packScorecardRows ──────────────────────────────────────────────
check("empty → []", packScorecardRows([], 40), [])
check("fits exactly at 21", packScorecardRows([item("Authz"), item("Secrets")], 21), [
  [item("Authz"), item("Secrets")],
])
check("fits exactly at 29 (3 badges)", packScorecardRows([item("Authz"), item("Authz"), item("Authz")], 29), [
  [item("Authz"), item("Authz"), item("Authz")],
])
check("overflow at 20", packScorecardRows([item("Authz"), item("Secrets")], 20), [
  [item("Authz")],
  [item("Secrets")],
])
check("overflow at 33", packScorecardRows([item("Type safety"), item("Resource usage")], 33), [
  [item("Type safety")],
  [item("Resource usage")],
])
{
  const report = [
    item("Type safety"),
    item("Resource usage"),
    item("Cryptography"),
    item("Authz"),
    item("Secrets"),
    item("Supply chain"),
  ]
  check("6-item report at 30 → 4 rows", packScorecardRows(report, 30), [
    [item("Type safety")],
    [item("Resource usage")],
    [item("Cryptography"), item("Authz")],
    [item("Secrets"), item("Supply chain")],
  ])
  check("6-item report at 60 → 2 rows", packScorecardRows(report, 60), [
    [item("Type safety"), item("Resource usage"), item("Cryptography")],
    [item("Authz"), item("Secrets"), item("Supply chain")],
  ])
}
check("over-wide single badge keeps own row", packScorecardRows([item("Resource usage")], 10), [
  [item("Resource usage")],
])
check("row break then over-wide badge", packScorecardRows([item("Authz"), item("Resource usage")], 15), [
  [item("Authz")],
  [item("Resource usage")],
])

if (failures > 0) {
  console.log(`${failures}/${assertions} report-scorecard assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} report-scorecard assertions passed.`)
