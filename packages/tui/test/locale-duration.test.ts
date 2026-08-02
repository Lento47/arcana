import { describe, expect, test } from "bun:test"
import { duration } from "../src/util/locale"

describe("util.locale.duration", () => {
  test("returns empty string for zero, negative, or non-finite input", () => {
    expect(duration(0)).toBe("")
    expect(duration(-1)).toBe("")
    expect(duration(-86400000)).toBe("")
    expect(duration(Number.NaN)).toBe("")
    expect(duration(Number.POSITIVE_INFINITY)).toBe("")
  })

  test("formats sub-second durations in ms", () => {
    expect(duration(1)).toBe("1ms")
    expect(duration(500)).toBe("500ms")
    expect(duration(999)).toBe("999ms")
  })

  test("formats seconds without a trailing .0 (consolidated lexicon)", () => {
    expect(duration(1000)).toBe("1s")
    expect(duration(5000)).toBe("5s")
    expect(duration(12300)).toBe("12.3s")
  })

  test("formats minutes, omitting a zero-second tail", () => {
    expect(duration(60000)).toBe("1m")
    expect(duration(61000)).toBe("1m 1s")
    expect(duration(90000)).toBe("1m 30s")
    expect(duration(3599000)).toBe("59m 59s")
  })

  test("formats hours, omitting a zero-minute tail", () => {
    expect(duration(3600000)).toBe("1h")
    expect(duration(3660000)).toBe("1h 1m")
    expect(duration(8100000)).toBe("2h 15m")
    expect(duration(86399000)).toBe("23h 59m")
  })

  test("formats days with correct math (M6 regression)", () => {
    // The old day term was computed from the sub-hour remainder — always 0,
    // so ≥1 day rendered "0d 25h" instead of "1d 1h".
    expect(duration(86400000)).toBe("1d")
    expect(duration(90000000)).toBe("1d 1h")
    expect(duration(93600000)).toBe("1d 2h")
    expect(duration(172800000)).toBe("2d")
    expect(duration(604800000)).toBe("7d")
  })
})
