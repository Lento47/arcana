/**
 * Replay metadata extraction and policy classification.
 *
 * Used by processor.ts to enrich tool.called and tool.returned events
 * with structured replay data. Policy classification uses Arcana's
 * versioned allowlist — not a model-provided flag.
 *
 * CRITICAL SAFETY INVARIANT:
 * Replay must re-evaluate the CURRENT policy at execution time.
 * The historical decision proves what Arcana believed then.
 * A stricter current policy always wins.
 */

import { createHash } from "node:crypto"

// ────────────────────────────────────────────────────────────────
// Policy version — bump when allowlist changes
// ────────────────────────────────────────────────────────────────

export const CURRENT_POLICY_VERSION = "replay-policy-v2"

// ────────────────────────────────────────────────────────────────
// Replay metadata types
// ────────────────────────────────────────────────────────────────

export interface ReplayCallMetadata {
  readonly executable: string | null
  readonly arguments: ReadonlyArray<string>
  readonly cwd: string | null
  readonly timeout: number | null

  readonly policyVersion: string
  readonly policyDecision: "ELIGIBLE" | "REFUSED" | "NOT_APPLICABLE"
  readonly refusalReason: string | null

  /** true when executable+arguments were inferred by parseCommandString
   *  rather than captured as structured data at the terminal-tool boundary.
   *  Fallback-parsed commands carry lower assurance. */
  readonly inferredInvocation: boolean

  /** true when the command was wrapped in a shell (sh -c, cmd /c, powershell).
   *  Shell-wrapped commands are never replayed. */
  readonly shellWrapped: boolean
}

export interface ReplayReturnMetadata {
  readonly exitCode: number | null

  /** Raw boundary digests — from the terminal execution boundary,
   *  not a transformed or truncated UI/tool result. */
  readonly rawStdoutDigest: string | null
  readonly rawStderrDigest: string | null

  /** Normalized digest for comparison. Profile is versioned. */
  readonly normalizedOutputDigest: string | null
  readonly normalizationProfile: string

  readonly duration: number | null
  readonly timeoutStatus: "COMPLETED" | "TIMED_OUT" | "UNKNOWN"
}

// ────────────────────────────────────────────────────────────────
// Allowlist policy
// ────────────────────────────────────────────────────────────────

const ALLOWED_PROGRAMS = new Set([
  "tsc", "bun", "npm", "npx", "node", "cargo", "rustc",
  "eslint", "prettier", "biome", "oxlint", "clippy",
  "pylint", "mypy", "ruff", "pytest",
  "go", "zig", "gcc", "clang", "make", "cmake",
])

const ALLOWED_SUBCOMMANDS: Record<string, Set<string>> = {
  bun: new Set(["test", "run", "check", "build"]),
  npm: new Set(["test", "run", "exec"]),
  npx: new Set(["tsc", "eslint", "prettier", "biome", "vitest", "jest"]),
  cargo: new Set(["test", "check", "clippy", "build", "fmt"]),
  go: new Set(["test", "build", "vet", "fmt"]),
  node: new Set(["--check"]),
}

