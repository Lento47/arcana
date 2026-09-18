import { describe, expect, test } from "bun:test"
import {
  looksLikeMarkdown,
  normalizeChatProse,
  stripMarkdownEmphasis,
  stripUnpairedEmphasis,
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

  test("strips underscore emphasis without touching snake_case", () => {
    expect(stripMarkdownEmphasis("_italic_ stays plain")).toBe("italic stays plain")
    expect(stripMarkdownEmphasis("__bold__ stays plain")).toBe("bold stays plain")
    // Identifiers never gain a backslash escape and never lose an underscore.
    expect(stripMarkdownEmphasis("ma_cross(3,10) · open_positions · _private")).toBe(
      "ma_cross(3,10) · open_positions · _private",
    )
    expect(stripMarkdownEmphasis("2_000_000")).toBe("2_000_000")
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

  test("strips a lone trailing opener while streaming (mid-emphasis)", () => {
    expect(stripMarkdownEmphasis("I can help with **Core cap")).toBe("I can help with Core cap")
    expect(stripMarkdownEmphasis("**Core cap")).toBe("Core cap")
    expect(stripMarkdownEmphasis("and **more")).toBe("and more")
    expect(stripMarkdownEmphasis("~~strike")).toBe("strike")
    expect(stripMarkdownEmphasis("***both")).toBe("both")
  })

  test("keeps a lone opener that is arithmetic, not emphasis", () => {
    expect(stripMarkdownEmphasis("3 ** 4")).toBe("3 ** 4")
    expect(stripMarkdownEmphasis("use ** for bold")).toBe("use ** for bold")
  })

  test("does not strip an opener that already has a closer", () => {
    expect(stripMarkdownEmphasis("**Core cap**")).toBe("Core cap")
    expect(stripMarkdownEmphasis("**bold** and **more**")).toBe("bold and more")
  })
})

describe("stripUnpairedEmphasis (markdown sources)", () => {
  test("keeps complete emphasis so the parser can style and conceal it", () => {
    expect(stripUnpairedEmphasis("**bold** stays")).toBe("**bold** stays")
    expect(stripUnpairedEmphasis("*italic* stays")).toBe("*italic* stays")
    expect(stripUnpairedEmphasis("~~gone~~ stays")).toBe("~~gone~~ stays")
    expect(stripUnpairedEmphasis("__bold__ and _italic_ stay")).toBe("__bold__ and _italic_ stay")
    expect(stripUnpairedEmphasis("***both*** stays")).toBe("***both*** stays")
  })

  test("strips only a lone trailing opener (mid-emphasis)", () => {
    expect(stripUnpairedEmphasis("I can help with **Core cap")).toBe("I can help with Core cap")
    expect(stripUnpairedEmphasis("**Core cap")).toBe("Core cap")
    expect(stripUnpairedEmphasis("a **b** and **c")).toBe("a **b** and c")
    expect(stripUnpairedEmphasis("~~strike")).toBe("strike")
    expect(stripUnpairedEmphasis("***both")).toBe("both")
  })

  test("never touches code spans, fences, or arithmetic", () => {
    expect(stripUnpairedEmphasis("use `a ** b` or **bold**")).toBe("use `a ** b` or **bold**")
    const fenced = "before **bold**\n```\nconst x = 1 ** 2\n```\nafter"
    expect(stripUnpairedEmphasis(fenced)).toBe(fenced)
    expect(stripUnpairedEmphasis("3 ** 4")).toBe("3 ** 4")
    expect(stripUnpairedEmphasis("use ** for bold")).toBe("use ** for bold")
  })

  test("empty passthrough", () => {
    expect(stripUnpairedEmphasis("")).toBe("")
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
