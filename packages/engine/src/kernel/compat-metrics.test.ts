import { describe, expect, test } from "bun:test"
import { nativeRuntimeMigrationPhases } from "./migration"
import { compatHealth, compatMetrics } from "./compat-metrics"

describe("Arcana compat metrics", () => {
  test("tracks observations for registered shims", () => {
    const metrics = compatMetrics({
      target_phase: "contraction",
      phases: nativeRuntimeMigrationPhases(),
      observations: [{ shim_id: "opencode-env-flag", count: 3, last_seen_at: "2026-01-01T00:00:00.000Z" }],
    })

    const envMetric = metrics.find((metric) => metric.shim_id === "opencode-env-flag")
    expect(envMetric?.count).toBe(3)
    expect(envMetric?.blocking).toBe(true)
  })

  test("health is not ready while blocking shims or observations remain", () => {
    const metrics = compatMetrics({
      target_phase: "contraction",
      phases: nativeRuntimeMigrationPhases(),
      observations: [{ shim_id: "opencode-env-flag", count: 1 }],
    })
    const health = compatHealth(metrics)

    expect(health.total_shims).toBeGreaterThan(0)
    expect(health.active_shims).toBeGreaterThan(0)
    expect(health.observed_hits).toBe(1)
    expect(health.blocking_shims).toBeGreaterThan(0)
    expect(health.ready_for_contraction).toBe(false)
  })
})
