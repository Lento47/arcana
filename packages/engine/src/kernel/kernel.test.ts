import { describe, expect, test } from "bun:test"
import { createKernelContract, currentRuntimeIdentity, defaultAuthorityBoundaries } from "./kernel"

describe("Arcana kernel contract", () => {
  test("creates Arcana-native runtime identity", () => {
    const identity = currentRuntimeIdentity("cli")

    expect(identity.product).toBe("arcana")
    expect(identity.runtime).toBe("engine")
    expect(identity.surface).toBe("cli")
    expect(identity.compatibility.opencode_env).toBe(process.env.OPENCODE === "1")
  })

  test("defines explicit authority boundaries", () => {
    const boundaries = defaultAuthorityBoundaries()
    const authorities = boundaries.map((boundary) => boundary.authority)

    expect(authorities).toContain("intent")
    expect(authorities).toContain("policy")
    expect(authorities).toContain("risk")
    expect(authorities).toContain("mutation")
    expect(authorities).toContain("verification")
    expect(authorities).toContain("rollback")
    expect(authorities).toContain("proof")
    expect(boundaries.every((boundary) => boundary.must_emit_evidence)).toBe(true)
  })

  test("creates kernel contract for a runtime surface", () => {
    const contract = createKernelContract("tui")

    expect(contract.identity.surface).toBe("tui")
    expect(contract.authorities.length).toBeGreaterThan(0)
  })
})
