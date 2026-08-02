/**
 * Standalone assertion runner for the consolidated duration formatter (M6/M7).
 * Mirrors test/util/format.test.ts + test/locale-duration.test.ts one-to-one.
 * Runnable on Windows where `bun test` segfaults: `bun run test/verify-duration.standalone.ts`
 */
import { duration } from "../src/util/locale"
import { formatDuration } from "../src/util/format"

let failures = 0
let assertions = 0
function check(name: string, actual: unknown, expected: unknown) {
  assertions++
  if (actual !== expected) {
    failures++
    console.log(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}
function checkTrue(name: string, cond: boolean) {
  assertions++
  if (!cond) {
    failures++
    console.log(`FAIL ${name}`)
  }
}

// ─── duration: guards ───────────────────────────────────────────────
check("duration(0) === ''", duration(0), "")
check("duration(-1) === ''", duration(-1), "")
check("duration(-86400000) === ''", duration(-86400000), "")
checkTrue("duration(NaN) === ''", duration(Number.NaN) === "")
checkTrue("duration(Infinity) === ''", duration(Number.POSITIVE_INFINITY) === "")

// ─── duration: sub-second ───────────────────────────────────────────
check("duration(1) === '1ms'", duration(1), "1ms")
check("duration(500) === '500ms'", duration(500), "500ms")
check("duration(999) === '999ms'", duration(999), "999ms")

// ─── duration: seconds (no trailing .0) ─────────────────────────────
check("duration(1000) === '1s'", duration(1000), "1s")
check("duration(5000) === '5s'", duration(5000), "5s")
check("duration(12300) === '12.3s'", duration(12300), "12.3s")

// ─── duration: minutes ──────────────────────────────────────────────
check("duration(60000) === '1m'", duration(60000), "1m")
check("duration(61000) === '1m 1s'", duration(61000), "1m 1s")
check("duration(90000) === '1m 30s'", duration(90000), "1m 30s")
check("duration(3599000) === '59m 59s'", duration(3599000), "59m 59s")

// ─── duration: hours ────────────────────────────────────────────────
check("duration(3600000) === '1h'", duration(3600000), "1h")
check("duration(3660000) === '1h 1m'", duration(3660000), "1h 1m")
check("duration(8100000) === '2h 15m'", duration(8100000), "2h 15m")
check("duration(86399000) === '23h 59m'", duration(86399000), "23h 59m")

// ─── duration: days — M6 regression ─────────────────────────────────
check("duration(86400000) === '1d'", duration(86400000), "1d")
check("duration(90000000) === '1d 1h'", duration(90000000), "1d 1h")
check("duration(93600000) === '1d 2h'", duration(93600000), "1d 2h")
check("duration(172800000) === '2d'", duration(172800000), "2d")
check("duration(604800000) === '7d'", duration(604800000), "7d")

// ─── formatDuration: ≤0 ─────────────────────────────────────────────
check("formatDuration(0) === ''", formatDuration(0), "")
check("formatDuration(-1) === ''", formatDuration(-1), "")
check("formatDuration(-100) === ''", formatDuration(-100), "")

// ─── formatDuration: seconds/minutes/hours (parity with old test) ───
check("formatDuration(1) === '1s'", formatDuration(1), "1s")
check("formatDuration(30) === '30s'", formatDuration(30), "30s")
check("formatDuration(59) === '59s'", formatDuration(59), "59s")
check("formatDuration(60) === '1m'", formatDuration(60), "1m")
check("formatDuration(61) === '1m 1s'", formatDuration(61), "1m 1s")
check("formatDuration(90) === '1m 30s'", formatDuration(90), "1m 30s")
check("formatDuration(120) === '2m'", formatDuration(120), "2m")
check("formatDuration(330) === '5m 30s'", formatDuration(330), "5m 30s")
check("formatDuration(3599) === '59m 59s'", formatDuration(3599), "59m 59s")
check("formatDuration(3600) === '1h'", formatDuration(3600), "1h")
check("formatDuration(3660) === '1h 1m'", formatDuration(3660), "1h 1m")
check("formatDuration(7200) === '2h'", formatDuration(7200), "2h")
check("formatDuration(8100) === '2h 15m'", formatDuration(8100), "2h 15m")
check("formatDuration(86399) === '23h 59m'", formatDuration(86399), "23h 59m")

// ─── formatDuration: days/weeks — consolidated exact lexicon ────────
check("formatDuration(86400) === '1d'", formatDuration(86400), "1d")
check("formatDuration(172800) === '2d'", formatDuration(172800), "2d")
check("formatDuration(259200) === '3d'", formatDuration(259200), "3d")
check("formatDuration(604799) === '6d 23h'", formatDuration(604799), "6d 23h")
check("formatDuration(604800) === '7d'", formatDuration(604800), "7d")
check("formatDuration(1209600) === '14d'", formatDuration(1209600), "14d")
check("formatDuration(1609200) === '18d 15h'", formatDuration(1609200), "18d 15h")

// ─── M7: formatDuration delegates to duration (one formatter) ───────
check("formatDuration(5) === duration(5000)", formatDuration(5), duration(5000))
check("formatDuration(90) === duration(90000)", formatDuration(90), duration(90000))
check("formatDuration(3600) === duration(3600000)", formatDuration(3600), duration(3600000))
check("formatDuration(86400) === duration(86400000)", formatDuration(86400), duration(86400000))
check("formatDuration(0) === duration(0)", formatDuration(0), duration(0))

if (failures > 0) {
  console.log(`${failures}/${assertions} duration assertions FAILED`)
  process.exit(1)
}
console.log(`All ${assertions} duration assertions passed.`)
