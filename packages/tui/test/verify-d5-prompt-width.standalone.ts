/**
 * D5 — prompt violates the spine width contract. Standalone mirror of
 * d5-prompt-width.test.ts (bun:test segfaults on Windows in this env).
 * Source contracts fail on old code; behavior pinned via the imported helper.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { promptMaxHeight } from "../src/util/geometry"

const read = (rel: string) => readFileSync(join(import.meta.dir, rel), "utf8").replace(/\r\n/g, "\n")

const prompt = () => read("../src/component/prompt/index.tsx")
const geometry = () => read("../src/util/geometry.ts")

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
const eq = (msg: string, got: unknown, want: unknown) =>
  check(got === want, `${msg} (got ${got})`)

console.log("verify-d5-prompt-width (D5 prompt width contract):")

console.log("source contracts:")
const p = prompt()
check(!p.includes("moveLabelWidth"), "dead moveLabelWidth memo deleted")
check(!p.includes("dimensions().width - 48"), "no inline move-label width math")
check(!p.includes("Math.floor(dimensions().height / 3)"), "no raw dimensions height math in component")
check(p.includes("promptMaxHeight(dimensions().height)"), "maxHeight consumes promptMaxHeight")
const g = geometry()
check(g.includes("export function promptMaxHeight("), "geometry.ts exports promptMaxHeight")
check(
  g.includes("Number.isFinite(termHeight)") && g.includes("Math.floor(term / 3)") && g.includes("Math.max(6,"),
  "centralized clamp guards NaN and matches old semantics",
)

console.log("promptMaxHeight behavior:")
eq("30 rows → 10", promptMaxHeight(30), 10)
eq("21 rows → 7", promptMaxHeight(21), 7)
eq("20 rows → 6 (floor, not below min)", promptMaxHeight(20), 6)
eq("9 rows → 6 (floored at min)", promptMaxHeight(9), 6)
eq("0 rows → 6", promptMaxHeight(0), 6)
eq("negative → 6", promptMaxHeight(-5), 6)
eq("NaN → 6", promptMaxHeight(Number.NaN), 6)

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
