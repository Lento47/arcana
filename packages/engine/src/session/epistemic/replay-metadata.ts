/**
 * Replay metadata extraction and policy classification.
 *
 * Used by processor.ts to enrich tool.called and tool.returned events
 * with structured replay data. Policy classification uses Arcana's
 * versioned allowlist — not a model-provided flag.
 */

import { createHash } from "node:crypto"

// ────────────────────────────────────────────────────────────────
// Replay metadata types
// ────────────────────────────────────────────────────────────────

export interface ReplayCallMetadata {
  readonly executable: string | null
  readonly arguments: ReadonlyArray<string>
  readonly cwd: string | null
  readonly timeout: number | null
  readonly policyDecision: "ELIGIBLE" | "REFUSED" | "NOT_APPLICABLE"
  readonly refusalReason: string | null
}

export interface ReplayReturnMetadata {
  readonly exitCode: number | null
  readonly stdoutDigest: string | null
  readonly stderrDigest: string | null
  readonly normalizedOutputDigest: string | null
  readonly duration: number | null
  readonly timeoutStatus: "COMPLETED" | "TIMED_OUT" | "UNKNOWN"
}

// ────────────────────────────────────────────────────────────────
// Allowlist policy (matches deterministic-replay.ts)
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

// ────────────────────────────────────────────────────────────────
// Command parsing
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

function classifyCommand(command: string): { decision: "ELIGIBLE" | "REFUSED"; reason: string | null } {
  // Check for secrets
  for (const p of SECRET_PATTERNS) {
    if (p.test(command)) return { decision: "REFUSED", reason: "contains_secret" }
  }

  // Check for dangerous patterns
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(command)) return { decision: "REFUSED", reason: `dangerous_pattern:${p.source}` }
  }

  const parsed = parseCommandString(command)
  if (!parsed) return { decision: "REFUSED", reason: "empty_command" }

  const programName = parsed.executable.includes("/") || parsed.executable.includes("\\")
    ? parsed.executable.split(/[/\\]/).pop()!
    : parsed.executable

  if (!ALLOWED_PROGRAMS.has(programName)) {
    return { decision: "REFUSED", reason: `program_not_allowed:${programName}` }
  }

  const allowedSubs = ALLOWED_SUBCOMMANDS[programName]
  if (allowedSubs && parsed.args.length > 0) {
    const sub = parsed.args[0]!
    if (!sub.startsWith("-") && !allowedSubs.has(sub)) {
      return { decision: "REFUSED", reason: `subcommand_not_allowed:${programName} ${sub}` }
    }
  }

  return { decision: "ELIGIBLE", reason: null }
}

// ────────────────────────────────────────────────────────────────
// Extraction from tool input
// ────────────────────────────────────────────────────────────────

export function extractReplayCallMetadata(
  toolName: string,
  toolInput: Record<string, unknown>,
): ReplayCallMetadata {
  // Only terminal/exec tools have replayable commands
  const isTerminal = toolName === "terminal" || toolName === "execute" || toolName === "shell"

  if (!isTerminal) {
    return {
      executable: null,
      arguments: [],
      cwd: null,
      timeout: null,
      policyDecision: "NOT_APPLICABLE",
      refusalReason: null,
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
      policyDecision: "REFUSED",
      refusalReason: "no_command_in_input",
    }
  }

  const parsed = parseCommandString(command)
  const classification = classifyCommand(command)

  return {
    executable: parsed?.executable ?? null,
    arguments: parsed?.args ?? [],
    cwd,
    timeout,
    policyDecision: classification.decision,
    refusalReason: classification.reason,
  }
}

// ────────────────────────────────────────────────────────────────
// Extraction from tool output
// ────────────────────────────────────────────────────────────────

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

  const stdout = typeof metadata.stdout === "string" ? metadata.stdout : toolOutput
  const stderr = typeof metadata.stderr === "string" ? metadata.stderr : ""

  const stdoutDigest = createHash("sha256").update(stdout).digest("hex")
  const stderrDigest = createHash("sha256").update(stderr).digest("hex")

  // Normalized: strip trailing whitespace, collapse multiple newlines
  const normalized = stdout.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
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
    stdoutDigest,
    stderrDigest,
    normalizedOutputDigest,
    duration,
    timeoutStatus,
  }
}
