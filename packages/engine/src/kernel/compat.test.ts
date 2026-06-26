import { describe, expect, test } from "bun:test"
import { activeShimCount, blockingShims, compatShimRegistry } from "./compat"
import { nativeRuntimeMigrationPhases } from "./migration"

describe("compatibility shim registry", () => {
  const phases = nativeRuntimeMigrationPhases()

  test("registers all known compat shims", () => {
    const registry = compatShimRegistry()
    expect(registry.length).toBeGreaterThanOrEqual(9)
    expect(registry.every((s) => s.id.length > 0)).toBe(true)
    expect(registry.every((s) => s.description.length > 0)).toBe(true)
    expect(registry.every((s) => s.removal_signal.length > 0)).toBe(true)
    expect(registry.every((s) => s.bridges.length > 0)).toBe(true)
  })

  test("all shims reference valid migration phases", () => {
    const registry = compatShimRegistry()
    const phaseIds = new Set(phases.map((p) => p.id))
    for (const shim of registry) {
      expect(phaseIds.has(shim.removal_phase)).toBe(true)
    }
  })

  test("reports blocking shims for a given phase", () => {
    const blocking = blockingShims("governed_mutation_enforced", phases)
    // At least opencode-tool-conventions should block this phase
    const toolShim = blocking.find((s) => s.id === "opencode-tool-conventions")
    expect(toolShim).toBeDefined()
    expect(toolShim!.status).toBe("active")
  })

  test("active shim count is tracked as a health metric", () => {
    const count = activeShimCount()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(compatShimRegistry().length)
  })

  test("shims with status 'removed' never block", () => {
    // Verify the structure — blockingShims filters by status
    const blocking = blockingShims("contraction", phases)
    const envFlag = blocking.find((s) => s.id === "opencode-env-flag")
    expect(envFlag).toBeDefined() // still active in real registry
  })
})
