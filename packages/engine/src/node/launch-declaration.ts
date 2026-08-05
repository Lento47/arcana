/**
 * E5: external CLI launch declaration.
 *
 * Honest enforcement-level contract for `arcana launch <runtime>`: the
 * codex adapter is certified at A1 (process supervision + evidence capture)
 * and explicitly NOT a sandbox. claude/gemini are A0 (launch scaffold only,
 * no enforcement claim). Every launch records the declared boundary, its
 * known bypasses, its certification evidence, and its nonclaims so no
 * enforcement claim is ever implied.
 */

export type LaunchRuntime = "codex" | "claude" | "gemini"

export const LAUNCH_RUNTIMES: readonly LaunchRuntime[] = ["codex", "claude", "gemini"]

/**
 * Adapter certification levels (see .hermes/docs/arcana/docs/protocol/ADAPTER-CERTIFICATION.md):
 * A0 = telemetry only, no enforcement claim; A1 = PTY/process observation
 * (supervision + mediating what is interceptable; explicitly lower fidelity).
 */
export type CertificationLevel = "A0" | "A1"

export type LaunchDeclaration = {
  runtime: LaunchRuntime
  /** Declared certification level for THIS adapter. Never exceeds the evidence. */
  certificationLevel: CertificationLevel
  protocolVersion: string
  /** Test version of the certification fixtures backing the declared level. */
  testVersion: string
  /** What the adapter actually enforces/observes at its declared level. */
  boundariesCovered: string[]
  /** Explicitly NOT mediated — every bypass is stated, never hidden. */
  knownBypasses: string[]
  /** Evidence the declared boundary is real (tests, fixtures, wiring). */
  evidence: string[]
  /** Nonclaims — statements this adapter must never be read as enforcing. */
  nonclaims: string[]
  operatingSystems: string[]
}

const codexDeclaration: LaunchDeclaration = {
  runtime: "codex",
  certificationLevel: "A1",
  protocolVersion: "1.0-draft",
  testVersion: "e5-a1-1",
  boundariesCovered: [
    "process supervision (spawn, cwd, exit status, duration)",
    "durable launch evidence record (JSON, directory-scoped)",
    "session/workspace identity binding (directory-scoped)",
    "interceptable surface: argv, working directory, process lifecycle, exit code",
  ],
  knownBypasses: [
    "no OS-level sandbox (filesystem/network/process/secret constraints)",
    "effects performed by the runtime outside Arcana supervision are not governed",
    "PTY/terminal-mediated effects are not intercepted",
  ],
  evidence: [
    "A1 certification tests: launch-declaration.test.ts pins level/evidence/nonclaims; CLI dry-run test pins the printed declaration (test/cli/launch.test.ts)",
    "engine file-read containment boundary (D-7.1 SafeBoundedFileReader) hostile-escape fixtures run green in core + engine suites: traversal, absolute path, null byte, directory, size budget, junction escape",
    "launch path performs no agent-driven file reads today; any future agent-readable content must route through readBoundedFile (boundary documented, not in-path)",
    "validated on windows in-tree (2026-08-05); linux/macos live validation pending (BLK-D-03 / BLK-CLI-04)",
  ],
  nonclaims: [
    "no sandbox claim: no OS-level filesystem/network/process/secret containment",
    "no exact-effect PEP claim: runtime tool calls do not flow through the Arcana PEP before the effect",
    "no file-read containment claim in the launch path (the adapter reads no agent content)",
    "no linux/macos runtime validation yet",
  ],
  operatingSystems: ["windows"],
}

const scaffoldOnlyDeclaration = (runtime: LaunchRuntime): LaunchDeclaration => ({
  runtime,
  certificationLevel: "A0",
  protocolVersion: "1.0-draft",
  testVersion: "e5-a0-scaffold",
  boundariesCovered: [
    "launch scaffold: CLI surface + --dry-run declaration only",
    "telemetry only: no enforcement claim",
  ],
  knownBypasses: ["all runtime effects are ungoverned (A0)"],
  evidence: ["no certification evidence: A0 scaffold only (declaration + dry-run tests)"],
  nonclaims: [
    "no enforcement claim of any kind (A0)",
    "no sandbox claim: no OS-level filesystem/network/process/secret containment",
    "no exact-effect PEP claim",
  ],
  operatingSystems: ["windows"],
})

export function launchDeclaration(runtime: LaunchRuntime): LaunchDeclaration {
  if (runtime === "codex") return codexDeclaration
  return scaffoldOnlyDeclaration(runtime)
}
