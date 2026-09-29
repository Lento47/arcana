import { describe, expect, test } from "bun:test"
import { Token } from "@arcana/core/util/token"
import { estimateTokens, planTokenBudget } from "./token.js"

const SAMPLES = [
  "The quick brown fox jumps over the lazy dog. ".repeat(10),
  "const x = { a: 1 }; function f(y: Array<number>) { return y.map((v) => v * 2) }\n".repeat(10),
  JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ["a", "b"] })) }),
  "这是中文文本，用于验证统一分词估算。".repeat(10),
]

describe("ml canonical token estimator", () => {
  test("matches core Token.estimate exactly on prose, code, JSON, and CJK", () => {
    for (const sample of SAMPLES) {
      expect(estimateTokens(sample)).toBe(Token.estimate(sample))
    }
  })

  test("planTokenBudget estimated input uses the canonical estimator", () => {
    const text = "The quick brown fox jumps over the lazy dog"
    const plan = planTokenBudget({ text, maxContextTokens: 1000, reservedOutputTokens: 100 })

    expect(plan.estimatedInputTokens).toBe(Token.estimate(text))
  })

  test("empty input stays zero", () => {
    expect(estimateTokens("")).toBe(0)
  })
})
