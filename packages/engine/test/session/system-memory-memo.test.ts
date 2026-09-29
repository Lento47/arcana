import { describe, expect, test } from "bun:test"
import { MEMORY_REFRESH_MIN_CALLS, keywordOverlap, shouldReuseMemoryBlock } from "../../src/session/system"

describe("memory memo topic gate (prefix-cache stability)", () => {
  test("normal follow-ups keep the memoized block", () => {
    expect(keywordOverlap(new Set(["deploy", "production", "docker"]), ["deploy", "production"])).toBe(1)
    expect(keywordOverlap(new Set(["deploy", "production", "docker"]), ["deploy", "docker", "rollback"])).toBeCloseTo(
      2 / 3,
    )
  })

  test("a topic shift scores below the reuse gate", () => {
    expect(keywordOverlap(new Set(["deploy", "production"]), ["render", "shader", "webgl"])).toBe(0)
    expect(
      keywordOverlap(new Set(["deploy", "production", "docker"]), ["deploy", "render", "shader"]),
    ).toBeLessThan(0.34)
  })

  test("empty keyword sets are treated as the same topic", () => {
    expect(keywordOverlap(new Set(), ["anything"])).toBe(1)
    expect(keywordOverlap(new Set(["deploy"]), [])).toBe(1)
  })

  test("same topic reuses while the source epoch holds", () => {
    expect(
      shouldReuseMemoryBlock(
        { keywords: new Set(["deploy"]), epoch: "a", calls: 5, refreshedAt: 1 },
        { keywords: ["deploy", "rollback"], epoch: "a" },
      ),
    ).toBe(true)
  })

  test("a topic shift is held back until the refresh floor", () => {
    const memo = { keywords: new Set(["deploy"]), epoch: "a", calls: 4, refreshedAt: 1 }
    // calls - refreshedAt = 3 < 20 → reuse despite the topic shift.
    expect(shouldReuseMemoryBlock(memo, { keywords: ["shader"], epoch: "a" })).toBe(true)
    // 21 calls later the topic shift may refresh.
    expect(
      shouldReuseMemoryBlock({ ...memo, calls: 1 + MEMORY_REFRESH_MIN_CALLS }, { keywords: ["shader"], epoch: "a" }),
    ).toBe(false)
  })

  test("a source change (new knowledge) refreshes immediately", () => {
    expect(
      shouldReuseMemoryBlock(
        { keywords: new Set(["deploy"]), epoch: "a", calls: 2, refreshedAt: 1 },
        { keywords: ["deploy"], epoch: "b" },
      ),
    ).toBe(false)
  })
})
