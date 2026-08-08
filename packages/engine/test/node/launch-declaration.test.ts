import { describe, expect, it } from "bun:test"
import { launchDeclaration, LAUNCH_RUNTIMES } from "../../src/node/launch-declaration"

describe("launch declaration (E5)", () => {
  it("certifies codex at A1 with evidence and explicit nonclaims", () => {
    const declaration = launchDeclaration("codex")
    expect(declaration.runtime).toBe("codex")
    expect(declaration.certificationLevel).toBe("A1")
    expect(declaration.protocolVersion).toBe("1.0-draft")
    expect(declaration.testVersion.length).toBeGreaterThan(0)
    expect(declaration.operatingSystems).toContain("windows")

    // Boundaries: what IS enforced/observed at A1.
    expect(declaration.boundariesCovered.some((b) => b.includes("process supervision"))).toBe(true)
    expect(declaration.boundariesCovered.some((b) => b.includes("durable launch evidence"))).toBe(true)
    expect(declaration.boundariesCovered.some((b) => b.includes("interceptable surface"))).toBe(true)

    // Known bypasses: what is explicitly NOT mediated.
    expect(declaration.knownBypasses.some((b) => b.includes("no OS-level sandbox"))).toBe(true)
    expect(declaration.knownBypasses.some((b) => b.includes("PTY/terminal-mediated effects"))).toBe(true)

    // Evidence: certification tests + the engine D-7.1 read-boundary fixtures.
    expect(declaration.evidence.some((e) => e.includes("A1 certification tests"))).toBe(true)
    expect(declaration.evidence.some((e) => e.includes("hostile-escape fixtures"))).toBe(true)

    // Explicit nonclaims: no sandbox, no exact-effect PEP.
    expect(declaration.nonclaims.some((n) => n.includes("no sandbox claim"))).toBe(true)
    expect(declaration.nonclaims.some((n) => n.includes("no exact-effect PEP claim"))).toBe(true)
  })

  it("certifies claude and gemini at A1 via the shared launch machinery", () => {
    for (const runtime of ["claude", "gemini"] as const) {
      const declaration = launchDeclaration(runtime)
      expect(declaration.runtime).toBe(runtime)
      expect(declaration.certificationLevel).toBe("A1")
      expect(declaration.protocolVersion).toBe("1.0-draft")
      expect(declaration.testVersion).toBe("e5-a1-1")
      expect(declaration.operatingSystems).toContain("windows")

      // Boundaries: what IS enforced/observed at A1 (shared machinery).
      expect(declaration.boundariesCovered.some((b) => b.includes("process supervision"))).toBe(true)
      expect(declaration.boundariesCovered.some((b) => b.includes("durable launch evidence"))).toBe(true)
      expect(declaration.boundariesCovered.some((b) => b.includes("interceptable surface"))).toBe(true)

      // Known bypasses: what is explicitly NOT mediated.
      expect(declaration.knownBypasses.some((b) => b.includes("no OS-level sandbox"))).toBe(true)
      expect(declaration.knownBypasses.some((b) => b.includes("PTY/terminal-mediated effects"))).toBe(true)

      // Evidence: certification tests + the engine D-7.1 read-boundary fixtures.
      expect(declaration.evidence.some((e) => e.includes("A1 certification tests"))).toBe(true)
      expect(declaration.evidence.some((e) => e.includes("hostile-escape fixtures"))).toBe(true)
      expect(declaration.evidence.some((e) => e.includes("shared spawn machinery"))).toBe(true)

      // Explicit nonclaims: no sandbox, no exact-effect PEP, no file-read containment.
      expect(declaration.nonclaims.some((n) => n.includes("no sandbox claim"))).toBe(true)
      expect(declaration.nonclaims.some((n) => n.includes("no exact-effect PEP claim"))).toBe(true)
      expect(declaration.nonclaims.some((n) => n.includes("no file-read containment claim"))).toBe(true)

      // Honesty: the real runtime binary was NOT exercised on this host.
      expect(declaration.nonclaims.some((n) => n.includes("binary exercise on this validation host"))).toBe(true)
    }
  })

  it("keeps the file-read boundary honest for every runtime", () => {
    for (const runtime of LAUNCH_RUNTIMES) {
      const declaration = launchDeclaration(runtime)
      expect(declaration.boundariesCovered.length).toBeGreaterThan(0)
      expect(declaration.knownBypasses.length).toBeGreaterThan(0)
      expect(declaration.operatingSystems.length).toBeGreaterThan(0)
      // The launch path performs no agent-driven file reads: no declaration may
      // claim file-read containment in the launch path.
      expect(declaration.nonclaims.some((n) => n.includes("no file-read containment claim") || n.includes("no enforcement claim"))).toBe(true)
    }
  })
})
