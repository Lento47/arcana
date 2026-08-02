/**
 * Low-cluster pass #3 — S12 + D7. Standalone mirror of low-cluster-3.test.ts
 * (bun:test segfaults on Windows in this env). Source contracts fail on old code.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (rel: string) => readFileSync(join(import.meta.dir, rel), "utf8").replace(/\r\n/g, "\n")

const spineDiff = () => read("../src/shell/command-spine/spine-diff.tsx")
const app = () => read("../src/app.tsx")
const home = () => read("../src/routes/home.tsx")
const session = () => read("../src/routes/session/index.tsx")

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

console.log("verify-low-cluster-3 (S12 + D7):")

console.log("S12 — formatLineNumber never silently clips:")
const diff = spineDiff()
// Contract on the exact buggy concatenation (only ever present in the old
// code) — a bare ".slice(-5)" check would also match the S12 fix comment
// which explains the clip in prose.
check(!diff.includes("padStart(5).slice(-5)"), "padStart(5).slice(-5) clip gone")
check(diff.includes("padStart(5)"), "formatLineNumber keeps padStart(5) field")
check(diff.includes('return "     "'), "undefined/NaN guard keeps 5-space filler")
// Behavior mirror of the new form: no clipping at 100000+.
const format = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? "     " : String(value).padStart(5)
check(format(123456) === "123456", `123456 renders in full (got "${format(123456)}")`)
check(format(99999) === "99999", "99999 keeps 5-col alignment")
check(format(42) === "   42", "42 pads to 5 cols")
check(format(undefined) === "     ", "undefined renders 5-space filler")

console.log("D7 — toast surface app-global, not per-route:")
const appSrc = app()
check(appSrc.includes("<Toast />"), "app.tsx renders one global <Toast />")
check(
  appSrc.includes('ToastProvider, Toast, useToast } from "./ui/toast"'),
  "app.tsx imports Toast with the provider",
)
const homeSrc = home()
check(!homeSrc.includes("<Toast />"), "home.tsx no longer renders <Toast />")
check(!homeSrc.includes('from "../ui/toast"'), "home.tsx no longer imports Toast")
const sessionSrc = session()
check(!sessionSrc.includes("<Toast />"), "session/index.tsx no longer renders <Toast />")
check(
  sessionSrc.includes('import { useToast } from "../../ui/toast"'),
  "session/index.tsx keeps only useToast import",
)
check(!sessionSrc.includes("Toast, useToast"), "session/index.tsx drops Toast from import")

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