const DANGEROUS_PATTERNS = [
  /\|/, />/, /`/, /\$\(/, /&&/, /\|\|/, /;/,
  /install/i, /add\s/i, /publish/i, /deploy/i,
  /push/i, /commit/i, /rm\s/, /mv\s/, /chmod/,
  /curl/i, /wget/i, /fetch/i, /ssh/i, /scp/i,
  /docker/i, /kubectl/i,
  /DROP\s/i, /DELETE\s/i, /UPDATE\s/i, /INSERT\s/i, /CREATE\s/i, /ALTER\s/i,
]

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/, /ghp_[a-zA-Z0-9]{36}/,
  /Bearer\s+\S+/, /password=\S+/i, /token=\S+/i, /key=\S+/i, /secret=\S+/i,
]

// Shell wrapper patterns — never replay through these
const SHELL_WRAPPERS = [
  /^\s*sh\s+-c\s/,
  /^\s*bash\s+-c\s/,
  /^\s*cmd\s+\/c\s/i,
  /^\s*cmd\.exe\s+\/c\s/i,
  /^\s*powershell\s/i,
  /^\s*pwsh\s/i,
  /^\s*zsh\s+-c\s/,
]

// ────────────────────────────────────────────────────────────────
// Command parsing (conservative fallback)
// ────────────────────────────────────────────────────────────────

export function parseCommandString(command: string): { executable: string; args: string[] } | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  const parts: string[] = []
  let current = ""
  let inQuote = false
  let quoteChar = ""

  for (const ch of trimmed) {
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false } else { current += ch }
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch
    } else if (ch === " " || ch === "\t") {
      if (current) { parts.push(current); current = "" }
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  if (parts.length === 0) return null
  return { executable: parts[0]!, args: parts.slice(1) }
}

// ────────────────────────────────────────────────────────────────
// Policy classification
// ────────────────────────────────────────────────────────────────

export function classifyCommand(
  executable: string,
  args: ReadonlyArray<string>,
  shellWrapped: boolean,
  inferredInvocation: boolean,
): { decision: "ELIGIBLE" | "REFUSED"; reason: string | null } {
  // Shell-wrapped commands are never replayed
  if (shellWrapped) {
    return { decision: "REFUSED", reason: "shell_wrapped" }
  }

  // Inferred (fallback-parsed) invocations carry lower assurance — refuse
  if (inferredInvocation) {
    return { decision: "REFUSED", reason: "inferred_invocation_not_authoritative" }
  }

  const programName = executable.includes("/") || executable.includes("\\")
    ? executable.split(/[/\\]/).pop()!
    : executable

  if (!ALLOWED_PROGRAMS.has(programName)) {
    return { decision: "REFUSED", reason: `program_not_allowed:${programName}` }
  }

  const allowedSubs = ALLOWED_SUBCOMMANDS[programName]
  if (allowedSubs && args.length > 0) {
    const sub = args[0]!
    if (!sub.startsWith("-") && !allowedSubs.has(sub)) {
      return { decision: "REFUSED", reason: `subcommand_not_allowed:${programName} ${sub}` }
    }
  }

  // Check args for dangerous patterns and secrets
  const fullCommand = [executable, ...args].join(" ")
  for (const p of SECRET_PATTERNS) {
    if (p.test(fullCommand)) return { decision: "REFUSED", reason: "contains_secret" }
  }
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(fullCommand)) return { decision: "REFUSED", reason: `dangerous_pattern:${p.source}` }
  }

  return { decision: "ELIGIBLE", reason: null }
}

function isShellWrapped(command: string): boolean {
  return SHELL_WRAPPERS.some(p => p.test(command))
}

// ────────────────────────────────────────────────────────────────
// Extraction from tool input
// ────────────────────────────────────────────────────────────────

export function extractReplayCallMetadata(
  toolName: string,
  toolInput: Record<string, unknown>,
): ReplayCallMetadata {
  const isTerminal = toolName === "terminal" || toolName === "execute" || toolName === "shell"

  if (!isTerminal) {
    return {
      executable: null,
      arguments: [],
      cwd: null,
      timeout: null,
      policyVersion: CURRENT_POLICY_VERSION,
      policyDecision: "NOT_APPLICABLE",
      refusalReason: null,
      inferredInvocation: false,
      shellWrapped: false,
    }
  }

  const command = typeof toolInput.command === "string" ? toolInput.command : null
  const cwd = typeof toolInput.cwd === "string" ? toolInput.cwd
    : typeof toolInput.workingDirectory === "string" ? toolInput.workingDirectory
    : typeof toolInput.directory === "string" ? toolInput.directory
    : null
  const timeout = typeof toolInput.timeout === "number" ? toolInput.timeout : null

  if (!command) {
    return {
      executable: null,
      arguments: [],
      cwd,
      timeout,
      policyVersion: CURRENT_POLICY_VERSION,
      policyDecision: "REFUSED",
      refusalReason: "no_command_in_input",
      inferredInvocation: false,
      shellWrapped: false,
    }
  }

  // Prefer structured invocation from the tool input
  const hasStructuredInvocation =
    typeof toolInput.executable === "string" &&
    Array.isArray(toolInput.arguments)

  let executable: string
  let args: ReadonlyArray<string>
  let inferredInvocation: boolean

  if (hasStructuredInvocation) {
    executable = toolInput.executable as string
    args = toolInput.arguments as string[]
    inferredInvocation = false
  } else {
    // Fallback: parse from shell text — lower assurance
    const parsed = parseCommandString(command)
    executable = parsed?.executable ?? ""
    args = parsed?.args ?? []
    inferredInvocation = true
  }

  const shellWrapped = isShellWrapped(command)
  const classification = classifyCommand(executable, args, shellWrapped, inferredInvocation)

  return {
    executable: executable || null,
    arguments: args,
    cwd,
    timeout,
    policyVersion: CURRENT_POLICY_VERSION,
    policyDecision: classification.decision,
    refusalReason: classification.reason,
    inferredInvocation,
    shellWrapped,
  }
}

// ────────────────────────────────────────────────────────────────
// Extraction from tool output (raw terminal boundary)
// ────────────────────────────────────────────────────────────────

const NORMALIZATION_PROFILE = "terminal-output-v1"

export function extractReplayReturnMetadata(
  toolInput: Record<string, unknown>,
  toolOutput: string,
  metadata: Record<string, unknown>,
  startTime: number | null,
  endTime: number,
): ReplayReturnMetadata {
  const exitCode = typeof metadata.exitCode === "number" ? metadata.exitCode
    : typeof toolInput.exitCode === "number" ? toolInput.exitCode
    : null

  // Raw boundary — from terminal execution, not UI transformation
  const rawStdout = typeof metadata.stdout === "string" ? metadata.stdout : toolOutput
  const rawStderr = typeof metadata.stderr === "string" ? metadata.stderr : ""

  const rawStdoutDigest = createHash("sha256").update(rawStdout).digest("hex")
  const rawStderrDigest = createHash("sha256").update(rawStderr).digest("hex")

  // Normalized: strip trailing whitespace, collapse multiple newlines
  const normalized = rawStdout.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
  const normalizedOutputDigest = createHash("sha256").update(normalized).digest("hex")

  const duration = startTime !== null ? endTime - startTime : null

  const timedOut = metadata.timedOut === true || metadata.timeout === true
  const timeoutStatus: "COMPLETED" | "TIMED_OUT" | "UNKNOWN" = timedOut
    ? "TIMED_OUT"
    : duration !== null
      ? "COMPLETED"
      : "UNKNOWN"

  return {
    exitCode,
    rawStdoutDigest,
    rawStderrDigest,
    normalizedOutputDigest,
    normalizationProfile: NORMALIZATION_PROFILE,
    duration,
    timeoutStatus,
  }
}
