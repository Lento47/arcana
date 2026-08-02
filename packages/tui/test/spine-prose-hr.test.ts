import { describe, expect, test } from "bun:test"
import {
  escapeMarkdownUnderscoreEmphasis,
  stripMarkdownHorizontalRules,
} from "../src/shell/command-spine/spine-prose"

describe("stripMarkdownHorizontalRules", () => {
  test("strips plain horizontal rule lines", () => {
    expect(stripMarkdownHorizontalRules("a\n---\nb")).toBe("a\nb")
  })

  test("strips box-drawing rule variants", () => {
    expect(stripMarkdownHorizontalRules("a\n────\nb")).toBe("a\nb")
    expect(stripMarkdownHorizontalRules("a\n━━━\nb")).toBe("a\nb")
    expect(stripMarkdownHorizontalRules("a\n═══\nb")).toBe("a\nb")
  })

  test("strips rules with trailing whitespace", () => {
    expect(stripMarkdownHorizontalRules("a\n---  \nb")).toBe("a\nb")
  })

  test("does not strip short dash sequences", () => {
    expect(stripMarkdownHorizontalRules("a\n--\nb")).toBe("a\n--\nb")
  })

  test("preserves horizontal rules inside fenced code blocks", () => {
    const input = "```js\nconst a = 1\n---\nconst b = 2\n```"
    expect(stripMarkdownHorizontalRules(input)).toBe(input)
  })

  test("strips outside fences but preserves inside", () => {
    const input = "top\n---\n```js\n---\nconst x = 1\n```\nbottom\n---"
    expect(stripMarkdownHorizontalRules(input)).toBe("top\n```js\n---\nconst x = 1\n```\nbottom")
  })

  test("handles multiple fences", () => {
    const input = "```\n---\n```\n---\n```\n---\n```"
    expect(stripMarkdownHorizontalRules(input)).toBe("```\n---\n```\n```\n---\n```")
  })

  test("handles empty and fence-only input", () => {
    expect(stripMarkdownHorizontalRules("")).toBe("")
    expect(stripMarkdownHorizontalRules("```\n---\n```")).toBe("```\n---\n```")
  })
})

describe("escapeMarkdownUnderscoreEmphasis (fence-aware regression)", () => {
  test("escapes underscores outside fences and inline code only", () => {
    expect(escapeMarkdownUnderscoreEmphasis("_a_ and `_b_`")).toBe("\\_a\\_ and `_b_`")
    expect(escapeMarkdownUnderscoreEmphasis("```\n_a_\n```")).toBe("```\n_a_\n```")
  })
})
