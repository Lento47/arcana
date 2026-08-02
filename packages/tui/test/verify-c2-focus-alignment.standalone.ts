/**
 * C2 — focus highlight row-alignment. Standalone mirror of
 * c2-focus-alignment.test.ts (bun:test segfaults on Windows in this env).
 * Source contracts fail on old code; policy behavior pinned via import.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { rowFocusHighlight } from "../src/shell/command-spine/spine-entry"

const entry = () =>
  readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"), "utf8").replace(/\r\n/g, "\n")

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
const eq = (msg: string, got: unknown, want: unknown) => check(got === want, `${msg} (got ${JSON.stringify(got)})`)

console.log("verify-c2-focus-alignment (C2 row-aligned focus):")

console.log("source contracts:")
const src = entry()
check(!src.includes("backgroundColor={props.focused ? theme.backgroundElement : undefined}"), "header-box fill gone")
check(
  !src.includes('border={props.focused && !isChatProse() ? (["left"] as any) : undefined}'),
  "header-box accent border gone",
)
check(src.includes("const rowHighlight = createMemo("), "rowHighlight memo exists")
check(src.includes("backgroundColor={rowHighlight().bg}"), "outer row box consumes bg")
check(src.includes("border={rowHighlight().border}"), "outer row box consumes border")
check(src.includes("borderColor={rowHighlight().borderColor}"), "outer row box consumes borderColor")
check(src.includes("export function rowFocusHighlight("), "pure rowFocusHighlight policy exported")
check(src.includes("rowFocusHighlight(props.focused === true, isChatProse())"), "memo consumes the pure policy")
// The bg sits on the OUTER row box: it must appear after `id={entry().id}`
// (outer box opens there) and before <SpineGutter — so the gutter is INSIDE
// the highlighted block, closing the 2-col left gap.
check(
  src.indexOf("id={entry().id}") < src.indexOf("backgroundColor={rowHighlight().bg}")
    && src.indexOf("backgroundColor={rowHighlight().bg}") < src.indexOf("<SpineGutter"),
  "bg is on the outer row box, before the gutter (gutter inside highlight)",
)

console.log("rowFocusHighlight policy:")
eq("focused + tool/think row → row highlight", rowFocusHighlight(true, false), "row")
eq("focused + chat prose → none (card owns chrome)", rowFocusHighlight(true, true), "none")
eq("unfocused + tool row → none", rowFocusHighlight(false, false), "none")
eq("unfocused + chat prose → none", rowFocusHighlight(false, true), "none")

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
