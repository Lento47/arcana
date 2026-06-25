import { describe, expect, test } from "bun:test"
import {
  ARCANA_MIGRATION_PHASES,
  ARCANA_MIGRATION_QUALITY_DIMENSIONS,
  assessMigrationReadiness,
  migrationPlanCoversAllRequiredDimensions,
  nativeRuntimeMigrationPhases,
  phaseByID,
  phaseHasGovernedRollout,
  qualityDimensionsCoveredByPhase,
} from "./migration"

describe("Arcana native runtime migration model", () => {
  test("defines a complete ordered phase ladder", () => {
    expect(ARCANA_MIGRATION_PHASES).toEqual([
      "baseline_pin",
      "observability_foundation",
      "compatibility_bridge",
      "governed_mutation_shadow",
      "governed_mutation_enforced",
      "independent_verification",
      "native_proof_and_api",
      "contraction",
    ])
  })

  test("covers all required quality dimensions", () => {
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("performance")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("security")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("ai_sovereignty")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("ai_governance")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("known_bug_freedom")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("scalability")
    expect(ARCANA_MIGRATION_QUALITY_DIMENSIONS).toContain("technology_support")
    expect(migrationPlanCoversAllRequiredDimensions()).toBe(true)
  })

  test("every phase has gates, exit criteria, and governed rollout", () => {
    for (const phase of nativeRuntimeMigrationPhases()) {
      expect(phase.gates.length).toBeGreaterThan(0)
      expect(phase.exit_criteria.length).toBeGreaterThan(0)
      expect(phaseHasGovernedRollout(phase.id)).toBe(true)
    }
  })

  test("compatibility bridge protects legacy surfaces while routing to kernel", () => {
    const phase = phaseByID("compatibility_bridge")
    const shimNames = phase.shims.map((shim) => shim.name)
    const covered = qualityDimensionsCoveredByPhase("compatibility_bridge")

    expect(shimNames).toContain("OpenApiV1Compat")
    expect(shimNames).toContain("PermissionCompatAdapter")
    expect(shimNames).toContain("LegacyToolFacade")
    expect(shimNames).toContain("ConfigMigrator")
    expect(covered.has("security")).toBe(true)
    expect(covered.has("ai_sovereignty")).toBe(true)
    expect(covered.has("ai_governance")).toBe(true)
    expect(covered.has("technology_support")).toBe(true)
  })

  test("governed mutation cannot advance with ungated writes", () => {
    const report = assessMigrationReadiness({
      phase: "governed_mutation_enforced",
      shim_hit_rate: 0,
      replay_mismatches: 0,
      proof_gaps: 0,
      ungated_mutations: 1,
      high_risk_verifier_coverage: 1,
      rollback_drill_passed: true,
      blocking_bugs: 0,
      p95_overhead_percent: 5,
    })

    expect(report.ready).toBe(false)
    expect(report.blockers).toContain("enforced mutation phase still has ungated writes")
  })

  test("independent verification requires complete high-risk coverage", () => {
    const report = assessMigrationReadiness({
      phase: "independent_verification",
      shim_hit_rate: 0,
      replay_mismatches: 0,
      proof_gaps: 0,
      ungated_mutations: 0,
      high_risk_verifier_coverage: 0.99,
      rollback_drill_passed: true,
      blocking_bugs: 0,
      p95_overhead_percent: 5,
    })

    expect(report.ready).toBe(false)
    expect(report.blockers).toContain("high-risk verifier coverage must reach 100%")
  })

  test("contraction requires low shim usage, rollback, proof continuity, and verifier coverage", () => {
    const report = assessMigrationReadiness({
      phase: "contraction",
      shim_hit_rate: 0.02,
      replay_mismatches: 1,
      proof_gaps: 1,
      ungated_mutations: 0,
      high_risk_verifier_coverage: 0.95,
      rollback_drill_passed: false,
      blocking_bugs: 1,
      p95_overhead_percent: 12,
    })

    expect(report.ready).toBe(false)
    expect(report.blockers).toContain("blocking bugs must be zero before advancing")
    expect(report.blockers).toContain("RunProof gaps must be zero before advancing")
    expect(report.blockers).toContain("replay mismatches must be zero before advancing")
    expect(report.blockers).toContain("p95 migration overhead exceeds 10% budget")
    expect(report.blockers).toContain("compatibility shim hit rate must be below 1% before contraction")
    expect(report.blockers).toContain("rollback drill must pass before contraction")
    expect(report.blockers).toContain("high-risk verifier coverage must remain 100% before contraction")
  })
})
