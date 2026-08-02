/**
 * D1 — Zod-driven RunProof view layer. Standalone mirror of
 * d1-zod-normalizers.test.ts (bun:test segfaults on Windows in this env).
 * Source contracts fail on old code; behavior pins the old semantics.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  contextBudgetsFromEvents,
  mlEvidenceFromEvents,
  normalizeProofView,
  proofBoolean,
  proofNumber,
  proofString,
  runProofRawViewSchema,
  sovereigntyFromEvents,
  tokenUsageFromEvents,
  type RunProofEventView,
} from "../src/proof-view/run-proof-view"

const root = join(import.meta.dir, "..")

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

const appSource = () => readFileSync(join(root, "src/app.tsx"), "utf8").replace(/\r\n/g, "\n")
const moduleSource = () => readFileSync(join(root, "src/proof-view/run-proof-view.ts"), "utf8").replace(/\r\n/g, "\n")
const packageSource = () => readFileSync(join(root, "package.json"), "utf8").replace(/\r\n/g, "\n")

console.log("verify-d1-zod (Zod-driven RunProof view layer):")

console.log("source contracts (fail on old code):")
const src = appSource()
check(!src.includes("function proofString("), "app.tsx: no hand-rolled proofString")
check(!src.includes("function proofNumber("), "app.tsx: no hand-rolled proofNumber")
check(!src.includes("function asRecord("), "app.tsx: no hand-rolled asRecord")
check(!src.includes("function normalizeProofView("), "app.tsx: no hand-rolled normalizeProofView")
check(!src.includes("function normalizeDiffs("), "app.tsx: no hand-rolled normalizeDiffs")
check(!src.includes("type RunProofView = {"), "app.tsx: no hand-written RunProofView type")
check(!src.includes("function sovereigntyFromEvents("), "app.tsx: no hand-rolled sovereigntyFromEvents")
check(!src.includes("function tokenUsageFromEvents("), "app.tsx: no hand-rolled tokenUsageFromEvents")
check(!src.includes("function contextBudgetsFromEvents("), "app.tsx: no hand-rolled contextBudgetsFromEvents")
check(src.includes('from "./proof-view/run-proof-view"'), "app.tsx imports the proof-view module")

const mod = moduleSource()
check(mod.includes('import { z } from "zod"'), "module imports zod")
check(mod.includes("runProofRawViewSchema"), "module exports the raw schema")
check(mod.includes("z.infer<typeof"), "module derives types via z.infer")
check(mod.includes("export function normalizeProofView("), "module exports normalizeProofView")

check(packageSource().includes('"zod": "catalog:"'), "package.json declares zod catalog dep")

console.log("behavior: full proof normalizes with all sections present:")
const fullProof = {
  id: "p1",
  user_intent: "Fix the bug",
  timestamp: "2026-07-31T00:00:00Z",
  lifecycle: { status: "completed", started_at: "s", ended_at: "e" },
  contract: {
    goal: "g",
    scope: "s",
    allowed_files: ["a.ts", 5, "b.ts"],
    allowed_commands: ["bun test"],
    risk_level: "medium",
    required_approvals: ["r"],
    expected_artifacts: [],
    rollback_plan: "rp",
    verification_steps: ["t"],
    status: "ok",
  },
  risk: { level: "medium", reasons: ["x"], required_approval: true },
  rollback: {
    checkpoint_id: "c",
    strategy: "snapshot",
    restore_command: "restore",
    valid_until: "v",
    restore_status: "staged",
    staged_at: "t",
    approval_required: true,
    approved_at: "a",
    approved_by: "b",
    executed_at: "e",
    execution_status: "pending",
    execution_exit_code: 0,
  },
  final_evidence: { completed: true, summary: "s", proof_score: 8.5, human_review_recommended: false },
  diffs: {
    proposed: [{ id: "d1", path: "a.ts", status: "modified", additions: 3, deletions: 1, summary: "x" }, "junk"],
    applied: [],
    rejected: [],
  },
  execution: {
    file_reads: [{ id: "r1", path: "a.ts", reason: "r", exists: true, bytes_read: 100 }],
    file_writes: [{ id: "w1", path: "b.ts", mode: "0644", reason: "r", bytes_written: 50 }],
    shell_commands: [
      { id: "c1", command: "bun test", cwd: ".", status: "ok", risk: "low", exit_code: 0, stdout_summary: "pass", stderr_summary: "" },
    ],
  },
  verification: {
    diagnostics: [{ id: "d", command: "tsc", source: "s", description: "d", status: "ok", summary: "s", evidence: "e", passed: 1, failed: 0, skipped: 0, duration_ms: 10 }],
    tests: [],
    manual_checks: [],
    typecheck: { id: "tc", command: "tsc", status: "ok", summary: "s" },
    lint: undefined,
    build: null,
    verifier_review: { model: "m", status: "ok", summary: "s", concerns: ["c"] },
  },
  events: [
    {
      timestamp: "t1",
      type: "sovereignty.routed",
      actor: "router",
      summary: "routed",
      risk: "low",
      status: "ok",
      refs: { provider: "ref-provider" },
      data: {
        provider: "local",
        model: "m",
        route: "local",
        reason: "privacy",
        data_left_local: true,
        selection_source: "policy",
        fallback_provider: "fp",
        fallback_model: "fm",
        data_boundary: "local",
        estimated_cost_usd: 0.01,
        latency_ms: 5,
      },
    },
    { timestamp: "t2", type: "token.used", data: { input_tokens: 100, output_tokens: 50, total_tokens: 150, tool_calls: 2 } },
    { timestamp: "t3", type: "token.used", data: { input_tokens: 30, output_tokens: 10, total_tokens: 40, tool_calls: 1 } },
    {
      timestamp: "t4",
      type: "consensus.recorded",
      data: {
        council_id: "c",
        prompt: "p",
        models: ["a", "b"],
        rounds: 2,
        vote_mode: "majority",
        status: "ok",
        winner_model: "a",
        vote_tally: { a: 2, b: 1, junk: "x" },
        cost_tokens: { input: 5, output: 6 },
        errored: [],
        transcript: "tr",
      },
    },
    {
      timestamp: "t5",
      type: "ml.signal",
      data: {
        kind: "tool",
        signal: {
          intent: "edit",
          toolName: "write",
          risk: "low",
          executionPosture: "ask",
          confidence: { value: 0.9 },
          labels: ["l"],
          reasons: ["r"],
          modelRoute: { profile: "local", reason: "r" },
        },
        decision: { action: "allow", posture: "standard", confidence: 0.8, reasons: ["d"] },
      },
    },
    { timestamp: "t6", type: "ml.signal", data: { kind: "turn", signal: { confidence: 0.7 } } },
    {
      timestamp: "t7",
      type: "context.budgeted",
      data: { estimated_tokens: 1000, system_tokens: 200, tool_tokens: 100, message_count: 5, threshold: 0.8, action: "compact" },
    },
    { timestamp: "t8", type: "other", data: 42 },
  ],
}

const view = normalizeProofView(fullProof)
eq("id", view.id, "p1")
eq("contract.allowed_files filters junk", view.contract?.allowed_files, ["a.ts", "b.ts"])
eq("contract.risk_level", view.contract?.risk_level, "medium")
eq("rollback.execution_exit_code", view.rollback?.execution_exit_code, 0)
eq("final_evidence.proof_score", view.final_evidence?.proof_score, 8.5)
eq("diffs.proposed length (junk dropped)", view.diffs?.proposed?.length, 1)
eq("diffs.proposed[0].path", view.diffs?.proposed?.[0]?.path, "a.ts")
eq("execution.file_reads length", view.execution?.file_reads?.length, 1)
eq("execution.file_writes length", view.execution?.file_writes?.length, 1)
eq("execution.shell_commands length", view.execution?.shell_commands?.length, 1)
eq("verification.diagnostics length", view.verification?.diagnostics?.length, 1)
eq("verification.typecheck.id", view.verification?.typecheck?.id, "tc")
check(view.verification?.build === undefined, "verification.build null → lenient undefined")
eq("verification.verifier_review.concerns", view.verification?.verifier_review?.concerns, ["c"])

console.log("behavior: derived views:")
eq("sovereignty.provider (data wins over refs)", view.sovereignty?.provider, "local")
check(view.sovereignty?.data_left_local === true, "sovereignty.data_left_local true")
eq("token_usage sums", view.token_usage, { input_tokens: 130, output_tokens: 60, total_tokens: 190, tool_calls: 3, turns: 2 })
eq("consensus[0].council_id", view.consensus?.[0]?.council_id, "c")
eq("consensus[0].vote_tally (junk dropped)", view.consensus?.[0]?.vote_tally, { a: 2, b: 1 })
eq("consensus[0].cost_tokens", view.consensus?.[0]?.cost_tokens, { input: 5, output: 6 })
eq("consensus[0].winner_model", view.consensus?.[0]?.winner_model, "a")
check(view.ml_evidence?.length === 2, "ml_evidence length 2")
eq("ml[0].kind", view.ml_evidence?.[0]?.kind, "tool")
eq("ml[0].tool", view.ml_evidence?.[0]?.tool, "write")
eq("ml[0].confidence (record {value} unwrapped)", view.ml_evidence?.[0]?.confidence, 0.9)
eq("ml[0].route", view.ml_evidence?.[0]?.route, "local")
eq("ml[0].decision_action", view.ml_evidence?.[0]?.decision_action, "allow")
eq("ml[0].decision_reasons", view.ml_evidence?.[0]?.decision_reasons, ["d"])
eq("ml[1].kind", view.ml_evidence?.[1]?.kind, "turn")
eq("ml[1].confidence", view.ml_evidence?.[1]?.confidence, 0.7)
check(view.ml_evidence?.[1]?.decision_action === undefined, "ml[1].decision_action undefined")

console.log("behavior: garbage input never throws:")
for (const garbage of [null, undefined, 42, "string", [1, 2], { events: "junk" }, { diffs: "junk" }]) {
  const v = normalizeProofView(garbage)
  check(v.id === undefined, `garbage (${JSON.stringify(garbage)}) → id undefined`)
  check(JSON.stringify(v.diffs) === JSON.stringify({ proposed: [], applied: [], rejected: [] }), `garbage → diffs empty arrays`)
  check(JSON.stringify(v.verification?.diagnostics) === "[]", `garbage → verification empty`)
  check(JSON.stringify(v.events) === "[]", `garbage → events empty`)
  check(v.sovereignty === undefined && v.token_usage === undefined, `garbage → derived undefined`)
}

console.log("behavior: refs fallback + findLast + lenient primitives:")
const refsOnly = normalizeProofView({
  events: [
    { type: "sovereignty.routed", refs: { provider: "fp", model: "fm" }, summary: "first" },
    { type: "sovereignty.routed", refs: { provider: "lp", model: "lm" }, summary: "last" },
  ],
})
eq("sovereignty.provider (findLast wins)", refsOnly.sovereignty?.provider, "lp")
eq("sovereignty.model (refs fallback)", refsOnly.sovereignty?.model, "lm")
check(refsOnly.sovereignty?.data_left_local === undefined, "missing boolean → undefined")
eq("proofString(' hi ') keeps original (untrimmed)", proofString(" hi "), " hi ")
check(proofString("") === undefined, "proofString('') undefined")
check(proofString("   ") === undefined, "proofString(whitespace) undefined")
check(proofString(5) === undefined, "proofString(5) undefined")
eq("proofNumber(0)", proofNumber(0), 0)
check(proofNumber(Number.NaN) === undefined, "proofNumber(NaN) undefined")
check(proofNumber(Number.POSITIVE_INFINITY) === undefined, "proofNumber(Infinity) undefined")
check(proofNumber("7") === undefined, "proofNumber('7') undefined")
check(proofBoolean(false) === false, "proofBoolean(false) false")
check(proofBoolean(0) === undefined, "proofBoolean(0) undefined")

console.log("behavior: standalone extractors:")
const events = [
  { timestamp: "a", type: "token.used", data: { input_tokens: 1, output_tokens: 2, total_tokens: 3, tool_calls: 1 } },
  { timestamp: "b", type: "context.budgeted", data: { estimated_tokens: 500, action: "observe" } },
  { timestamp: "c", type: "token.used", data: { input_tokens: "junk" } },
]
eq("tokenUsageFromEvents", tokenUsageFromEvents(events), { input_tokens: 1, output_tokens: 2, total_tokens: 3, tool_calls: 1, turns: 2 })
const budgets = contextBudgetsFromEvents(events)
check(budgets.length === 1, "contextBudgetsFromEvents length 1")
eq("budget.estimated_tokens", budgets[0]?.estimated_tokens, 500)
eq("budget.action default", budgets[0]?.action, "observe")
check(sovereigntyFromEvents([]) === undefined, "sovereigntyFromEvents([]) undefined")
check(JSON.stringify(mlEvidenceFromEvents([])) === "[]", "mlEvidenceFromEvents([]) empty")

console.log("behavior: ml.signal with malformed (non-object) data never throws:")
const malformedMl = mlEvidenceFromEvents(
  ([{ type: "ml.signal", data: 42 }, { type: "ml.signal", data: "x" }, { type: "ml.signal", data: [] }, { type: "ml.signal", data: undefined }] as unknown) as RunProofEventView[],
)
check(malformedMl.length === 4, "malformed ml.signal events all kept (lenient, old asRecord(data.signal) ?? {})")
check(
  malformedMl.every((m) => m.kind === "turn" && m.intent === undefined && m.confidence === undefined),
  "malformed ml.signal → empty evidence, no throw",
)

console.log("behavior: raw schema parses full fixture:")
check(runProofRawViewSchema.safeParse(fullProof).success === true, "runProofRawViewSchema.safeParse(fullProof).success")

console.log(failures === 0 ? `PASS (${checks}/${checks})` : `FAIL (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
