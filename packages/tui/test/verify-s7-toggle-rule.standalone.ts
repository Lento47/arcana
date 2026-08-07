/**
 * S7 — spine-entry toggle predicates consolidation. Standalone mirror of
 * s7-toggle-rule.test.ts (bun:test segfaults on Windows in this env).
 * Imports computeSpineToggle directly + source contracts that fail on old code.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { computeSpineToggle } from "../src/shell/command-spine/spine-entry"

const entry = () =>
  readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"), "utf8").replace(
    /\r\n/g,
    "\n",
  )

const facts = (overrides: Partial<Parameters<typeof computeSpineToggle>[0]> = {}) => ({
  onToggle: false,
  isThink: false,
  hasThinkBody: false,
  hasDiff: false,
  diffBody: "",
  hasListing: false,
  hasToolBody: false,
  hasChildren: false,
  childCount: 0,
  isAgentEntry: false,
  expanded: false,
  bodyLabel: undefined as string | undefined,
  ...overrides,
})

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
  check(JSON.stringify(got) === JSON.stringify(want), `${msg} (got ${JSON.stringify(got)})`)

console.log("verify-s7-toggle-rule (S7 predicate consolidation):")

console.log("source contracts:")
const src = entry()
// The bare identifier names survive inside computeSpineToggle (local `canToggle`
// gate, `headerToggleable` result field, doc-comment prose), so contract on the
// OLD declaration shapes: canToggle/showToggleRow were createMemos, the other
// three were arrow functions.
check(!src.includes("const canToggle = createMemo("), "canToggle predicate gone")
check(!src.includes("const showToggleRow = createMemo("), "showToggleRow gone")
check(!src.includes("const toggleLabel = ()"), "toggleLabel gone")
check(!src.includes("const headerDisclosure = ()"), "headerDisclosure gone")
check(!src.includes("const headerToggleable = ()"), "headerToggleable gone")
check(src.includes("const toggle = createMemo("), "one toggle memo exists")
check(src.includes("computeSpineToggle("), "memo consumes the pure helper")
check(src.includes("toggle().headerToggleable"), "consumers read toggle().headerToggleable")
check(src.includes("toggle().disclosure"), "consumers read toggle().disclosure")

console.log("drift-case behavior:")
eq("plain entry", computeSpineToggle(facts()), {
  headerToggleable: false,
  disclosure: "",
  rowToggleable: false,
  label: "▸ show details",
})
eq(
  "think with body → header only",
  { h: computeSpineToggle(facts({ isThink: true, hasThinkBody: true })).headerToggleable, r: computeSpineToggle(facts({ isThink: true, hasThinkBody: true })).rowToggleable },
  { h: true, r: false },
)
check(
  computeSpineToggle(facts({ isThink: true, hasThinkBody: false })).headerToggleable === false,
  "think without body → NOT header-togglable (drift fixed)",
)
check(
  computeSpineToggle(facts({ isAgentEntry: true })).headerToggleable === true &&
    computeSpineToggle(facts({ isAgentEntry: true })).rowToggleable === false,
  "agent entry → header-togglable, no row without broad gate",
)
eq(
  "agent + tool body",
  { h: computeSpineToggle(facts({ isAgentEntry: true, hasToolBody: true })).headerToggleable, r: computeSpineToggle(facts({ isAgentEntry: true, hasToolBody: true })).rowToggleable },
  { h: true, r: false },
)
check(
  computeSpineToggle(facts({ hasDiff: true, diffBody: "diff --git a/x b/x" })).rowToggleable === false &&
    computeSpineToggle(facts({ hasDiff: true, diffBody: "diff --git a/x b/x" })).headerToggleable === true,
  "diff with body → header only",
)
check(
  computeSpineToggle(facts({ hasDiff: true, diffBody: "" })).headerToggleable === false,
  "diff without body → not toggleable (drift fixed)",
)
eq(
  "children label",
  computeSpineToggle(facts({ hasChildren: true, childCount: 3 })).label,
  "▸ show 3 commands",
)
eq(
  "children expanded label",
  computeSpineToggle(facts({ hasChildren: true, childCount: 1, expanded: true })).label,
  "▾ hide 1 command",
)
check(
  computeSpineToggle(facts({ hasListing: true })).headerToggleable === false,
  "listing → no header toggle",
)
check(
  computeSpineToggle(facts({ hasToolBody: true })).disclosure === "▸" &&
    computeSpineToggle(facts({ hasToolBody: true, expanded: true })).disclosure === "▾",
  "disclosure flips on expanded",
)
eq(
  "bodyLabel drives label",
  computeSpineToggle(facts({ hasToolBody: true, bodyLabel: "matches" })).label,
  "▸ show matches",
)
check(
  computeSpineToggle(facts({ onToggle: true })).headerToggleable === false &&
    computeSpineToggle(facts({ onToggle: true })).rowToggleable === false,
  "onToggle alone does NOT force header/row toggle (matches old headerToggleable)",
)
check(
  computeSpineToggle(facts({ isAgentEntry: true, onToggle: true })).rowToggleable === false,
  "agent + onToggle → header toggle only (PR5 one affordance)",
)

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
