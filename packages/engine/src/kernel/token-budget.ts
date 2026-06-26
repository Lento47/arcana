// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import type { ArcanaTokenTotals } from "./token-ledger"
import { totalTokens } from "./token-ledger"

export const ArcanaTokenBudgetScope = Schema.Literals(["action", "candidate", "pipeline", "run", "workspace"])
export type ArcanaTokenBudgetScope = typeof ArcanaTokenBudgetScope.Type

export const ArcanaTokenBudgetDecision = Schema.Literals([
  "allow",
  "downgrade_model",
  "compact_context",
  "reduce_candidates",
  "require_approval",
  "stop",
])
export type ArcanaTokenBudgetDecision = typeof ArcanaTokenBudgetDecision.Type

export const ArcanaTokenBudget = Schema.Struct({
  id: Schema.String,
  scope: ArcanaTokenBudgetScope,
  owner_id: Schema.String,
  token_limit: Schema.optional(Schema.Number),
  cost_limit_micros: Schema.optional(Schema.Number),
  latency_target_ms: Schema.optional(Schema.Number),
  max_candidates: Schema.optional(Schema.Number),
  max_context_share: Schema.optional(Schema.Number),
  consumed_tokens: Schema.Number,
  consumed_cost_micros: Schema.Number,
})
export type ArcanaTokenBudget = typeof ArcanaTokenBudget.Type

export const ArcanaTokenBudgetAdmission = Schema.Struct({
  budget_id: Schema.String,
  decision: ArcanaTokenBudgetDecision,
  estimated_tokens: Schema.Number,
  estimated_cost_micros: Schema.Number,
  remaining_tokens: Schema.optional(Schema.Number),
  remaining_cost_micros: Schema.optional(Schema.Number),
  reason: Schema.String,
})
export type ArcanaTokenBudgetAdmission = typeof ArcanaTokenBudgetAdmission.Type

export function createTokenBudget(input: Omit<ArcanaTokenBudget, "id" | "consumed_tokens" | "consumed_cost_micros"> & {
  id?: string
  consumed_tokens?: number
  consumed_cost_micros?: number
}): ArcanaTokenBudget {
  return {
    id: input.id ?? `tbud_${crypto.randomUUID()}`,
    scope: input.scope,
    owner_id: input.owner_id,
    token_limit: input.token_limit,
    cost_limit_micros: input.cost_limit_micros,
    latency_target_ms: input.latency_target_ms,
    max_candidates: input.max_candidates,
    max_context_share: input.max_context_share,
    consumed_tokens: input.consumed_tokens ?? 0,
    consumed_cost_micros: input.consumed_cost_micros ?? 0,
  }
}

export function remainingTokens(budget: ArcanaTokenBudget): number | undefined {
  return budget.token_limit === undefined ? undefined : Math.max(0, budget.token_limit - budget.consumed_tokens)
}

export function remainingCostMicros(budget: ArcanaTokenBudget): number | undefined {
  return budget.cost_limit_micros === undefined ? undefined : Math.max(0, budget.cost_limit_micros - budget.consumed_cost_micros)
}

export function estimateCostMicros(tokens: ArcanaTokenTotals, unitCostMicros = 0): number {
  return totalTokens(tokens) * unitCostMicros
}

export function admitTokenEstimate(input: {
  budget: ArcanaTokenBudget
  estimated: ArcanaTokenTotals
  estimated_cost_micros?: number
  context_share?: number
  candidate_count?: number
}): ArcanaTokenBudgetAdmission {
  const estimated_tokens = totalTokens(input.estimated)
  const estimated_cost_micros = input.estimated_cost_micros ?? 0
  const tokenRemaining = remainingTokens(input.budget)
  const costRemaining = remainingCostMicros(input.budget)

  if (tokenRemaining !== undefined && estimated_tokens > tokenRemaining) {
    return {
      budget_id: input.budget.id,
      decision: "compact_context",
      estimated_tokens,
      estimated_cost_micros,
      remaining_tokens: tokenRemaining,
      remaining_cost_micros: costRemaining,
      reason: "Estimated tokens exceed remaining budget; context must be compacted, downgraded, or stopped before the model call.",
    }
  }

  if (costRemaining !== undefined && estimated_cost_micros > costRemaining) {
    return {
      budget_id: input.budget.id,
      decision: "require_approval",
      estimated_tokens,
      estimated_cost_micros,
      remaining_tokens: tokenRemaining,
      remaining_cost_micros: costRemaining,
      reason: "Estimated cost exceeds remaining budget; approval is required before spend.",
    }
  }

  if (input.budget.max_context_share !== undefined && input.context_share !== undefined && input.context_share > input.budget.max_context_share) {
    return {
      budget_id: input.budget.id,
      decision: "compact_context",
      estimated_tokens,
      estimated_cost_micros,
      remaining_tokens: tokenRemaining,
      remaining_cost_micros: costRemaining,
      reason: "Estimated context share is too high; context must be compressed or narrowed.",
    }
  }

  if (input.budget.max_candidates !== undefined && input.candidate_count !== undefined && input.candidate_count > input.budget.max_candidates) {
    return {
      budget_id: input.budget.id,
      decision: "reduce_candidates",
      estimated_tokens,
      estimated_cost_micros,
      remaining_tokens: tokenRemaining,
      remaining_cost_micros: costRemaining,
      reason: "Candidate count exceeds budget policy; reduce candidate search before execution.",
    }
  }

  return {
    budget_id: input.budget.id,
    decision: "allow",
    estimated_tokens,
    estimated_cost_micros,
    remaining_tokens: tokenRemaining === undefined ? undefined : tokenRemaining - estimated_tokens,
    remaining_cost_micros: costRemaining === undefined ? undefined : costRemaining - estimated_cost_micros,
    reason: "Estimated token usage is within budget.",
  }
}

export function consumeTokenBudget(input: {
  budget: ArcanaTokenBudget
  actual_tokens: number
  actual_cost_micros?: number
}): ArcanaTokenBudget {
  return {
    ...input.budget,
    consumed_tokens: input.budget.consumed_tokens + input.actual_tokens,
    consumed_cost_micros: input.budget.consumed_cost_micros + (input.actual_cost_micros ?? 0),
  }
}
