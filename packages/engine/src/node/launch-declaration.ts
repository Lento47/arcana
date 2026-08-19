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

export type LaunchRuntime =
  | "codex"
  | "claude"
  | "gemini"
  | "hermes"
  | "opencode"
  | "cursor"
  | "aider"
  | "continue"
  | "cline"
  | "windsurf"
  | "copilot"

export const LAUNCH_RUNTIMES: readonly LaunchRuntime[] = [
  "codex", "claude", "gemini",
  "hermes", "opencode", "cursor",
  "aider", "continue", "cline",
  "windsurf", "copilot",
]

/**
 * Per-runtime configuration: binary path, default args, and environment variables.
 *
 * Resolution order (highest priority wins):
 *   1. CLI flags (--binary, --env KEY=VALUE, --args)
 *   2. Environment variables (ARCANA_LAUNCH_<RUNTIME>_BINARY, _ARGS, _ENV_<KEY>)
 *   3. This default config
 */
export type RuntimeConfig = {
  /** Binary name or absolute path. Resolved on PATH if not absolute. */
  binary: string
  /** Default arguments appended before any CLI --args. */
  defaultArgs: string[]
  /** Extra environment variables merged into the spawn env. */
  env: Record<string, string>
}

const defaultConfig = (binary: string, overrides?: Partial<RuntimeConfig>): RuntimeConfig => ({
  binary,
  defaultArgs: [],
  env: {},
  ...overrides,
})

/** Default configuration for every supported runtime. */
export const RUNTIME_CONFIGS: Record<LaunchRuntime, RuntimeConfig> = {
  codex: defaultConfig("codex"),
  claude: defaultConfig("claude"),
  gemini: defaultConfig("gemini"),
  hermes: defaultConfig("hermes"),
  opencode: defaultConfig("opencode"),
  cursor: defaultConfig("cursor"),
  aider: defaultConfig("aider", { defaultArgs: ["--yes"] }),
  continue: defaultConfig("continue"),
  cline: defaultConfig("cline"),
  windsurf: defaultConfig("windsurf"),
  copilot: defaultConfig("copilot"),
}

/** Derive the default binary name for each runtime from its config. */
export const RUNTIME_BINARIES: Record<LaunchRuntime, string> = Object.fromEntries(
  LAUNCH_RUNTIMES.map((r) => [r, RUNTIME_CONFIGS[r].binary]),
) as Record<LaunchRuntime, string>

/**
 * Resolve the effective runtime configuration by merging:
 *   defaults ← env var overrides ← CLI overrides
 */
export function resolveRuntimeConfig(
  runtime: LaunchRuntime,
  cliOverrides?: {
    binary?: string
    args?: string[]
    env?: Record<string, string>
  },
): RuntimeConfig {
  const defaults = RUNTIME_CONFIGS[runtime]
  const envPrefix = `ARCANA_LAUNCH_${runtime.toUpperCase()}`

  // 1. Environment variable overrides
  const envBinary = process.env[`${envPrefix}_BINARY`]
  const envArgsRaw = process.env[`${envPrefix}_ARGS`]
  const envArgs = envArgsRaw ? envArgsRaw.split(/\s+/).filter(Boolean) : []

  // Collect per-key env overrides: ARCANA_LAUNCH_<RT>_ENV_<KEY>=<VALUE>
  const envVars: Record<string, string> = { ...defaults.env }
  for (const [key, value] of Object.entries(process.env)) {
    const prefix = `${envPrefix}_ENV_`
    if (key.startsWith(prefix) && value !== undefined) {
      const envKey = key.slice(prefix.length)
      envVars[envKey] = value
    }
  }

  // 2. Merge: defaults ← env ← CLI
  return {
    binary: cliOverrides?.binary ?? envBinary ?? defaults.binary,
    defaultArgs: [...defaults.defaultArgs, ...envArgs],
    env: {
      ...envVars,
      ...(cliOverrides?.env ?? {}),
    },
  }
}

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

// ── Shared A1 arrays (single source of truth) ─────────────────────────

const A1_BOUNDARIES = [
  "process supervision (spawn, cwd, exit status, duration)",
  "durable launch evidence record (JSON, directory-scoped)",
  "session/workspace identity binding (directory-scoped)",
  "interceptable surface: argv, working directory, process lifecycle, exit code",
]

const A1_BYPASSES = [
  "no OS-level sandbox (filesystem/network/process/secret constraints)",
  "effects performed by the runtime outside Arcana supervision are not governed",
  "PTY/terminal-mediated effects are not intercepted",
]

const A1_COMMON_EVIDENCE = [
  "A1 certification tests: launch-declaration.test.ts pins level/evidence/nonclaims; CLI dry-run test pins the printed declaration (test/cli/launch.test.ts)",
  "engine file-read containment boundary (D-7.1 SafeBoundedFileReader) hostile-escape fixtures run green in core + engine suites: traversal, absolute path, null byte, directory, size budget, junction escape",
]

const A1_COMMON_NONCLAIMS = [
  "no sandbox claim: no OS-level filesystem/network/process/secret containment",
  "no exact-effect PEP claim: runtime tool calls do not flow through the Arcana PEP before the effect",
  "no file-read containment claim in the launch path (the adapter reads no agent content)",
]

// ── Declaration factory ────────────────────────────────────────────────

/**
 * Create an A1 declaration for any runtime. The `extra` flags control
 * per-runtime honesty text (whether the binary was exercised, etc.).
 */
function a1Declaration(
  runtime: LaunchRuntime,
  extra: { exercised?: boolean } = {},
): LaunchDeclaration {
  const evidence = [...A1_COMMON_EVIDENCE]
  const nonclaims = [...A1_COMMON_NONCLAIMS]

  if (extra.exercised) {
    // codex: binary was installed and exercised on the validation host.
    evidence.push(
      "launch path performs no agent-driven file reads today; any future agent-readable content must route through readBoundedFile (boundary documented, not in-path)",
      "validated on windows in-tree (2026-08-05); linux/macos live validation pending (BLK-D-03 / BLK-CLI-04)",
    )
    nonclaims.push("no linux/macos runtime validation yet")
  } else {
    // Other runtimes: binary may not be installed; shared spawn path only.
    evidence.push(
      `shared spawn machinery: arcana launch ${runtime} uses the identical generic spawn/supervision/evidence path as codex (src/cli/cmd/launch.ts)`,
      `dry-run validated on windows in-tree`,
      `${runtime} runtime binary is NOT installed on this validation host; the live spawn path was NOT exercised with the real runtime; live linux/macos + real-binary validation pending (BLK-D-03 / BLK-CLI-04)`,
    )
    nonclaims.push(
      "no live linux/macos runtime validation yet",
      `no real ${runtime} binary exercise on this validation host`,
    )
  }

  return {
    runtime,
    certificationLevel: "A1",
    protocolVersion: "1.0-draft",
    testVersion: "e5-a1-1",
    boundariesCovered: [...A1_BOUNDARIES],
    knownBypasses: [...A1_BYPASSES],
    evidence,
    nonclaims,
    operatingSystems: ["windows"],
  }
}

export function launchDeclaration(runtime: LaunchRuntime): LaunchDeclaration {
  return a1Declaration(runtime, { exercised: runtime === "codex" })
}
