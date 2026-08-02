/**
 * T9 — code-unit-cut sweep (audit T9 row, 90%). Standalone mirror of
 * t9-cuc-sweep.test.ts (bun:test segfaults on Windows in this env).
 *
 * Twelve display surfaces cut by UTF-16 code units (.slice(0, n)) instead of
 * display columns. Fix routes every site through the proven §10.4 helpers
 * (Locale.truncate / truncateLeft / truncateMiddle) and consolidates the
 * ellipsis on the "…" glyph.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const tui = (p: string) =>
  readFileSync(join(import.meta.dir, "../src", p), "utf8").replace(/\r\n/g, "\n")
const engine = (p: string) =>
  readFileSync(join(import.meta.dir, "../../engine/src", p), "utf8").replace(/\r\n/g, "\n")

const statusbar = tui("feature-plugins/system/statusbar.tsx")
const approvalAdapter = tui("shell/command-spine/approval-spine-adapter.ts")
const prodInput = tui("shell/command-spine/production-spine-input.ts")
const sessionUtil = tui("util/session.ts")
const mapper = tui("shell/command-spine/spine-mapper.ts")
const prompt = tui("component/prompt/index.tsx")
const shellText = engine("cli/cmd/run/cockpit.shell-text.ts")
const plan = engine("cli/cmd/run/footer.plan.tsx")
const stream = engine("cli/cmd/run/stream.ts")
const engineSession = engine("session/session.ts")
const history = engine("cli/cmd/history.ts")
const sessionPrompt = engine("session/prompt.ts")

let failures = 0
let checks = 0
const check = (cond: boolean, msg: string) => {
  checks++
  if (cond) console.log(`  ok — ${msg}`)
  else {
    failures++
    console.error(`  FAIL — ${msg}`)
  }
}
const has = (src: string, needle: string, msg: string) => check(src.includes(needle), msg)
const lacks = (src: string, needle: string, msg: string) => check(!src.includes(needle), msg)

console.log("verify-cuc-sweep (T9, 9 sites):")

console.log("site 1 — statusbar compactModelName:")
lacks(statusbar, "value.slice(0, prefixMax)", "no prefixMax code-unit cut")
lacks(statusbar, "value.slice(0, 47)", "no 47-unit cut")
lacks(statusbar, ' + "..." + suffix', "ellipsis not 3-dot")
has(statusbar, "Locale.displayWidth(value)", "width guard via displayWidth")
has(statusbar, "Locale.truncate(value, 50)", "routes through Locale.truncate")

console.log("site 2 — approval-spine-adapter short():")
lacks(approvalAdapter, "s.slice(0, n)", "no short() code-unit cut")
has(approvalAdapter, "Locale.truncate(s, n + 1)", "short() uses Locale.truncate")
has(approvalAdapter, 'from "../../util/locale"', "Locale imported")

console.log("site 3 — production-spine-input message summary:")
lacks(prodInput, "view.content.slice(0, 120)", "no 120-unit cut")
lacks(prodInput, "needsEllipsis", "dead needsEllipsis deleted")
has(prodInput, "Locale.truncate(view.content, 120)", "summary uses Locale.truncate")
has(prodInput, 'from "../../util/locale"', "Locale imported")

console.log("site 4 — util/session titleFromUserText:")
lacks(sessionUtil, "cleaned.slice(0, Math.max(1, maxChars - 3))", "no maxChars-3 cut")
lacks(sessionUtil, '+ "..."', "ellipsis not 3-dot")
has(sessionUtil, "Locale.truncate(cleaned, maxChars)", "title uses Locale.truncate")
has(sessionUtil, 'from "./locale"', "Locale imported (same dir)")

console.log("site 5 — spine-mapper heading / concern title / detail:")
lacks(mapper, ".trim().slice(0, 80)", "no 80-unit heading cut")
lacks(mapper, ".trim().slice(0, 120)", "no 120-unit title cut")
lacks(mapper, ".trim().slice(0, 300)", "no 300-unit detail cut")
has(mapper, "truncate(heading, 80)", "heading uses truncate")
has(mapper, "truncate(headMatch[2].trim(), 120)", "concern title uses truncate")
has(mapper, "truncate(block.slice(headMatch[0].length).trim(), 300)", "detail uses truncate")

console.log("site 6 — prompt/index model id + toast + retry error:")
lacks(prompt, "id.slice(0, 33)", "no 33-unit model id cut")
lacks(prompt, "args.slice(0, 117)", "no 117-unit toast cut")
lacks(prompt, "r.message.slice(0, 80)", "no 80-unit error cut")
has(prompt, "Locale.truncate(id, 36)", "model id uses Locale.truncate")
has(prompt, "Locale.truncate(args, 120)", "toast uses Locale.truncate")
has(prompt, "Locale.truncate(r.message, 80)", "retry error uses Locale.truncate")

console.log("site 7 — engine cockpit.shell-text fit():")
lacks(shellText, "text.slice(0, width - 1)", "no width-1 cut")
lacks(shellText, "text.length <= width", "guard not code-unit length")
has(shellText, "Bun.stringWidth(text) <= width", "width guard via Bun.stringWidth")
has(shellText, "Locale.truncate(text, width)", "fit uses Locale.truncate")
has(shellText, 'from "@/util/locale"', "Locale imported (engine)")

console.log("site 8 — engine footer.plan plan title:")
lacks(plan, "title.slice(0, maxLen - 1)", "no maxLen-1 cut")
has(plan, "Locale.truncate(title, maxLen)", "plan title uses Locale.truncate")
has(plan, 'from "@/util/locale"', "Locale imported (engine)")

console.log("site 9 — engine stream tool-result preview:")
lacks(stream, "value.slice(0, 160)", "no 160-unit cut")
has(stream, "Locale.truncate(value, 160)", "preview uses Locale.truncate")
has(stream, 'from "@/util/locale"', "Locale imported (engine)")

console.log("site 10 — engine session titleFromUserText (sibling of site 4):")
lacks(engineSession, "cleaned.slice(0, Math.max(1, maxChars - 3))", "no maxChars-3 cut")
lacks(engineSession, '+ "..."', "ellipsis not 3-dot")
has(engineSession, "Locale.displayWidth(cleaned) <= maxChars", "width guard via displayWidth")
has(engineSession, "Locale.truncate(cleaned, maxChars)", "title uses Locale.truncate")
has(engineSession, 'from "@/util/locale"', "Locale imported (engine)")

console.log("site 11 — engine history CLI message + list title:")
lacks(history, "m.content.slice(0, 120)", "no 120-unit message cut")
lacks(history, '(s.title ?? "(untitled)").slice(0, 40)', "no 40-unit title cut")
has(history, "Locale.truncate(m.content, 120)", "message uses Locale.truncate")
has(history, 'Locale.truncate(s.title ?? "(untitled)", 40)', "list title uses Locale.truncate")
has(history, 'from "@/util/locale"', "Locale imported (engine)")

console.log("site 12 — engine session/prompt LLM title-polish fallback:")
lacks(sessionPrompt, "cleaned.substring(0, Session.TITLE_MAX_CHARS - 3)", "no maxChars-3 substring cut")
lacks(sessionPrompt, '+ "..."', "ellipsis not 3-dot")
has(sessionPrompt, "Locale.truncate(cleaned, Session.TITLE_MAX_CHARS)", "title uses Locale.truncate")
has(sessionPrompt, 'from "@/util/locale"', "Locale imported (engine)")

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
