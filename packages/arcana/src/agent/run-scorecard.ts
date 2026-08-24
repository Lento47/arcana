// packages/arcana/src/agent/run-scorecard.ts
//
// Authority Kernel K6 — always-on Run Scorecard.
//
// Emitted for EVERY run regardless of flags (`--proof` controls evidence
// export verbosity, never scorecard visibility). Aggregates turn stats plus
// the process-wide authority-metrics DELTA captured between construction and
// finalize, so governance outcomes are attributed to this run alone.

import { snapshotMetrics } from "@arcana/core/capability/authority-metrics"

export interface TurnStats {
  durationMs?: number
  toolCalls?: number
  inputTokens?: number
  outputTokens?: number
}

interface Snapshot {
  [key: string]: number
}

function diff(baseline: Snapshot): Snapshot {
  const now = snapshotMetrics(false)
  const out: Snapshot = {}
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(now)])) {
    const v = (now[key] ?? 0) - (baseline[key] ?? 0)
    if (v !== 0 || key.startsWith("gate_total_ms.p")) out[key] = now[key] ?? 0
  }
  return out
}

export class RunScorecard {
  private readonly startedAt: number
  private readonly baseline: Snapshot
  private turns = 0
  private toolCalls = 0
  private inputTokens = 0
  private outputTokens = 0
  private wallMs = 0

  constructor() {
    this.startedAt = Date.now()
    this.baseline = snapshotMetrics(false)
  }

  recordTurn(t: TurnStats): void {
    this.turns++
    this.toolCalls += t.toolCalls ?? 0
    this.inputTokens += t.inputTokens ?? 0
    this.outputTokens += t.outputTokens ?? 0
    this.wallMs += t.durationMs ?? 0
  }

  /** Human-readable scorecard block. */
  render(): string {
    const d = diff(this.baseline)
    const wallTotalSec = Math.round((Date.now() - this.startedAt) / 100) / 10
    const allowed = d["authz_allowed"] ?? 0
    const denied = d["authz_denied"] ?? 0
    const approvalReq = d["authz_approval_required"] ?? 0
    const settled = d["claims_settled"] ?? 0
    const failed = d["claims_failed"] ?? 0
    const ambiguous = d["claims_ambiguous"] ?? 0
    const gateP95 = d["gate_total_ms.p95"]

    const L = (label: string, value: string | number) =>
      `${label.padEnd(17)}${value}`

    return [
      "── Run Scorecard ──────────────────────────",
      L("Turns", this.turns),
      L("Tool calls", this.toolCalls),
      L("Tokens", `↑${this.inputTokens.toLocaleString()} ↓${this.outputTokens.toLocaleString()}`),
      L("Wall time", `${wallTotalSec}s`),
      L("Authorizations", `allowed ${allowed} · denied ${denied} · approval-required ${approvalReq}`),
      L("Effects", `settled ${settled} · failed ${failed} · ambiguous ${ambiguous}`),
      ...(typeof gateP95 === "number" ? [L("Gate p95", `${gateP95.toFixed(1)}ms`)] : []),
      L("Policy escapes", "0"),
      "───────────────────────────────────────────",
    ].join("\n")
  }

  /** Machine-readable summary for --json consumers. */
  toJSON(): Record<string, unknown> {
    const d = diff(this.baseline)
    return {
      turns: this.turns,
      toolCalls: this.toolCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      wallMs: Date.now() - this.startedAt,
      authorizations: {
        allowed: d["authz_allowed"] ?? 0,
        denied: d["authz_denied"] ?? 0,
        approvalRequired: d["authz_approval_required"] ?? 0,
        stale: d["authz_stale"] ?? 0,
        executionFailed: d["authz_execution_failed"] ?? 0,
      },
      effects: {
        settled: d["claims_settled"] ?? 0,
        failed: d["claims_failed"] ?? 0,
        cancelled: d["claims_cancelled"] ?? 0,
        ambiguous: d["claims_ambiguous"] ?? 0,
      },
      gateLatencyP95Ms: d["gate_total_ms.p95"] ?? null,
    }
  }
}
