import { describe, expect, test } from "bun:test"
import { createTokenLedgerEntry, reconcileTokenEntries, stableTokenLedgerHash, tokenTotalsFromEntries, totalTokens, zeroTokenTotals } from "./token-ledger"

describe("Arcana token ledger", () => {
  test("creates zero totals across every token class", () => {
    expect(totalTokens(zeroTokenTotals())).toBe(0)
  })

  test("aggregates estimates and actuals independently", () => {
    const entries = [
      createTokenLedgerEntry({
        id: "tok_1",
        action_id: "act_1",
        provider: "test",
        model: "test-model",
        phase: "estimate",
        token_class: "input_uncached",
        estimated_tokens: 100,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      createTokenLedgerEntry({
        id: "tok_2",
        action_id: "act_1",
        provider: "test",
        model: "test-model",
        phase: "actual",
        token_class: "output_visible",
        actual_tokens: 25,
        created_at: "2026-01-01T00:00:01.000Z",
      }),
    ]

    expect(tokenTotalsFromEntries(entries, "estimated_tokens").input_uncached).toBe(100)
    expect(tokenTotalsFromEntries(entries, "actual_tokens").output_visible).toBe(25)
  })

  test("reconciles exact estimates", () => {
    const entries = [
      createTokenLedgerEntry({ id: "tok_est", action_id: "act_1", provider: "test", model: "test-model", phase: "estimate", token_class: "input_uncached", estimated_tokens: 100 }),
      createTokenLedgerEntry({ id: "tok_actual", action_id: "act_1", provider: "test", model: "test-model", phase: "actual", token_class: "input_uncached", actual_tokens: 100 }),
    ]

    expect(reconcileTokenEntries("act_1", entries).status).toBe("exact")
  })

  test("detects over-budget actual usage", () => {
    const entries = [
      createTokenLedgerEntry({ id: "tok_est", action_id: "act_1", provider: "test", model: "test-model", phase: "estimate", token_class: "input_uncached", estimated_tokens: 100 }),
      createTokenLedgerEntry({ id: "tok_actual", action_id: "act_1", provider: "test", model: "test-model", phase: "actual", token_class: "input_uncached", actual_tokens: 125 }),
    ]

    const reconciliation = reconcileTokenEntries("act_1", entries)
    expect(reconciliation.status).toBe("over_estimate")
    expect(reconciliation.delta).toBe(25)
  })

  test("detects missing estimates", () => {
    const entries = [
      createTokenLedgerEntry({ id: "tok_actual", action_id: "act_1", provider: "test", model: "test-model", phase: "actual", token_class: "input_uncached", actual_tokens: 125 }),
    ]

    expect(reconcileTokenEntries("act_1", entries).status).toBe("missing_estimate")
  })

  test("stable hashes are deterministic", () => {
    expect(stableTokenLedgerHash({ b: 2, a: 1 })).toBe(stableTokenLedgerHash({ a: 1, b: 2 }))
  })
})
