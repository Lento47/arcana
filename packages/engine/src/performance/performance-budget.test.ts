import { describe, expect, test } from "bun:test"
import {
  allPerformanceBudgetsPassed,
  evaluatePerformanceBudget,
  evaluatePerformanceBudgets,
  percentile,
  type ArcanaPerformanceSample,
} from "./performance-budget"

describe("performance budget evaluation", () => {
  test("computes deterministic percentiles without mutating input", () => {
    const values = [30, 10, 20]
    expect(percentile(values, 50)).toBe(20)
    expect(values).toEqual([30, 10, 20])
  })

  test("passes when samples stay within budget", () => {
    const samples: ArcanaPerformanceSample[] = [
      { area: "tui_render", duration_ms: 4 },
      { area: "tui_render", duration_ms: 6 },
      { area: "tui_render", duration_ms: 8 },
    ]

    const result = evaluatePerformanceBudget(samples, {
      area: "tui_render",
      p50_ms: 6,
      p95_ms: 8,
      max_ms: 8,
      sample_floor: 3,
    })

    expect(result.passed).toBe(true)
    expect(result.violations).toEqual([])
  })

  test("reports budget violations", () => {
    const result = evaluatePerformanceBudget([{ area: "projection_replay", duration_ms: 40 }], {
      area: "projection_replay",
      p95_ms: 20,
      max_ms: 30,
      sample_floor: 2,
    })

    expect(result.passed).toBe(false)
    expect(result.violations.length).toBe(3)
  })

  test("aggregates multiple budget results", () => {
    const samples: ArcanaPerformanceSample[] = [
      { area: "tui_render", duration_ms: 5 },
      { area: "token_accounting", duration_ms: 2 },
    ]

    const results = evaluatePerformanceBudgets(samples, [
      { area: "tui_render", max_ms: 8 },
      { area: "token_accounting", max_ms: 3 },
    ])

    expect(allPerformanceBudgetsPassed(results)).toBe(true)
  })
})
