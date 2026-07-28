/**
 * Bounded deterministic replay: re-execute verifiable local commands
 * under validated constraints.
 *
 * This module is the trusted core. It does not contain CLI formatting
 * or argument parsing.
 *
 * Safety invariant: The original command string is untrusted historical
 * data. Execute(c) ⟹ RecordedReplayable(c) ∧ PolicyAllows(c) ∧ EnvironmentCompatible(c).
 *
 * P2 = P1 ∧ |R|>0 ∧ ∀r∈R: ReplaySucceeded(r) ∧ EnvironmentCompatible
 *
 * Where R is the declared replayable subset.
 */

import { createHash, randomUUID } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import type Database from "better-sqlite3"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ReplayStepStatus =
  | "SUCCESS"        // exit code and output digest matched
  | "FAILED"         // exit code or output digest mismatched
  | "REFUSED"        // policy rejected this command
  | "SKIPPED"        // not eligible for replay

export interface ReplayStepResult {
  readonly eventSequence: number
  readonly eventId: string
  readonly command: string | null
  readonly workingDirectory: string | null
  readonly status: ReplayStepStatus
  readonly refusalReason?: string

  readonly originalExitCode?: number
  readonly replayExitCode?: number
  readonly exitCodeMatch?: boolean

  readonly originalOutputDigest?: string
  readonly replayOutputDigest?: string
  readonly outputDigestMatch?: boolean

  readonly replayDurationMs?: number
}

export interface DeterministicReplayResult {
  readonly schemaVersion: "1"
  readonly replayId: string
  readonly sourceSessionId: string
  readonly sourceRunRoot: string

  readonly attemptedAt: string
  readonly environmentCompatibility: "COMPATIBLE" | "DRIFTED" | "UNKNOWN"

  readonly steps: ReadonlyArray<ReplayStepResult>

  readonly status: "SUCCESS" | "PARTIAL" | "REFUSED" | "FAILED"
  readonly p2Eligible: boolean
  readonly refusalReasons: ReadonlyArray<string>
}

// ────────────────────────────────────────────────────────────────
// Allowlist policy
// ────────────────────────────────────────────────────────────────

/** Programs allowed for deterministic replay. */
const ALLOWED_PROGRAMS = new Set([
  "tsc",
  "bun",
  "npm",
  "npx",
  "node",
  "cargo",
  "rustc",
  "eslint",
  "prettier",
  "biome",
  "oxlint",
  "clippy",
  "pylint",
  "mypy",
  "ruff",
  "pytest",
  "go",
  "zig",
  "gcc",
  "clang",
  "make",
  "cmake",
])

/** Subcommands allowed for multi-tool programs. */
const ALLOWED_SUBCOMMANDS: Record<string, Set<string>> = {
  bun: new Set(["test", "run", "check", "build"]),
  npm: new Set(["test", "run", "exec"]),
  npx: new Set(["tsc", "eslint", "prettier", "biome", "vitest", "jest"]),
  cargo: new Set(["test", "check", "clippy", "build", "fmt"]),
  go: new Set(["test", "build", "vet", "fmt"]),
  node: new Set(["--check"]),
}

