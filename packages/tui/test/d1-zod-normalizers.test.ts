/**
 * D1 — Zod-driven RunProof view layer (audit D1 row, High).
 *
 * Old: app.tsx carried 19 hand-written RunProof*View interfaces (~lines
 * 143-369) plus ~500 lines of hand-rolled proofString/proofNumber/asRecord
 * normalizers (lines 376-745) — every new proof field meant editing the
 * interface AND the normalizer AND the derived extractors by hand.
 *
 * Fix: a single schema module (src/proof-view/run-proof-view.ts) derives all
 * view types via `z.infer` and drives normalization with Zod v4 (repo
 * standard, `catalog: 4.1.8`). Lenient coercion semantics are preserved
 * exactly: non-empty-trimmed string → value else undefined; finite number →
 * value else undefined; boolean → value else undefined; arrays filtered to
 * records; per-item junk dropped, never a whole-array failure; the top-level
 * parse never throws (falls back to an all-optional empty view).
 *
 * Source contracts fail on the old code; behavior contracts pin the old
 * semantics via fixtures.
 */
import { describe, expect, test } from "bun:test"
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
  type RunProofMLEvidenceView,
  type RunProofView,
} from "../src/proof-view/run-proof-view"

const root = join(import.meta.dir, "..")

const appSource = () =>
  readFileSync(join(root, "src/app.tsx"), "utf8").replace(/\r\n/g, "\n")
const moduleSource = () =>
  readFileSync(join(root, "src/proof-view/run-proof-view.ts"), "utf8").replace(/\r\n/g, "\n")
const packageSource = () =>
  readFileSync(join(root, "package.json"), "utf8").replace(/\r\n/g, "\n")

