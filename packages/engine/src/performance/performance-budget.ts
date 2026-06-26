export type ArcanaPerformanceArea =
  | "tui_render"
  | "projection_replay"
  | "tool_execution"
  | "model_call"
  | "token_accounting"
  | "context_assembly"
  | "candidate_search"
  | "runproof_projection"

export type ArcanaPerformanceSample = {
  readonly area: ArcanaPerformanceArea
  readonly duration_ms: number
  readonly timestamp?: string
  readonly label?: string
}

export type ArcanaPerformanceBudget = {
  readonly area: ArcanaPerformanceArea
  readonly p50_ms?: number
  readonly p95_ms?: number
  readonly max_ms?: number
  readonly sample_floor?: number
}

export type ArcanaPerformanceBudgetResult = {
  readonly area: ArcanaPerformanceArea
  readonly sample_count: number
  readonly p50_ms: number
  readonly p95_ms: number
  readonly max_ms: number
  readonly avg_ms: number
  readonly passed: boolean
  readonly violations: readonly string[]
}

const round = (value: number) => Math.round(value * 100) / 100

export function percentile(values: readonly number[], percentileRank: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1))
  return sorted[index] ?? 0
}

export function evaluatePerformanceBudget(
  samples: readonly ArcanaPerformanceSample[],
  budget: ArcanaPerformanceBudget,
): ArcanaPerformanceBudgetResult {
  const areaSamples = samples.filter((sample) => sample.area === budget.area)
  const durations = areaSamples.map((sample) => Math.max(0, sample.duration_ms))
  const sampleFloor = budget.sample_floor ?? 1
  const p50 = round(percentile(durations, 50))
  const p95 = round(percentile(durations, 95))
  const max = round(durations.length === 0 ? 0 : Math.max(...durations))
  const avg = round(durations.length === 0 ? 0 : durations.reduce((total, value) => total + value, 0) / durations.length)

  const violations = [
    durations.length < sampleFloor ? `sample_count ${durations.length} below floor ${sampleFloor}` : undefined,
    budget.p50_ms !== undefined && p50 > budget.p50_ms ? `p50 ${p50}ms exceeds ${budget.p50_ms}ms` : undefined,
    budget.p95_ms !== undefined && p95 > budget.p95_ms ? `p95 ${p95}ms exceeds ${budget.p95_ms}ms` : undefined,
    budget.max_ms !== undefined && max > budget.max_ms ? `max ${max}ms exceeds ${budget.max_ms}ms` : undefined,
  ].filter((violation): violation is string => Boolean(violation))

  return {
    area: budget.area,
    sample_count: durations.length,
    p50_ms: p50,
    p95_ms: p95,
    max_ms: max,
    avg_ms: avg,
    passed: violations.length === 0,
    violations,
  }
}

export function evaluatePerformanceBudgets(
  samples: readonly ArcanaPerformanceSample[],
  budgets: readonly ArcanaPerformanceBudget[],
): readonly ArcanaPerformanceBudgetResult[] {
  return budgets.map((budget) => evaluatePerformanceBudget(samples, budget))
}

export function allPerformanceBudgetsPassed(results: readonly ArcanaPerformanceBudgetResult[]): boolean {
  return results.every((result) => result.passed)
}
