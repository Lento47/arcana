// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"

export const ArcanaTokenClass = Schema.Literals([
  "input_uncached",
  "input_cache_read",
  "input_cache_write",
  "output_visible",
  "output_reasoning",
  "tool_schema",
  "tool_result",
  "retrieval_context",
  "summary",
  "embedding",
  "provider_state",
])
export type ArcanaTokenClass = typeof ArcanaTokenClass.Type

export const ArcanaTokenLedgerPhase = Schema.Literals(["estimate", "actual", "reconcile"])
export type ArcanaTokenLedgerPhase = typeof ArcanaTokenLedgerPhase.Type

export const ArcanaTokenLedgerStatus = Schema.Literals(["exact", "under_estimate", "over_estimate", "missing_estimate", "missing_actual"])
export type ArcanaTokenLedgerStatus = typeof ArcanaTokenLedgerStatus.Type

export const ArcanaTokenLedgerEntry = Schema.Struct({
  version: Schema.Literal("token-ledger.v1"),
  id: Schema.String,
  run_id: Schema.optional(Schema.String),
  pipeline_id: Schema.optional(Schema.String),
  action_id: Schema.String,
  candidate_id: Schema.optional(Schema.String),
  provider: Schema.String,
  model: Schema.String,
  phase: ArcanaTokenLedgerPhase,
  token_class: ArcanaTokenClass,
  estimated_tokens: Schema.optional(Schema.Number),
  actual_tokens: Schema.optional(Schema.Number),
  unit_cost_micros: Schema.optional(Schema.Number),
  estimated_cost_micros: Schema.optional(Schema.Number),
  actual_cost_micros: Schema.optional(Schema.Number),
  latency_ms: Schema.optional(Schema.Number),
  cache_key: Schema.optional(Schema.String),
  cache_hit: Schema.optional(Schema.Boolean),
  source_ref: Schema.optional(Schema.String),
  opaque_provider_state_ref: Schema.optional(Schema.String),
  previous_entry_hash: Schema.optional(Schema.String),
  entry_hash: Schema.String,
  created_at: Schema.String,
})
export type ArcanaTokenLedgerEntry = typeof ArcanaTokenLedgerEntry.Type

export const ArcanaTokenTotals = Schema.Struct({
  input_uncached: Schema.Number,
  input_cache_read: Schema.Number,
  input_cache_write: Schema.Number,
  output_visible: Schema.Number,
  output_reasoning: Schema.Number,
  tool_schema: Schema.Number,
  tool_result: Schema.Number,
  retrieval_context: Schema.Number,
  summary: Schema.Number,
  embedding: Schema.Number,
  provider_state: Schema.Number,
})
export type ArcanaTokenTotals = typeof ArcanaTokenTotals.Type

export const ArcanaTokenReconciliation = Schema.Struct({
  action_id: Schema.String,
  status: ArcanaTokenLedgerStatus,
  estimated_total: Schema.Number,
  actual_total: Schema.Number,
  delta: Schema.Number,
  reason: Schema.String,
})
export type ArcanaTokenReconciliation = typeof ArcanaTokenReconciliation.Type

export const TOKEN_CLASSES: readonly ArcanaTokenClass[] = [
  "input_uncached",
  "input_cache_read",
  "input_cache_write",
  "output_visible",
  "output_reasoning",
  "tool_schema",
  "tool_result",
  "retrieval_context",
  "summary",
  "embedding",
  "provider_state",
]

export function zeroTokenTotals(): ArcanaTokenTotals {
  return {
    input_uncached: 0,
    input_cache_read: 0,
    input_cache_write: 0,
    output_visible: 0,
    output_reasoning: 0,
    tool_schema: 0,
    tool_result: 0,
    retrieval_context: 0,
    summary: 0,
    embedding: 0,
    provider_state: 0,
  }
}

export function totalTokens(totals: ArcanaTokenTotals): number {
  return TOKEN_CLASSES.reduce((total, tokenClass) => total + totals[tokenClass], 0)
}

export function tokenTotalsFromEntries(entries: readonly ArcanaTokenLedgerEntry[], field: "estimated_tokens" | "actual_tokens"): ArcanaTokenTotals {
  return entries.reduce<ArcanaTokenTotals>((totals, entry) => {
    const value = entry[field] ?? 0
    if (value === 0) return totals
    return {
      ...totals,
      [entry.token_class]: totals[entry.token_class] + value,
    }
  }, zeroTokenTotals())
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`
}

export function stableTokenLedgerHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `tokh_${(hash >>> 0).toString(16).padStart(8, "0")}`
}

export function createTokenLedgerEntry(input: Omit<ArcanaTokenLedgerEntry, "version" | "id" | "entry_hash" | "created_at"> & {
  id?: string
  created_at?: string
  entry_hash?: string
}): ArcanaTokenLedgerEntry {
  const withoutHash = {
    version: "token-ledger.v1" as const,
    id: input.id ?? `tok_${crypto.randomUUID()}`,
    run_id: input.run_id,
    pipeline_id: input.pipeline_id,
    action_id: input.action_id,
    candidate_id: input.candidate_id,
    provider: input.provider,
    model: input.model,
    phase: input.phase,
    token_class: input.token_class,
    estimated_tokens: input.estimated_tokens,
    actual_tokens: input.actual_tokens,
    unit_cost_micros: input.unit_cost_micros,
    estimated_cost_micros: input.estimated_cost_micros,
    actual_cost_micros: input.actual_cost_micros,
    latency_ms: input.latency_ms,
    cache_key: input.cache_key,
    cache_hit: input.cache_hit,
    source_ref: input.source_ref,
    opaque_provider_state_ref: input.opaque_provider_state_ref,
    previous_entry_hash: input.previous_entry_hash,
    created_at: input.created_at ?? new Date().toISOString(),
  }
  return {
    ...withoutHash,
    entry_hash: input.entry_hash ?? stableTokenLedgerHash(withoutHash),
  }
}

export function reconcileTokenEntries(action_id: string, entries: readonly ArcanaTokenLedgerEntry[]): ArcanaTokenReconciliation {
  const relevant = entries.filter((entry) => entry.action_id === action_id)
  const estimated_total = totalTokens(tokenTotalsFromEntries(relevant, "estimated_tokens"))
  const actual_total = totalTokens(tokenTotalsFromEntries(relevant, "actual_tokens"))
  const delta = actual_total - estimated_total

  if (estimated_total === 0 && actual_total > 0) {
    return { action_id, status: "missing_estimate", estimated_total, actual_total, delta, reason: "Actual token usage exists without a preflight estimate." }
  }
  if (estimated_total > 0 && actual_total === 0) {
    return { action_id, status: "missing_actual", estimated_total, actual_total, delta, reason: "Preflight token estimate exists without provider actual usage." }
  }
  if (delta === 0) {
    return { action_id, status: "exact", estimated_total, actual_total, delta, reason: "Estimated and actual token usage match." }
  }
  if (delta > 0) {
    return { action_id, status: "over_estimate", estimated_total, actual_total, delta, reason: "Actual token usage exceeded the admitted estimate." }
  }
  return { action_id, status: "under_estimate", estimated_total, actual_total, delta, reason: "Actual token usage was lower than the admitted estimate." }
}
