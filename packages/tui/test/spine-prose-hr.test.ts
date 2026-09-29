import { describe, expect, test } from "bun:test"
import { stripMarkdownEmphasis } from "../src/shell/command-spine/chat-prose"
import {
  stripMarkdownHorizontalRules,
} from "../src/shell/command-spine/spine-prose"

describe("stripMarkdownHorizontalRules", () => {
  test("strips plain horizontal rule lines", () => {
    // A real HR is preceded by a blank line — `a\n---\nb` is a setext H2, not an HR.
    expect(stripMarkdownHorizontalRules("a\n\n---\n\nb")).toBe("a\n\n\nb")
  })

  test("strips box-drawing rule variants", () => {
    expect(stripMarkdownHorizontalRules("a\n────\nb")).toBe("a\nb")
    expect(stripMarkdownHorizontalRules("a\n━━━\nb")).toBe("a\nb")
    expect(stripMarkdownHorizontalRules("a\n═══\nb")).toBe("a\nb")
  })

  test("strips rules with trailing whitespace", () => {
    expect(stripMarkdownHorizontalRules("a\n\n---  \n\nb")).toBe("a\n\n\nb")
  })

  test("does not strip short dash sequences", () => {
    expect(stripMarkdownHorizontalRules("a\n--\nb")).toBe("a\n--\nb")
  })

  test("preserves setext H2 underlines (--- directly under a paragraph)", () => {
    expect(stripMarkdownHorizontalRules("Heading\n-------\n\nbody")).toBe("Heading\n-------\n\nbody")
    expect(stripMarkdownHorizontalRules("a\n---\nb")).toBe("a\n---\nb")
  })

  test("strips rules after block-level lines (not setext)", () => {
    // List item, blockquote, and ATX heading are block boundaries — `---` after
    // them is an HR, not a setext underline.
    expect(stripMarkdownHorizontalRules("- item\n---\nnext")).toBe("- item\nnext")
    expect(stripMarkdownHorizontalRules("> quote\n---\nnext")).toBe("> quote\nnext")
    expect(stripMarkdownHorizontalRules("# Heading\n---\nnext")).toBe("# Heading\nnext")
  })

  test("preserves horizontal rules inside fenced code blocks", () => {
    const input = "```js\nconst a = 1\n---\nconst b = 2\n```"
    expect(stripMarkdownHorizontalRules(input)).toBe(input)
  })

  test("strips outside fences but preserves inside", () => {
    const input = "top\n\n---\n\n```js\n---\nconst x = 1\n```\nbottom\n\n---"
    expect(stripMarkdownHorizontalRules(input)).toBe("top\n\n\n```js\n---\nconst x = 1\n```\nbottom\n")
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

describe("stripMarkdownEmphasis (underscore regression)", () => {
  test("strips underscore emphasis outside fences and inline code only", () => {
    expect(stripMarkdownEmphasis("_a_ and `_b_`")).toBe("a and `_b_`")
    expect(stripMarkdownEmphasis("```\n_a_\n```")).toBe("```\n_a_\n```")
  })

  test("leaves snake_case identifiers intact (no backslash escapes)", () => {
    const text = "- account.open_positions >= max_open_positions while ma_cross(3,10) flips _private fields"
    expect(stripMarkdownEmphasis(text)).toBe(text)
    expect(stripMarkdownEmphasis(text)).not.toContain("\\_")
  })

  test("strips strong underscore emphasis but not numeric separators", () => {
    expect(stripMarkdownEmphasis("__bold__ and 2_000_000")).toBe("bold and 2_000_000")
  })
})
