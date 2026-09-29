import { describe, expect, test } from "bun:test"
import { contextCount, contextSum, estimate, Token } from "./token"

describe("Token.estimate", () => {
  test("empty input estimates zero", () => {
    expect(estimate("")).toBe(0)
  })

  test("regular text tracks ~4 chars per token", () => {
    // 40 prose chars, no punctuation → 10 tokens.
    expect(estimate("The quick brown fox jumps over the lazy")).toBe(10)
  })

  test("structural punctuation is denser than prose", () => {
    const text = "{}[]();:|<>"
    expect(estimate(text)).toBe(Math.ceil(text.length / 2))
  })

  test("CJK code points get a 1-token floor instead of chars/4", () => {
    const text = "这是中文文本"
    // Prior chars/4 math would return 2; the floor returns one token per char.
    expect(estimate(text)).toBe(text.length)
    expect(estimate("中".repeat(40))).toBe(40)
  })

  test("emoji floor is at least two tokens per pictograph", () => {
    expect(estimate("🍓")).toBeGreaterThanOrEqual(2)
  })

  test("the script floor can only raise an estimate", () => {
    const mixed = "中文 mixed ascii text 中文"
    expect(estimate(mixed)).toBeGreaterThanOrEqual(estimate("mixed ascii text"))
  })

  test("is re-exported through the Token namespace", () => {
    expect(Token.estimate("hello world")).toBe(estimate("hello world"))
  })
})

describe("Token.contextCount", () => {
  test("uses the provider total when it covers the breakdown", () => {
    expect(
      contextCount({ total: 12000, input: 8000, output: 2000, reasoning: 500, cache: { read: 1000, write: 0 } }),
    ).toBe(12000)
  })

  test("falls back to the component sum when total is missing or non-finite", () => {
    expect(contextCount({ input: 8000, output: 2000, reasoning: 500, cache: { read: 1000, write: 0 } })).toBe(11500)
    expect(contextCount({ total: Number.NaN, input: 1000 })).toBe(1000)
  })

  test("never under-reads a total below the component sum", () => {
    // Broken proxy totals must not hide cached/reasoning context.
    expect(contextCount({ total: 0, input: 10, output: 20, cache: { read: 5, write: 0 } })).toBe(35)
    expect(contextCount({ total: 12, input: 10, output: 20, cache: { read: 5, write: 0 } })).toBe(35)
  })

  test("tolerates absent fields", () => {
    expect(contextCount({})).toBe(0)
    expect(contextCount({ cache: {} })).toBe(0)
    expect(contextSum({})).toBe(0)
  })
})
