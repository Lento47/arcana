import { allPerformanceBudgetsPassed, type ArcanaPerformanceBudgetResult } from "./performance-budget"

export type ArcanaOptimizationGateInput = {
  readonly budget_results: readonly ArcanaPerformanceBudgetResult[]
  readonly governance_preserved: boolean
  readonly security_preserved: boolean
  readonly traceability_preserved: boolean
  readonly runproof_preserved: boolean
  readonly rollout_flagged: boolean
  readonly behavior_changed: boolean
}

export type ArcanaOptimizationGateResult = {
  readonly passed: boolean
  readonly blockers: readonly string[]
  readonly warnings: readonly string[]
}

export function evaluateOptimizationGate(input: ArcanaOptimizationGateInput): ArcanaOptimizationGateResult {
  const blockers = [
    !allPerformanceBudgetsPassed(input.budget_results) ? "performance_budget_failed" : undefined,
    !input.governance_preserved ? "governance_not_preserved" : undefined,
    !input.security_preserved ? "security_not_preserved" : undefined,
    !input.traceability_preserved ? "traceability_not_preserved" : undefined,
    !input.runproof_preserved ? "runproof_not_preserved" : undefined,
    input.behavior_changed && !input.rollout_flagged ? "behavior_change_without_rollout_flag" : undefined,
  ].filter((blocker): blocker is string => Boolean(blocker))

  const warnings = [
    input.budget_results.length === 0 ? "no_performance_budgets_provided" : undefined,
    input.rollout_flagged && !input.behavior_changed ? "rollout_flag_present_without_behavior_change" : undefined,
  ].filter((warning): warning is string => Boolean(warning))

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
  }
}