describe("D1 — source contracts (hand-rolled normalizers moved out of app.tsx)", () => {
  test("app.tsx no longer defines the hand-rolled normalizers or the view types", () => {
    const src = appSource()
    expect(src).not.toContain("function proofString(")
    expect(src).not.toContain("function proofNumber(")
    expect(src).not.toContain("function asRecord(")
    expect(src).not.toContain("function normalizeProofView(")
    expect(src).not.toContain("function normalizeDiffs(")
    expect(src).not.toContain("type RunProofView = {")
    expect(src).not.toContain("function sovereigntyFromEvents(")
    expect(src).not.toContain("function tokenUsageFromEvents(")
    expect(src).not.toContain("function contextBudgetsFromEvents(")
  })
  test("app.tsx imports the proof-view module", () => {
    expect(appSource()).toContain('from "./proof-view/run-proof-view"')
  })
  test("the module is Zod-driven and exports the schema + inferred types", () => {
    const src = moduleSource()
    expect(src).toContain('import { z } from "zod"')
    expect(src).toContain("runProofRawViewSchema")
    expect(src).toContain("z.infer<typeof")
    expect(src).toContain("export function normalizeProofView(")
  })
  test("zod is declared in packages/tui dependencies", () => {
    expect(packageSource()).toContain('"zod": "catalog:"')
  })
})

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
    final_evidence: {
      completed: true,
      summary: "s",
      proof_score: 8.5,
      human_review_recommended: false,
    },
    diffs: {
      proposed: [
        { id: "d1", path: "a.ts", status: "modified", additions: 3, deletions: 1, summary: "x" },
        "junk",
      ],
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

  test("a full proof normalizes with all sections present", () => {
    const view = normalizeProofView(fullProof)
    expect(view.id).toBe("p1")
    expect(view.contract?.allowed_files).toEqual(["a.ts", "b.ts"]) // junk item filtered
    expect(view.contract?.risk_level).toBe("medium")
    expect(view.rollback?.execution_exit_code).toBe(0)
    expect(view.final_evidence?.proof_score).toBe(8.5)
    expect(view.diffs?.proposed).toHaveLength(1) // "junk" string dropped
    expect(view.diffs?.proposed[0]?.path).toBe("a.ts")
    expect(view.execution?.file_reads).toHaveLength(1)
    expect(view.execution?.file_writes).toHaveLength(1)
    expect(view.execution?.shell_commands).toHaveLength(1)
    expect(view.verification?.diagnostics).toHaveLength(1)
    expect(view.verification?.typecheck?.id).toBe("tc")
    expect(view.verification?.build).toBeUndefined() // null → lenient undefined
    expect(view.verification?.verifier_review?.concerns).toEqual(["c"])
  })

  test("derived views: sovereignty (data over refs), token sums, consensus, ml evidence", () => {
    const view = normalizeProofView(fullProof)
    expect(view.sovereignty?.provider).toBe("local") // data wins over refs
    expect(view.sovereignty?.data_left_local).toBe(true)
    expect(view.token_usage).toEqual({ input_tokens: 130, output_tokens: 60, total_tokens: 190, tool_calls: 3, turns: 2 })
    expect(view.consensus?.[0]?.council_id).toBe("c")
    expect(view.consensus?.[0]?.vote_tally).toEqual({ a: 2, b: 1 }) // junk entry dropped
    expect(view.consensus?.[0]?.cost_tokens).toEqual({ input: 5, output: 6 })
    expect(view.consensus?.[0]?.winner_model).toBe("a")
    const ml = view.ml_evidence as RunProofMLEvidenceView[]
    expect(ml).toHaveLength(2)
    expect(ml[0]?.kind).toBe("tool")
    expect(ml[0]?.tool).toBe("write")
    expect(ml[0]?.confidence).toBe(0.9) // record { value } unwrapped
    expect(ml[0]?.route).toBe("local")
    expect(ml[0]?.decision_action).toBe("allow")
    expect(ml[0]?.decision_reasons).toEqual(["d"])
    expect(ml[1]?.kind).toBe("turn")
    expect(ml[1]?.confidence).toBe(0.7)
    expect(ml[1]?.decision_action).toBeUndefined()
  })

  test("garbage input never throws — all-optional empty view, empty arrays present", () => {
    for (const garbage of [null, undefined, 42, "string", [1, 2], { events: "junk" }, { diffs: "junk" }]) {
      const view = normalizeProofView(garbage)
      expect(view.id).toBeUndefined()
      expect(view.diffs).toEqual({ proposed: [], applied: [], rejected: [] })
      expect(view.execution).toEqual({ file_reads: [], file_writes: [], shell_commands: [] })
      expect(view.verification).toEqual({
        diagnostics: [],
        tests: [],
        manual_checks: [],
        typecheck: undefined,
        lint: undefined,
        build: undefined,
        verifier_review: undefined,
      })
      expect(view.events).toEqual([])
      expect(view.sovereignty).toBeUndefined()
      expect(view.token_usage).toBeUndefined()
      expect(view.consensus).toEqual([])
      expect(view.ml_evidence).toEqual([])
    }
  })

  test("sovereignty refs fallback + findLast, and lenient primitives", () => {
    const refsOnly = normalizeProofView({
      events: [
        { type: "sovereignty.routed", refs: { provider: "fp", model: "fm" }, summary: "first" },
        { type: "sovereignty.routed", refs: { provider: "lp", model: "lm" }, summary: "last" },
      ],
    })
    expect(refsOnly.sovereignty?.provider).toBe("lp") // findLast wins
    expect(refsOnly.sovereignty?.model).toBe("lm") // refs fallback from the same event
    expect(refsOnly.sovereignty?.data_left_local).toBeUndefined()

    expect(proofString(" hi ")).toBe(" hi ") // original value, not trimmed
    expect(proofString("")).toBeUndefined()
    expect(proofString("   ")).toBeUndefined()
    expect(proofString(5)).toBeUndefined()
    expect(proofNumber(0)).toBe(0)
    expect(proofNumber(Number.NaN)).toBeUndefined()
    expect(proofNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(proofNumber("7")).toBeUndefined()
    expect(proofBoolean(false)).toBe(false)
    expect(proofBoolean(0)).toBeUndefined()
  })

  test("derived extractors are exported and run standalone on typed events", () => {
    const events = [
      { timestamp: "a", type: "token.used", data: { input_tokens: 1, output_tokens: 2, total_tokens: 3, tool_calls: 1 } },
      { timestamp: "b", type: "context.budgeted", data: { estimated_tokens: 500, action: "observe" } },
      { timestamp: "c", type: "token.used", data: { input_tokens: "junk" } },
    ]
    expect(tokenUsageFromEvents(events)).toEqual({ input_tokens: 1, output_tokens: 2, total_tokens: 3, tool_calls: 1, turns: 2 })
    const budgets = contextBudgetsFromEvents(events)
    expect(budgets).toHaveLength(1)
    expect(budgets[0]?.estimated_tokens).toBe(500)
    expect(budgets[0]?.action).toBe("observe") // default when absent
    expect(sovereigntyFromEvents([])).toBeUndefined()
    expect(mlEvidenceFromEvents([])).toEqual([])
  })

  test("ml.signal with malformed (non-object) data never throws (old asRecord(data.signal) ?? {})", () => {
    const malformed = mlEvidenceFromEvents(
      ([{ type: "ml.signal", data: 42 }, { type: "ml.signal", data: "x" }, { type: "ml.signal", data: [] }, { type: "ml.signal", data: undefined }] as unknown) as RunProofEventView[],
    )
    expect(malformed).toHaveLength(4) // lenient — every event kept
    for (const entry of malformed) {
      expect(entry.kind).toBe("turn")
      expect(entry.intent).toBeUndefined()
      expect(entry.confidence).toBeUndefined()
    }
  })

  test("the raw schema parses the full fixture without throwing", () => {
    expect(runProofRawViewSchema.safeParse(fullProof).success).toBe(true)
  })

describe("D1 — RunProofView type is schema-derived", () => {
  test("the exported type resolves and is structurally compatible", () => {
    const view: RunProofView = normalizeProofView(fullProof)
    expect(view.id).toBe("p1")
  })
})
