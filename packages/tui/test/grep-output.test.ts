import { describe, expect, test } from "bun:test"
import { parseGrepOutput } from "../src/shell/command-spine/mapper/grep-output"

const SAMPLE = [
  "Found 15 matches in 2 files",
  "L:\\proj\\src\\api.ts (13 matches):",
  "  Line 31:   try { return localStorage; } catch { return sessionStorage; }",
  "  Line 45:   } catch { /* ignore */ }",
  "",
  "L:\\proj\\src\\other.ts (2 matches):",
  "  Line 8: foo",
  "",
].join("\n")

describe("parseGrepOutput", () => {
  test("groups match rows under file headers", () => {
    const parsed = parseGrepOutput(SAMPLE)
    expect(parsed?.totalMatches).toBe(15)
    expect(parsed?.files.length).toBe(2)
    expect(parsed?.files[0]?.path).toBe("L:\\proj\\src\\api.ts")
    expect(parsed?.files[0]?.count).toBe(13)
    expect(parsed?.files[0]?.matches).toEqual([
      { line: 31, text: "  try { return localStorage; } catch { return sessionStorage; }" },
      { line: 45, text: "  } catch { /* ignore */ }" },
    ])
    expect(parsed?.files[1]?.matches).toEqual([{ line: 8, text: "foo" }])
  })

  test("blank lines and footers are structural, not content", () => {
    const parsed = parseGrepOutput(`${SAMPLE}(Results truncated at 20 matches. Narrow it.)\n`)
    expect(parsed?.files.length).toBe(2)
    expect(parsed?.files.flatMap((f) => f.matches).length).toBe(3)
  })

  test("singular match header parses", () => {
    const parsed = parseGrepOutput("a.ts (1 match):\n  Line 3: x\n")
    expect(parsed?.files).toEqual([{ path: "a.ts", count: 1, matches: [{ line: 3, text: "x" }] }])
    expect(parsed?.totalMatches).toBe(1)
  })

  test("non-grep text returns undefined", () => {
    expect(parseGrepOutput("No matches found")).toBeUndefined()
    expect(parseGrepOutput("")).toBeUndefined()
    expect(parseGrepOutput("some output\n  Line 3: orphaned row, no header\n")).toBeUndefined()
  })

  test("a header with no rows is not a result", () => {
    expect(parseGrepOutput("a.ts (0 matches):\n")).toBeUndefined()
  })
})
