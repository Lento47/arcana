// packages/arcana/src/agent/run-scorecard.test.ts
// K6 — scorecard aggregation + authority-metrics delta attribution.

import { describe, expect, it } from "bun:test"
import { RunScorecard } from "./run-scorecard"
import { recordDecision, recordClaimTerminal, snapshotMetrics } from "@arcana/core/capability/authority-metrics"

describe("RunScorecard (K6)", () => {
  it("aggregates turn stats", () => {
    const sc = new RunScorecard()
    sc.recordTurn({ toolCalls: 3, inputTokens: 100, outputTokens: 50, durationMs: 1200 })
    sc.recordTurn({ toolCalls: 2, inputTokens: 80, outputTokens: 30, durationMs: 800 })
    const json = sc.toJSON() as any
    expect(json.turns).toBe(2)
    expect(json.toolCalls).toBe(5)
    expect(json.inputTokens).toBe(180)
    expect(json.outputTokens).toBe(80)
    expect(json.wallMs).toBeGreaterThanOrEqual(0)
  })

  it("attributes authorization deltas to this run only", () => {
    // Pre-existing noise from earlier suites must not leak into the delta.
    const pre = new RunScorecard()
    void pre
    recordDecision("EXECUTED")
    const sc = new RunScorecard()
    recordDecision("DENIED")
    recordClaimTerminal("AMBIGUOUS")
    const json = sc.toJSON() as any
    expect(json.authorizations.allowed).toBe(0)
    expect(json.authorizations.denied).toBeGreaterThanOrEqual(1)
    expect(json.effects.ambiguous).toBeGreaterThanOrEqual(1)
    // Reset so other tests start clean.
    snapshotMetrics(true)
  })

  it("render includes governance lines", () => {
    const sc = new RunScorecard()
    sc.recordTurn({ toolCalls: 1 })
    const text = sc.render()
    expect(text).toContain("Run Scorecard")
    expect(text).toContain("Authorizations")
    expect(text).toContain("Policy escapes")
  })
})
