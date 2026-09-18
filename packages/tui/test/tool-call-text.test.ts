import { describe, expect, test } from "bun:test"
import { collapseToolCalls } from "../src/util/tool-call-text"

describe("text-protocol tool calls", () => {
  test("plain prose is untouched", () => {
    expect(collapseToolCalls("Just a sentence about tools.")).toBe("Just a sentence about tools.")
    expect(collapseToolCalls("")).toBe("")
  })

  test("an XML call collapses to name and parameters", () => {
    const text =
      'Before\n<tool_call>\n<function=read>\n<parameter=filePath>L:\\PROJECTS\\ts-harness\\src\\cli.ts</parameter>\n<parameter=limit>30</parameter>\n</function>\n</tool_call>\nAfter'
    expect(collapseToolCalls(text)).toBe(
      "Before\n◆ read · filePath L:\\PROJECTS\\ts-harness\\src\\cli.ts · limit 30\nAfter",
    )
  })

  test("a partially streamed call stays readable", () => {
    expect(collapseToolCalls("<tool_call>\n<function=read>\n<parameter=filePath>cli.ts")).toBe("◆ read · …")
  })

  test("two calls in one message collapse independently", () => {
    const text =
      '<tool_call><function=read><parameter=offset>4950</parameter></function></tool_call><tool_call><function=read><parameter=offset>5070</parameter></function></tool_call>'
    expect(collapseToolCalls(text)).toBe("◆ read · offset 4950◆ read · offset 5070")
  })

  test("a JSON envelope collapses with its arguments", () => {
    const text = '<tool_call>{"name":"grep","arguments":{"pattern":"mesh","path":"src"}}</tool_call>'
    expect(collapseToolCalls(text)).toBe("◆ grep · pattern mesh · path src")
  })

  test("an unparseable body keeps the mark and ellipsis", () => {
    expect(collapseToolCalls("<tool_call>not json, not xml</tool_call>")).toBe("◆ call · …")
    expect(collapseToolCalls("<tool_call>{broken json</tool_call>")).toBe("◆ call · …")
  })
})
