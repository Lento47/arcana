import { describe, expect, test } from "bun:test"
import { displayWidth, truncate, truncateLeft, truncateMiddle } from "../src/util/locale"

// Matches only LONE surrogates: a high surrogate not followed by a low one, or a
// low surrogate not preceded by a high one. A plain /[\uD800-\uDFFF]/ matches
// every surrogate half — including valid pairs — so it would flag real emoji.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe("displayWidth", () => {
  test("counts ASCII columns", () => {
    expect(displayWidth("abc")).toBe(3)
  })

  test("counts CJK at 2 columns", () => {
    expect(displayWidth("日本語")).toBe(6)
  })

  test("counts emoji at 2 columns", () => {
    expect(displayWidth("a😀b")).toBe(4)
  })

  test("counts newline as 0 columns", () => {
    expect(displayWidth("a\nb")).toBe(2)
  })
})

describe("truncate", () => {
  test("keeps short strings unchanged (parity)", () => {
    expect(truncate("hi", 10)).toBe("hi")
    expect(truncate("hello", 5)).toBe("hello")
    expect(truncate("", 50)).toBe("")
  })

  test("truncates ASCII to the budget (parity)", () => {
    expect(truncate("hello world", 5)).toBe("hell…")
    expect(displayWidth(truncate("hello world", 5))).toBe(5)
  })

  test("truncates CJK by display columns, not code units", () => {
    const r = truncate("日本語テキスト", 6)
    expect(r).toBe("日本…")
    expect(displayWidth(r)).toBe(5)
  })

  test("never splits a surrogate pair", () => {
    const r = truncate("a😀b", 3)
    expect(r).toBe("a…")
    expect(LONE_SURROGATE.test(r)).toBe(false)
  })

  test("never splits a ZWJ emoji sequence", () => {
    // Constructed via escapes: raw emoji literals can lose the ZWJ (U+200D) bytes on write.
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}" // 👨‍👩‍👧‍👦
    const r = truncate(`${family} family`, 4)
    expect(r).toBe(`${family}…`)
    expect(LONE_SURROGATE.test(r)).toBe(false)
    expect(displayWidth(r)).toBe(3)
  })

  test("never splits a combining mark from its base", () => {
    // "e\u0301x" would FIT exactly (2 cols) and return unchanged — use 4 cols
    // so the cut actually happens mid-string. Expected is escape-constructed too:
    // the result is DECOMPOSED (e + U+0301), so a precomposed "é" literal would not === equal.
    const r = truncate("e\u0301xyz", 2)
    expect(r).toBe("e\u0301…")
    expect(LONE_SURROGATE.test(r)).toBe(false)
  })

  test("trims trailing whitespace/newlines before the ellipsis", () => {
    expect(truncate("alpha beta  \n", 7)).toBe("alpha…")
  })

  test("non-positive budget yields empty string", () => {
    expect(truncate("abc", 0)).toBe("")
    expect(truncate("abc", -1)).toBe("")
  })

  test("tiny budget yields just the ellipsis", () => {
    expect(truncate("abc", 1)).toBe("…")
  })
})

describe("truncateLeft", () => {
  test("truncates ASCII from the left (parity)", () => {
    expect(truncateLeft("hello world", 5)).toBe("…orld")
  })

  test("truncates CJK by display columns from the left", () => {
    const r = truncateLeft("日本語テキスト", 6)
    expect(r).toBe("…スト") // last 2 graphemes (ス·ト = 4 cols) + ellipsis
    expect(displayWidth(r)).toBe(5)
  })

  test("keeps short strings unchanged", () => {
    expect(truncateLeft("hi", 10)).toBe("hi")
  })
})

describe("truncateMiddle", () => {
  test("truncates ASCII with middle ellipsis (parity)", () => {
    expect(truncateMiddle("abcdefghij", 7)).toBe("abc…hij")
  })

  test("truncates CJK by display columns", () => {
    const r = truncateMiddle("日本語テキスト", 6)
    expect(r).toBe("日…ト") // 2+1+2 cols; old code-unit version overflowed to 7 cols
    expect(displayWidth(r)).toBe(5)
  })

  test("keeps short strings unchanged (parity)", () => {
    expect(truncateMiddle("x", 1)).toBe("x")
  })

  test("default budget of 35 applies", () => {
    const long = "a".repeat(100)
    const r = truncateMiddle(long)
    expect(displayWidth(r)).toBe(35)
    expect(r.includes("…")).toBe(true)
  })
})
