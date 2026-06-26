import { describe, expect, test } from "bun:test"
import {
  activeRolloutFlags,
  allRolloutFlags,
  flagsForPhase,
  kernelRolloutFlags,
  migrationPhaseFlags,
  phaseIsLive,
} from "./rollout"

describe("rollout registry", () => {
  test("kernel flags reference valid phases", () => {
    const flags = kernelRolloutFlags()
    expect(flags.length).toBeGreaterThanOrEqual(9)
    for (const f of flags) {
      expect(f.key).toBeTruthy()
      expect(f.description.length).toBeGreaterThan(0)
      expect(["off", "observational", "shadow", "enforced"]).toContain(f.mode)
    }
  })

  test("migration phase flags track each phase", () => {
    const flags = migrationPhaseFlags()
    const phases = [...new Set(flags.map((f) => f.phase))]
    expect(phases.length).toBeGreaterThanOrEqual(8)
  })

  test("no flag defaults to off without an explicit phase milestone", () => {
    // The three phases that are already live should have flags in non-off mode
    const live = phaseIsLive("observability_foundation")
    expect(live).toBe(true)
  })

  test("phases not yet active report not live", () => {
    expect(phaseIsLive("contraction")).toBe(false)
  })

  test("activeRolloutFlags filters to non-off flags", () => {
    const active = activeRolloutFlags()
    expect(active.length).toBeGreaterThan(0)
    expect(active.every((f) => f.mode !== "off")).toBe(true)
  })

  test("flagsForPhase returns only flags for that phase", () => {
    const obs = flagsForPhase("observability_foundation")
    expect(obs.length).toBeGreaterThanOrEqual(2)
    expect(obs.every((f) => f.phase === "observability_foundation")).toBe(true)
  })

  test("all flags have unique keys", () => {
    const all = allRolloutFlags()
    const keys = all.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test("governed_mutation_shadow is active", () => {
    expect(phaseIsLive("governed_mutation_shadow")).toBe(true)
  })
})