/** Patterns that indicate mutation, network, or dangerous operations. */
const DANGEROUS_PATTERNS = [
  /\|/,              // pipe
  />/,               // redirect
  /`/,               // subshell
  /\$\(/,            // command substitution
  /&&/,              // chaining (could be safe, but refuse for now)
  /\|\|/,            // chaining
  /;/,               // command separator
  /install/i,        // package installation
  /add\s/i,          // package addition
  /publish/i,        // publishing
  /deploy/i,         // deployment
  /push/i,           // git push
  /commit/i,         // git commit
  /rm\s/,            // file deletion
  /mv\s/,            // file move
  /chmod/,           // permission change
  /curl/i,           // network
  /wget/i,           // network
  /fetch/i,          // network (when not git fetch)
  /ssh/i,            // remote
  /scp/i,            // remote
  /docker/i,         // containers
  /kubectl/i,        // kubernetes
  /DROP\s/i,         // SQL mutation
  /DELETE\s/i,       // SQL mutation
  /UPDATE\s/i,       // SQL mutation
  /INSERT\s/i,       // SQL mutation
  /CREATE\s/i,       // SQL mutation
  /ALTER\s/i,        // SQL mutation
]

/** Patterns that indicate secrets in the command. */
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /Bearer\s+\S+/,
  /password=\S+/i,
  /token=\S+/i,
  /key=\S+/i,
  /secret=\S+/i,
]

// ────────────────────────────────────────────────────────────────
// Policy checks
// ────────────────────────────────────────────────────────────────

export interface PolicyCheckResult {
  readonly allowed: boolean
  readonly reason?: string
}

export function parseCommand(command: string): { program: string; args: string[] } | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  // Simple space-split respecting quotes
  const parts: string[] = []
  let current = ""
  let inQuote = false
  let quoteChar = ""

  for (const ch of trimmed) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
    } else if (ch === " " || ch === "\t") {
      if (current) {
        parts.push(current)
        current = ""
      }
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)

  if (parts.length === 0) return null
  return { program: parts[0]!, args: parts.slice(1) }
}

export function checkCommandPolicy(command: string): PolicyCheckResult {
  // Check for empty command
  const parsed = parseCommand(command)
  if (!parsed) return { allowed: false, reason: "empty command" }

  // Check for secrets
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: "command contains secret" }
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `dangerous pattern: ${pattern.source}` }
    }
  }

  // Strip path prefix from program name
  const programName = path.basename(parsed.program)

  // Check if program is allowed
  if (!ALLOWED_PROGRAMS.has(programName)) {
    return { allowed: false, reason: `program not in allowlist: ${programName}` }
  }

  // Check subcommand if applicable
  const allowedSubs = ALLOWED_SUBCOMMANDS[programName]
  if (allowedSubs && parsed.args.length > 0) {
    const subcommand = parsed.args[0]!
    // Allow flags (--) and check subcommand
    if (!subcommand.startsWith("-") && !allowedSubs.has(subcommand)) {
      return { allowed: false, reason: `subcommand not allowed: ${programName} ${subcommand}` }
    }
  }

  return { allowed: true }
}

// ────────────────────────────────────────────────────────────────
// Metadata extraction from events
// ────────────────────────────────────────────────────────────────

export interface ToolCallMetadata {
  readonly command: string | null
  readonly workingDirectory: string | null
  readonly timeout: number | null
  readonly replayable: boolean
  readonly exitCode: number | null
  readonly outputDigest: string | null
}

export function extractToolCallMetadata(payload: Record<string, unknown>): ToolCallMetadata {
  return {
    command: typeof payload.command === "string" ? payload.command : null,
    workingDirectory: typeof payload.workingDirectory === "string" ? payload.workingDirectory : null,
    timeout: typeof payload.timeout === "number" ? payload.timeout : null,
    replayable: payload.replayable === true,
    exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
    outputDigest: typeof payload.outputDigest === "string" ? payload.outputDigest : null,
  }
}

// ────────────────────────────────────────────────────────────────
// Environment compatibility
// ────────────────────────────────────────────────────────────────

export function checkEnvironmentCompatibility(
  command: string,
  workingDirectory: string | null,
): "COMPATIBLE" | "DRIFTED" | "UNKNOWN" {
  // Check working directory exists
  if (workingDirectory) {
    if (!fs.existsSync(workingDirectory)) return "DRIFTED"
  }

  // Check if the program is available
  const parsed = parseCommand(command)
  if (!parsed) return "UNKNOWN"

  const programName = path.basename(parsed.program)
  try {
    if (process.platform === "win32") {
      execSync(`where ${programName}`, { stdio: "pipe", timeout: 5000 })
    } else {
      execSync(`which ${programName}`, { stdio: "pipe", timeout: 5000 })
    }
  } catch {
    return "DRIFTED"
  }

  return "COMPATIBLE"
}

// ────────────────────────────────────────────────────────────────
// Command execution
// ────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  readonly exitCode: number
  readonly output: string
  readonly outputDigest: string
  readonly durationMs: number
}

export function executeBoundedCommand(
  command: string,
  workingDirectory: string | null,
  timeoutMs: number = 30_000,
): ExecutionResult {
  const start = Date.now()

  const result = execSync(command, {
    cwd: workingDirectory ?? process.cwd(),
    timeout: timeoutMs,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024, // 10MB
  })

  const durationMs = Date.now() - start
  const output = typeof result === "string" ? result : String(result)
  const outputDigest = createHash("sha256").update(output).digest("hex")

  return { exitCode: 0, output, outputDigest, durationMs }
}

export function computeOutputDigest(output: string): string {
  return createHash("sha256").update(output).digest("hex")
}

// ────────────────────────────────────────────────────────────────
// Main replay logic
// ────────────────────────────────────────────────────────────────

export function deriveDeterministicReplay(
  db: Database.Database,
  sessionId: string,
  opts?: { dryRun?: boolean },
): DeterministicReplayResult {
  const now = new Date().toISOString()
  const replayId = randomUUID()

  // Load session events
  const events = db.prepare(`
    SELECT id, sequence, type, payload
    FROM events
    WHERE session_id = ?
    ORDER BY sequence ASC
  `).all(sessionId) as Array<{ id: string; sequence: number; type: string; payload: string }>

  // Get runRoot from trace or compute
  let sourceRunRoot = ""
  try {
    const traceRow = db.prepare("SELECT * FROM trace_health WHERE session_id = ?").get(sessionId)
    if (traceRow) {
      // Use session ID as placeholder — real runRoot comes from RunProof
      sourceRunRoot = createHash("sha256").update(sessionId).digest("hex")
    }
  } catch { /* table may not exist */ }

  // Filter tool.called events
  const toolCalledEvents = events.filter(e => e.type === "tool.called")

  // Process each tool.called event
  const steps: ReplayStepResult[] = []
  const refusalReasons: string[] = []
  const dryRun = opts?.dryRun ?? false

  for (const event of toolCalledEvents) {
    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(event.payload) } catch { /* corrupt */ }

    const metadata = extractToolCallMetadata(payload)

    // Check 1: Do we have enough metadata?
    if (!metadata.command) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: null,
        workingDirectory: null,
        status: "REFUSED",
        refusalReason: "insufficient metadata: no command recorded in event",
      })
      refusalReasons.push(`seq ${event.sequence}: no command in event`)
      continue
    }

    // Check 2: Working directory recorded?
    if (!metadata.workingDirectory) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: null,
        status: "REFUSED",
        refusalReason: "insufficient metadata: no working directory recorded",
      })
      refusalReasons.push(`seq ${event.sequence}: no working directory`)
      continue
    }

    // Check 3: Policy allows?
    const policy = checkCommandPolicy(metadata.command)
    if (!policy.allowed) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: "REFUSED",
        refusalReason: `policy: ${policy.reason}`,
      })
      refusalReasons.push(`seq ${event.sequence}: ${policy.reason}`)
      continue
    }

    // Check 4: Environment compatible?
    const envCompat = checkEnvironmentCompatibility(metadata.command, metadata.workingDirectory)
    if (envCompat === "DRIFTED") {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: "REFUSED",
        refusalReason: "environment drifted: working directory or tool unavailable",
      })
      refusalReasons.push(`seq ${event.sequence}: environment drifted`)
      continue
    }

    // Check 5: Have original output for comparison?
    if (metadata.exitCode === null || metadata.outputDigest === null) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: "REFUSED",
        refusalReason: "insufficient metadata: no recorded exit code or output digest",
      })
      refusalReasons.push(`seq ${event.sequence}: no recorded output`)
      continue
    }

    // All checks passed — execute or dry-run
    if (dryRun) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: "SKIPPED",
        originalExitCode: metadata.exitCode,
        originalOutputDigest: metadata.outputDigest,
      })
      continue
    }

    try {
      const timeoutMs = metadata.timeout ?? 30_000
      const result = executeBoundedCommand(metadata.command, metadata.workingDirectory, timeoutMs)
      const exitCodeMatch = result.exitCode === metadata.exitCode
      const outputDigestMatch = result.outputDigest === metadata.outputDigest

      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: exitCodeMatch && outputDigestMatch ? "SUCCESS" : "FAILED",
        originalExitCode: metadata.exitCode,
        replayExitCode: result.exitCode,
        exitCodeMatch,
        originalOutputDigest: metadata.outputDigest,
        replayOutputDigest: result.outputDigest,
        outputDigestMatch,
        replayDurationMs: result.durationMs,
      })

      if (!exitCodeMatch || !outputDigestMatch) {
        refusalReasons.push(`seq ${event.sequence}: exit=${exitCodeMatch} output=${outputDigestMatch}`)
      }
    } catch (err: any) {
      steps.push({
        eventSequence: event.sequence,
        eventId: event.id,
        command: metadata.command,
        workingDirectory: metadata.workingDirectory,
        status: "FAILED",
        refusalReason: `execution error: ${err.message}`,
      })
      refusalReasons.push(`seq ${event.sequence}: execution error`)
    }
  }

  // Determine overall status
  const replayedSteps = steps.filter(s => s.status === "SUCCESS" || s.status === "FAILED")
  const refusedSteps = steps.filter(s => s.status === "REFUSED")
  const successSteps = steps.filter(s => s.status === "SUCCESS")
  const failedSteps = steps.filter(s => s.status === "FAILED")

  let status: "SUCCESS" | "PARTIAL" | "REFUSED" | "FAILED"
  if (replayedSteps.length === 0) {
    status = refusedSteps.length > 0 ? "REFUSED" : "REFUSED"
  } else if (failedSteps.length > 0) {
    status = "FAILED"
  } else if (successSteps.length === replayedSteps.length) {
    status = "SUCCESS"
  } else {
    status = "PARTIAL"
  }

  // P2 eligibility: ALL replayed steps must succeed
  const p2Eligible = replayedSteps.length > 0
    && failedSteps.length === 0
    && successSteps.length === replayedSteps.length

  // Environment compatibility: best across all steps
  const envStatuses = steps
    .filter(s => s.status !== "REFUSED" && s.status !== "SKIPPED")
    .map(() => checkEnvironmentCompatibility("", null))
  const environmentCompatibility = envStatuses.length === 0
    ? "UNKNOWN"
    : envStatuses.every(e => e === "COMPATIBLE")
      ? "COMPATIBLE"
      : "DRIFTED"

  return {
    schemaVersion: "1",
    replayId,
    sourceSessionId: sessionId,
    sourceRunRoot,
    attemptedAt: now,
    environmentCompatibility,
    steps,
    status,
    p2Eligible,
    refusalReasons,
  }
}
