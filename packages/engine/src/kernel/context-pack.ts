// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { Token } from "@arcana/core/util/token"

export const ContextPackKind = Schema.Literals([
  "policy",
  "system",
  "objective",
  "retrieval",
  "tool_schema",
  "tool_result",
  "summary",
  "user_input",
  "provider_state",
  "learned_context",
  "compatibility_shim",
])
export type ContextPackKind = typeof ContextPackKind.Type

export const ContextPackTrust = Schema.Literals([
  "kernel",
  "provider",
  "user",
  "agent",
  "tool",
  "learned",
  "compat",
])
export type ContextPackTrust = typeof ContextPackTrust.Type

export const ContextPackEntry = Schema.Struct({
  id: Schema.String,
  kind: ContextPackKind,
  trust: ContextPackTrust,
  source: Schema.String,
  content: Schema.String,
  token_estimate: Schema.Number,
  must_include: Schema.Boolean,
  cost_priority: Schema.Number,
})
export type ContextPackEntry = typeof ContextPackEntry.Type

export const ContextPack = Schema.Struct({
  id: Schema.String,
  entries: Schema.Array(ContextPackEntry),
  total_tokens_estimated: Schema.Number,
  created_at: Schema.String,
})
export type ContextPack = typeof ContextPack.Type

/**
 * ContextPack trust ordering: kernel content is always highest priority,
 * then user, then learned, then agent, then tool output. Compat shims
 * and provider state are always discardable.
 */
const TRUST_PRIORITY: Record<ContextPackTrust, number> = {
  kernel: 0,
  user: 1,
  learned: 2,
  agent: 3,
  tool: 4,
  compat: 5,
  provider: 6,
}

export function createContextPack(id?: string): ContextPack {
  return {
    id: id ?? `cp_${crypto.randomUUID()}`,
    entries: [],
    total_tokens_estimated: 0,
    created_at: new Date().toISOString(),
  }
}

export function addEntry(pack: ContextPack, entry: ContextPackEntry): ContextPack {
  const entries = [...pack.entries, entry]
  return {
    ...pack,
    entries,
    total_tokens_estimated: entries.reduce((sum, e) => sum + e.token_estimate, 0),
  }
}

/**
 * Trim a context pack to fit within a token budget. Entries are sorted by
 * trust priority (kernel first, provider last), then within the same trust
 * level by cost_priority (higher = trim first). Must-include entries are
 * never trimmed.
 */
export function trimToBudget(
  pack: ContextPack,
  maxTokens: number,
): ContextPack {
  const sorted = [...pack.entries].sort((a, b) => {
    if (a.must_include && !b.must_include) return -1
    if (!a.must_include && b.must_include) return 1
    const trustDiff = TRUST_PRIORITY[a.trust] - TRUST_PRIORITY[b.trust]
    if (trustDiff !== 0) return trustDiff
    return a.cost_priority - b.cost_priority
  })

  const kept: ContextPackEntry[] = []
  let used = 0
  for (const entry of sorted) {
    if (entry.must_include) {
      kept.push(entry)
      used += entry.token_estimate
      continue
    }
    if (used + entry.token_estimate <= maxTokens) {
      kept.push(entry)
      used += entry.token_estimate
    }
  }

  return {
    ...pack,
    entries: kept,
    total_tokens_estimated: used,
  }
}

/**
 * Estimate how many tokens are available for non-essential content
 * after must-include entries are accounted for.
 */
export function budgetHeadroom(pack: ContextPack, maxTokens: number): number {
  const mustInclude = pack.entries
    .filter((e) => e.must_include)
    .reduce((sum, e) => sum + e.token_estimate, 0)
  return Math.max(0, maxTokens - mustInclude)
}

/**
 * Which trust levels are still present after trimming. Used by the TUI
 * projection to show what got dropped.
 */
export function packTrustProfile(pack: ContextPack): ContextPackTrust[] {
  const seen = new Set<ContextPackTrust>()
  for (const e of pack.entries) seen.add(e.trust)
  return [...seen].sort((a, b) => TRUST_PRIORITY[a] - TRUST_PRIORITY[b])
}

/**
 * Count of discarded entries by kind. Tells the verifier what was lost.
 */
export function packTrimLoss(
  original: ContextPack,
  trimmed: ContextPack,
): Record<string, number> {
  const kept = new Set(trimmed.entries.map((e) => e.id))
  const loss: Record<string, number> = {}
  for (const e of original.entries) {
    if (!kept.has(e.id)) {
      loss[e.kind] = (loss[e.kind] ?? 0) + 1
    }
  }
  return loss
}

/** Rough token estimate from message content — canonical core estimator. */
export function estimateTokensFromContent(content: string): number {
  return Token.estimate(content)
}
