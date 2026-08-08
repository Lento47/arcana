/**
 * E5: external CLI launch declaration.
 *
 * Honest enforcement-level contract for `arcana launch <runtime>`: codex,
 * claude, and gemini are all certified at A1 (process supervision + evidence
 * capture) and explicitly NOT a sandbox. claude/gemini run through the SAME
 * generic spawn/supervision/evidence path as codex (src/cli/cmd/launch.ts),
 * so their A1 certification rests on that shared machinery; the claude/gemini
 * runtime binaries are NOT installed on this validation host, which is stated
 * explicitly in their evidence and nonclaims. Every launch records the
 * declared boundary, its known bypasses, its certification evidence, and its
 * nonclaims so no enforcement claim is ever implied.
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

/**
 * Shared A1 declaration for the claude/gemini adapters.
 *
 * The launch machinery is identical for every runtime: `arcana launch
 * <runtime>` calls Bun.spawn with the runtime binary, supervises the process
 * (spawn, cwd, exit status, duration), writes the durable JSON evidence
 * record, and binds session/workspace identity - there is no per-runtime
 * difference in the launch path (src/cli/cmd/launch.ts). The A1 fixture set
 * pins the declaration for both runtimes, and the D-7.1 file-read
 * containment hostile-escape fixtures are shared. What is NOT claimed: the
 * claude/gemini binaries are not installed on this host, so the live spawn
 * path was not exercised with the real runtime.
 */
const sharedA1Declaration = (runtime: "claude" | "gemini"): LaunchDeclaration => ({
  runtime,
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
    `shared spawn machinery: arcana launch ${runtime} uses the identical generic spawn/supervision/evidence path as codex (src/cli/cmd/launch.ts)`,
    "dry-run validated on windows in-tree",
    `${runtime} runtime binary is NOT installed on this validation host; the live spawn path was NOT exercised with the real runtime; live linux/macos + real-binary validation pending (BLK-D-03 / BLK-CLI-04)`,
  ],
  nonclaims: [
    "no sandbox claim: no OS-level filesystem/network/process/secret containment",
    "no exact-effect PEP claim: runtime tool calls do not flow through the Arcana PEP before the effect",
    "no file-read containment claim in the launch path (the adapter reads no agent content)",
    "no live linux/macos runtime validation yet",
    `no real ${runtime} binary exercise on this validation host`,
  ],
  operatingSystems: ["windows"],
})

export function launchDeclaration(runtime: LaunchRuntime): LaunchDeclaration {
  if (runtime === "codex") return codexDeclaration
  return sharedA1Declaration(runtime)
}
