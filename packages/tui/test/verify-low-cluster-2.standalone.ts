/**
 * Low-cluster quick-win pass #2 (audit §10.21): S11, S13, D8, D9, S14.
 * Standalone mirror of low-cluster-2.test.ts (bun:test segfaults on Windows).
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "../../..")
const tui = (p: string) =>
  readFileSync(join(import.meta.dir, "../src", p), "utf8").replace(/\r\n/g, "\n")
const tuiRaw = (p: string) => readFileSync(join(import.meta.dir, "../src", p), "utf8")

const lead = tui("shell/command-spine/spine-lead.tsx")
const listing = tui("shell/command-spine/spine-listing.tsx")
const entry = tui("shell/command-spine/spine-entry.tsx")
const whichKey = tui("feature-plugins/system/which-key.tsx")
let attributes = ""
try {
  attributes = readFileSync(join(repoRoot, ".gitattributes"), "utf8")
} catch {}

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

console.log("verify-low-cluster-2 (S11/S13/D8/D9/S14):")

console.log("S11 — spine-lead dead exports:")
lacks(lead, "SpineLeadColumns", "SpineLeadColumns deleted")
lacks(lead, "spineContentOffset", "spineContentOffset deleted")
lacks(lead, "import type { JSX }", "JSX import removed")
lacks(lead, "import type { RGBA }", "RGBA import removed")
lacks(lead, "SpineKind", "SpineKind import removed")
lacks(lead, "import { SpineRail }", "SpineRail import removed (only SpineLeadColumns used it)")
has(lead, "spineLeadMetrics", "spineLeadMetrics kept")
has(lead, "SpineGutterSpacer", "SpineGutterSpacer kept")
has(lead, "spineGutterWidth", "spineGutterWidth kept")

console.log("S13 — SpineListing dead focused prop:")
lacks(listing, "focused?", "focused prop removed from props type")
lacks(listing, "props.focused", "no props.focused reads")
has(listing, "const nameColor = () => theme.text", "nameColor is the plain theme.text")

console.log("D8 — which-key dead constant + hardcoded left:")
lacks(whichKey, "_MIN_COLUMN_WIDTH", "_MIN_COLUMN_WIDTH deleted")
lacks(whichKey, "const left = 0", "const left = 0 removed")
has(whichKey, "left={0}", "left inlined as 0")

console.log("D9 — grouped burst lone-ellipsis fallback:")
lacks(entry, "fallback={<text>…</text>}", "ellipsis fallback deleted")
has(entry, "<Show when={child != null}>", "null children render nothing")

console.log("S14 — uniform LF via .gitattributes:")
has(attributes, "command-spine/*.ts text eol=lf", ".gitattributes pins ts eol=lf")
has(attributes, "command-spine/*.tsx text eol=lf", ".gitattributes pins tsx eol=lf")
const spineFiles = readdirSync(join(import.meta.dir, "../src/shell/command-spine")).filter((f) =>
  f.endsWith(".ts") || f.endsWith(".tsx"),
)
const crlf = spineFiles.filter((f) =>
  readFileSync(join(import.meta.dir, "../src/shell/command-spine", f), "utf8").includes("\r"),
)
check(crlf.length === 0, `no CR in any spine source file (${spineFiles.length} checked${crlf.length ? `, CR in: ${crlf.join(", ")}` : ""})`)

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
