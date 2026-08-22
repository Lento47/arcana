/**
 * T9 — code-unit-cut sweep (audit T9 row, 90%).
 *
 * Nine display surfaces cut by UTF-16 code units (.slice(0, n)) instead of
 * display columns — CJK/emoji inputs split mid-grapheme or render at 2× the
 * budgeted columns. The fix routes every site through the proven §10.4
 * helpers (Locale.truncate / truncateLeft / truncateMiddle — grapheme +
 * Bun.stringWidth aware) and consolidates the ellipsis on the "…" glyph.
 *
 * Sites (from the audit row):
 *   1. statusbar.tsx:40,42   compactModelName
 *   2. approval-spine-adapter.ts:116  short()
 *   (site 3 — production-spine-input message summary — retired: the MESSAGE
 *   input branch was dead code and was removed; see commit
 *   "refactor: remove dead spine exports")
 *   4. util/session.ts:25    titleFromUserText
 *   5. spine-mapper.ts:184,210-218    heading / concern title / detail
 *   6. prompt/index.tsx:266,1399,2110 model id / toast / retry error
 *   7. engine cockpit.shell-text.ts:9 fit()
 *   8. engine footer.plan.tsx:140     plan title
 *   9. engine stream.ts:65    tool-result preview
 *  10. engine session/session.ts:79  titleFromUserText (sibling of site 4)
 *  11. engine cli/cmd/history.ts     message content + list title
 *  12. engine session/prompt.ts:306  LLM title-polish fallback
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const tui = (p: string) =>
  readFileSync(join(import.meta.dir, "../src", p), "utf8").replace(/\r\n/g, "\n")
const engine = (p: string) =>
  readFileSync(join(import.meta.dir, "../../engine/src", p), "utf8").replace(/\r\n/g, "\n")

const statusbar = tui("feature-plugins/system/statusbar.tsx")
const approvalAdapter = tui("shell/command-spine/approval-spine-adapter.ts")
const slashGoal = tui("component/prompt/slash-goal.ts")
const sessionUtil = tui("util/session.ts")
const mapper = tui("shell/command-spine/spine-mapper.ts")
const prompt = tui("component/prompt/index.tsx")
const shellText = engine("cli/cmd/run/cockpit.shell-text.ts")
const plan = engine("cli/cmd/run/footer.plan.tsx")
const stream = engine("cli/cmd/run/stream.ts")
const engineSession = engine("session/session.ts")
const history = engine("cli/cmd/history.ts")
const sessionPrompt = engine("session/prompt.ts")

describe("site 1 — statusbar compactModelName", () => {
  test("no code-unit cuts remain", () => {
    expect(statusbar).not.toContain("value.slice(0, prefixMax)")
    expect(statusbar).not.toContain("value.slice(0, 47)")
    expect(statusbar).not.toContain(' + "..." + suffix')
  })
  test("routes through Locale.truncate + displayWidth guard", () => {
    expect(statusbar).toContain("Locale.displayWidth(value)")
    expect(statusbar).toContain("Locale.truncate(value, 50)")
  })
})

describe("site 2 — approval-spine-adapter short()", () => {
  test("no code-unit cut in short()", () => {
    expect(approvalAdapter).not.toContain("s.slice(0, n)")
    expect(approvalAdapter).not.toContain('s.length > n')
  })
  test("routes through Locale.truncate", () => {
    expect(approvalAdapter).toContain("Locale.truncate(s, n + 1)")
    expect(approvalAdapter).toMatch(/import \{[^}]*Locale[^}]*\} from "\.\.\/\.\.\/util\/locale"/)
  })
})

// Site 3 (production-spine-input message summary) was retired when the dead
// MESSAGE input branch was removed from production-spine-input.ts. The T9
// invariant there has no remaining subject; sites 1/2/4+ still guard theirs.

describe("site 4 — util/session titleFromUserText", () => {
  test("no code-unit cut", () => {
    expect(sessionUtil).not.toContain("cleaned.slice(0, Math.max(1, maxChars - 3))")
    expect(sessionUtil).not.toContain('+ "..."')
  })
  test("routes through Locale.truncate", () => {
    expect(sessionUtil).toContain("Locale.truncate(cleaned, maxChars)")
    expect(sessionUtil).toMatch(/import \{[^}]*Locale[^}]*\} from "\.\/locale"/)
  })
})

describe("site 5 — spine-mapper heading / concern title / detail", () => {
  test("no code-unit cuts remain", () => {
    expect(mapper).not.toContain(".trim().slice(0, 80)")
    expect(mapper).not.toContain(".trim().slice(0, 120)")
    expect(mapper).not.toContain(".trim().slice(0, 300)")
  })
  test("routes through the already-imported truncate helper", () => {
    expect(mapper).toContain("truncate(heading, 80)")
    expect(mapper).toContain("truncate(headMatch[2].trim(), 120)")
    expect(mapper).toContain("truncate(block.slice(headMatch[0].length).trim(), 300)")
    expect(mapper).toContain('import { truncate } from "../../util/locale"')
  })
})

describe("site 6 — prompt/index model id + toast + retry error", () => {
  test("no code-unit cuts remain", () => {
    expect(prompt).not.toContain("id.slice(0, 33)")
    expect(prompt).not.toContain("args.slice(0, 117)")
    expect(prompt).not.toContain("r.message.slice(0, 80)")
  })
  test("routes through Locale.truncate", () => {
    // /goal's "Locale.truncate(args, 120)" moved to slash-goal.ts with the
    // handler extraction; the remaining three sites stay in prompt/index.
    expect(prompt).toContain("Locale.truncate(id, 36)")
    expect(prompt).toContain("Locale.truncate(r.message, 80)")
    expect(slashGoal).toContain("Locale.truncate(args, 120)")
    expect(slashGoal).toMatch(/import \{[^}]*Locale[^}]*\} from "\.\.\/\.\.\/util\/locale"/)
  })
})

describe("site 7 — engine cockpit.shell-text fit()", () => {
  test("no code-unit cut in fit()", () => {
    expect(shellText).not.toContain("text.slice(0, width - 1)")
    expect(shellText).not.toContain("text.length <= width")
  })
  test("routes through Locale.truncate with width guard", () => {
    expect(shellText).toContain("Bun.stringWidth(text) <= width")
    expect(shellText).toContain("Locale.truncate(text, width)")
    expect(shellText).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})

describe("site 8 — engine footer.plan plan title", () => {
  test("no code-unit cut", () => {
    expect(plan).not.toContain("title.slice(0, maxLen - 1)")
  })
  test("routes through Locale.truncate", () => {
    expect(plan).toContain("Locale.truncate(title, maxLen)")
    expect(plan).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})

describe("site 9 — engine stream tool-result preview", () => {
  test("no code-unit cut", () => {
    expect(stream).not.toContain("value.slice(0, 160)")
  })
  test("routes through Locale.truncate", () => {
    expect(stream).toContain("Locale.truncate(value, 160)")
    expect(stream).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})

describe("site 10 — engine session titleFromUserText (sibling of site 4)", () => {
  test("no code-unit cut", () => {
    expect(engineSession).not.toContain("cleaned.slice(0, Math.max(1, maxChars - 3))")
    expect(engineSession).not.toContain('+ "..."')
  })
  test("routes through Locale.truncate with width guard", () => {
    expect(engineSession).toContain("Locale.displayWidth(cleaned) <= maxChars")
    expect(engineSession).toContain("Locale.truncate(cleaned, maxChars)")
    expect(engineSession).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})

describe("site 11 — engine history CLI message + list title", () => {
  test("no code-unit cuts remain", () => {
    expect(history).not.toContain("m.content.slice(0, 120)")
    expect(history).not.toContain('(s.title ?? "(untitled)").slice(0, 40)')
  })
  test("routes through Locale.truncate", () => {
    expect(history).toContain("Locale.truncate(m.content, 120)")
    expect(history).toContain('Locale.truncate(s.title ?? "(untitled)", 40)')
    expect(history).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})

describe("site 12 — engine session/prompt LLM title-polish fallback", () => {
  test("no code-unit cut", () => {
    expect(sessionPrompt).not.toContain("cleaned.substring(0, Session.TITLE_MAX_CHARS - 3)")
    expect(sessionPrompt).not.toContain('+ "..."')
  })
  test("routes through Locale.truncate", () => {
    expect(sessionPrompt).toContain("Locale.truncate(cleaned, Session.TITLE_MAX_CHARS)")
    expect(sessionPrompt).toMatch(/import \* as Locale from "@\/util\/locale"/)
  })
})
