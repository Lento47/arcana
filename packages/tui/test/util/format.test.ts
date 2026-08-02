import { describe, expect, test } from "bun:test"
import { formatDuration } from "../../src/util/format"
import { duration } from "../../src/util/locale"

describe("util.format", () => {
  describe("formatDuration", () => {
    test("returns empty string for zero or negative values", () => {
      expect(formatDuration(0)).toBe("")
      expect(formatDuration(-1)).toBe("")
      expect(formatDuration(-100)).toBe("")
    })

    test("formats seconds under a minute", () => {
      expect(formatDuration(1)).toBe("1s")
      expect(formatDuration(30)).toBe("30s")
      expect(formatDuration(59)).toBe("59s")
    })

    test("formats minutes under an hour", () => {
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(61)).toBe("1m 1s")
      expect(formatDuration(90)).toBe("1m 30s")
      expect(formatDuration(120)).toBe("2m")
      expect(formatDuration(330)).toBe("5m 30s")
      expect(formatDuration(3599)).toBe("59m 59s")
    })

    test("formats hours under a day", () => {
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(3660)).toBe("1h 1m")
      expect(formatDuration(7200)).toBe("2h")
      expect(formatDuration(8100)).toBe("2h 15m")
      expect(formatDuration(86399)).toBe("23h 59m")
    })

    test("formats days and weeks as exact units (consolidated lexicon)", () => {
      // The "~1 day" / "~1 week" approximations are gone — one exact lexicon.
      expect(formatDuration(86400)).toBe("1d")
      expect(formatDuration(172800)).toBe("2d")
      expect(formatDuration(259200)).toBe("3d")
      expect(formatDuration(604799)).toBe("6d 23h")
      expect(formatDuration(604800)).toBe("7d")
      expect(formatDuration(1209600)).toBe("14d")
      expect(formatDuration(1609200)).toBe("18d 15h")
    })

    test("delegates to Locale.duration — one formatter (M7)", () => {
      expect(formatDuration(5)).toBe(duration(5000))
      expect(formatDuration(90)).toBe(duration(90000))
      expect(formatDuration(3600)).toBe(duration(3600000))
      expect(formatDuration(86400)).toBe(duration(86400000))
      expect(formatDuration(0)).toBe(duration(0))
    })

    test("handles boundary values correctly", () => {
      expect(formatDuration(59)).toBe("59s")
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(3599)).toBe("59m 59s")
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(86399)).toBe("23h 59m")
      expect(formatDuration(86400)).toBe("1d")
      expect(formatDuration(604799)).toBe("6d 23h")
      expect(formatDuration(604800)).toBe("7d")
    })
  })
})
