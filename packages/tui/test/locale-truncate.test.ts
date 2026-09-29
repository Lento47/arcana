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

describe("ANSI escapes", () => {
  // ESC is built, not written literally: control characters do not survive
  // every transport between here and the file.
  const ESC = String.fromCharCode(27)
  const RED = `${ESC}[31mhi${ESC}[0m`
  const GRAY_TEXT = `${ESC}[38;2;30;30;30mhello world${ESC}[0m`

  test("displayWidth ignores SGR color sequences", () => {
    expect(displayWidth(RED)).toBe(2)
    expect(displayWidth(GRAY_TEXT)).toBe(11)
  })

  test("truncate never splits an escape sequence", () => {
    // The reported defect: cutting the truecolor opener mid-sequence leaked a
    // literal tail of it into the row. The opener must survive whole or not at
    // all — startsWith proves it was not split.
    const r = truncate(GRAY_TEXT, 7)
    expect(r.startsWith(`${ESC}[38;2;30;30;30m`)).toBe(true)
    expect(r).toBe(`${ESC}[38;2;30;30;30mhello${ESC}[0m…`)
    expect(displayWidth(r)).toBe(6)
  })

  test("truncate keeps balanced color codes around the cut", () => {
    expect(truncate(RED, 5)).toBe(RED)
    expect(truncate(`${ESC}[31mhello world${ESC}[0m`, 7)).toBe(`${ESC}[31mhello${ESC}[0m…`)
  })

  test("non-SGR control sequences are dropped, not leaked", () => {
    expect(truncate(`ab${ESC}[2Kcd`, 10)).toBe(`ab${ESC}[2Kcd`)
    expect(truncate(`ab${ESC}[2Kcdefgh`, 5)).toBe("abcd…")
    expect(displayWidth(`ab${ESC}[2Kcd`)).toBe(4)
  })

  test("truncateLeft keeps escapes whole from the right", () => {
    const r = truncateLeft(GRAY_TEXT, 7)
    expect(r).toBe(`… world${ESC}[0m`)
  })
})
