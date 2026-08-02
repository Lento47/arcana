import { describe, expect, it } from "bun:test"
import { launchDeclaration, LAUNCH_RUNTIMES } from "../../src/node/launch-declaration"

describe("launch declaration (E5)", () => {
  it("declares A1 with explicit boundaries and bypasses for every runtime", () => {
    for (const runtime of LAUNCH_RUNTIMES) {
      const declaration = launchDeclaration(runtime)
      expect(declaration.runtime).toBe(runtime)
      expect(declaration.level).toBe("A1")
      expect(declaration.boundariesCovered.length).toBeGreaterThan(0)
      expect(declaration.knownBypasses.some((b) => b.includes("no OS-level sandbox"))).toBe(true)
      expect(declaration.knownBypasses.some((b) => b.includes("not governed"))).toBe(true)
    }
  })
})
