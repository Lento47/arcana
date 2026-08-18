import { describe, expect, test } from "bun:test"
import {
  looksLikeMarkdown,
  normalizeChatProse,
  stripMarkdownEmphasis,
} from "../src/shell/command-spine/chat-prose"

describe("stripMarkdownEmphasis", () => {
  test("removes bold markers", () => {
    expect(stripMarkdownEmphasis("200,000,000,000 + 20 = **200,000,000,020**.")).toBe(
      "200,000,000,000 + 20 = 200,000,000,020.",
    )
  })

  test("removes bold-italic and strikethrough markers", () => {
    expect(stripMarkdownEmphasis("***both*** and ~~gone~~")).toBe("both and gone")
  })

  test("leaves single asterisks alone (arithmetic)", () => {
    expect(stripMarkdownEmphasis("3 * 4 = 12")).toBe("3 * 4 = 12")
  })

  test("preserves inline code spans", () => {
    expect(stripMarkdownEmphasis("use `a ** b` or **bold**")).toBe("use `a ** b` or bold")
  })

  test("preserves fenced code blocks", () => {
    const input = "before **bold**\n```\nconst x = 1 ** 2\n```\nafter **bold**"
    const out = stripMarkdownEmphasis(input)
    expect(out).toContain("before bold")
    expect(out).toContain("const x = 1 ** 2")
    expect(out).toContain("after bold")
  })

  test("is a no-op on empty and plain text", () => {
    expect(stripMarkdownEmphasis("")).toBe("")
    expect(stripMarkdownEmphasis("plain text")).toBe("plain text")
  })
})

describe("normalizeChatProse", () => {
  test("joins soft-wrapped plain prose into one paragraph", () => {
    const input = "What\n would you like\n to work on?"
    expect(normalizeChatProse(input)).toBe("What would you like to work on?")
  })

  test("keeps paragraph breaks (blank lines)", () => {
    const input = "Hello there!\n\nHow can I help?"
    expect(normalizeChatProse(input)).toBe("Hello there!\n\nHow can I help?")
  })

  test("keeps list markers and joins soft wraps under list items", () => {
    const input = [
      "I can help with:",
      "- Code exploration",
      " and understanding",
      "- Writing",
      " or",
      " editing code",
      "- Testing and",
      " debugging",
    ].join("\n")

    const out = normalizeChatProse(input)
    expect(out).toContain("- Code exploration and understanding")
    expect(out).toContain("- Writing or editing code")
    expect(out).toContain("- Testing and debugging")
    expect(out.startsWith("I can help with:")).toBe(true)
  })

  test("preserves fenced code blocks exactly", () => {
    const input = "Before\n```ts\nconst x =\n  1\n```\nAfter\n line"
    const out = normalizeChatProse(input)
    expect(out).toContain("```ts\nconst x =\n  1\n```")
    expect(out).toContain("After line")
  })

  test("preserves headings and blockquotes", () => {
    const input = "## Title\n\n> quoted\n still quote\n\nbody\n next"
    const out = normalizeChatProse(input)
    expect(out).toContain("## Title")
    expect(out).toContain("> quoted still quote")
    expect(out).toContain("body next")
  })

  test("honors markdown hard breaks (two trailing spaces)", () => {
    const input = "line one  \nline two"
    expect(normalizeChatProse(input)).toBe("line one  \nline two")
  })

  test("empty and single-line passthrough", () => {
    expect(normalizeChatProse("")).toBe("")
    expect(normalizeChatProse("hi")).toBe("hi")
  })
})

describe("looksLikeMarkdown", () => {
  test("detects lists and fences", () => {
    expect(looksLikeMarkdown("- a\n- b")).toBe(true)
    expect(looksLikeMarkdown("```js\n1\n```")).toBe(true)
    expect(looksLikeMarkdown("plain hi")).toBe(false)
  })
})
