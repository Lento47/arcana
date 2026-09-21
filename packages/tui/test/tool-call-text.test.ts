import { describe, expect, test } from "bun:test"
import { collapseToolCalls, sanitizeForDisplay } from "../src/util/tool-call-text"

describe("text-protocol tool calls", () => {
  test("plain prose is untouched", () => {
    expect(collapseToolCalls("Just a sentence about tools.")).toBe("Just a sentence about tools.")
    expect(collapseToolCalls("")).toBe("")
  })

  test("an XML call collapses to name and parameters", () => {
    const text =
      'Before\n<tool_call>\n<function=read>\n<parameter=filePath>L:\\PROJECTS\\ts-harness\\src\\cli.ts</parameter>\n<parameter=limit>30</parameter>\n</function>\n</tool_call>\nAfter'
    expect(collapseToolCalls(text)).toBe("Before\n◆ read · filePath …/src/cli.ts · limit 30\nAfter")
  })

  test("a path-like parameter shortens to parent and basename", () => {
    expect(
      collapseToolCalls("<tool_call><function=read><parameter=filePath>/a/b/c.ts</parameter></function></tool_call>"),
    ).toBe("◆ read · filePath …/b/c.ts")
    // Commands have spaces; shortening them would destroy the command.
    expect(
      collapseToolCalls(
        "<tool_call><function=shell><parameter=command>cat apps/api/src/ai/x.ts</parameter></function></tool_call>",
      ),
    ).toBe("◆ shell · command cat apps/api/src/ai/x.ts")
    // Short values pass through untouched.
    expect(
      collapseToolCalls("<tool_call><function=grep><parameter=path>src</parameter></function></tool_call>"),
    ).toBe("◆ grep · path src")
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

  test("model-plausible tag variants collapse too", () => {
    // Case and spacing vary in model output; the exact-lowercase fast path
    // must not be the only thing caught.
    expect(collapseToolCalls("<Tool_Call><function=read></function></Tool_Call>")).toBe("◆ read · …")
    expect(collapseToolCalls("<tool_call ><function=read></function></tool_call>")).toBe("◆ read · …")
    expect(
      collapseToolCalls("<TOOL_CALL><function=grep><parameter=pattern>mesh</parameter></function></TOOL_CALL>"),
    ).toBe("◆ grep · pattern mesh")
  })

  test("a closer without an opener is stripped, not painted", () => {
    expect(collapseToolCalls("trailing residue </tool_call>")).toBe("trailing residue ")
    expect(collapseToolCalls("a </TOOL_CALL> b")).toBe("a  b")
  })

  test("sanitizeForDisplay removes reminders and collapses calls", () => {
    expect(
      sanitizeForDisplay(
        "before<system-reminder>do NOT execute</system-reminder>\n<tool_call><function=read></function></tool_call>",
      ),
    ).toBe("before◆ read · …")
    expect(sanitizeForDisplay("plain prose")).toBe("plain prose")
    expect(sanitizeForDisplay("")).toBe("")
  })
})
