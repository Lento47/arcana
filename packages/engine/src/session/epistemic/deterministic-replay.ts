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
 *      ∧ ¬UnauthorizedMutation
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
  | "SKIPPED"        // dry-run mode, not executed

export interface ReplayStepResult {
  readonly eventSequence: number
  readonly eventId: string
  readonly command: string | null
  readonly executable: string | null
  readonly arguments: ReadonlyArray<string>
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
  readonly policyDecision?: "ELIGIBLE" | "REFUSED" | "NOT_APPLICABLE"
}

export interface WorkspaceSnapshot {
  readonly files: Map<string, string> // path → SHA-256
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
  readonly unauthorizedMutation: boolean
}

// ────────────────────────────────────────────────────────────────
// Row type
// ────────────────────────────────────────────────────────────────

interface StoredEventRow {
  id: string
  sequence: number
  type: string
  payload: string
}

// ────────────────────────────────────────────────────────────────
// Workspace snapshot
// ────────────────────────────────────────────────────────────────

function snapshotWorkspace(dir: string, maxFiles: number = 1000): WorkspaceSnapshot {
  const files = new Map<string, string>()

  function walk(current: string, depth: number) {
    if (depth > 5 || files.size >= maxFiles) return
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        if (files.size >= maxFiles) break
        const fullPath = path.join(current, entry.name)
        // Skip node_modules, .git, dist, build
        if (entry.isDirectory()) {
          if (["node_modules", ".git", "dist", "build", ".cache", ".next"].includes(entry.name)) continue
          walk(fullPath, depth + 1)
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath)
            const hash = createHash("sha256").update(content).digest("hex")
            files.set(fullPath, hash)
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(dir, 0)
  return { files }
}

function diffSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): {
  modified: string[]
  added: string[]
  deleted: string[]
} {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const [file, hash] of after.files) {
    const beforeHash = before.files.get(file)
    if (!beforeHash) added.push(file)
    else if (beforeHash !== hash) modified.push(file)
  }

  for (const file of before.files.keys()) {
    if (!after.files.has(file)) deleted.push(file)
  }

  return { modified, added, deleted }
}

// ────────────────────────────────────────────────────────────────
// Environment compatibility
// ────────────────────────────────────────────────────────────────

export function checkEnvironmentCompatibility(
  executable: string | null,
  workingDirectory: string | null,
): "COMPATIBLE" | "DRIFTED" | "UNKNOWN" {
  if (workingDirectory && !fs.existsSync(workingDirectory)) return "DRIFTED"
  if (!executable) return "UNKNOWN"

  try {
    if (process.platform === "win32") {
      execSync(`where ${executable}`, { stdio: "pipe", timeout: 5000 })
    } else {
      execSync(`which ${executable}`, { stdio: "pipe", timeout: 5000 })
    }
  } catch {
    return "DRIFTED"
  }

  return "COMPATIBLE"
}

// ────────────────────────────────────────────────────────────────
// Bounded command execution
// ────────────────────────────────────────────────────────────────

export function executeBoundedCommand(
  command: string,
  workingDirectory: string | null,
  timeoutMs: number = 30_000,
): { exitCode: number; output: string; outputDigest: string; durationMs: number } {
  const start = Date.now()

  let exitCode = 0
  let output = ""
  try {
    output = execSync(command, {
      cwd: workingDirectory ?? process.cwd(),
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (err: any) {
    exitCode = err.status ?? 1
    output = err.stdout ?? ""
  }

  const durationMs = Date.now() - start
  const normalized = output.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
  const outputDigest = createHash("sha256").update(normalized).digest("hex")

  return { exitCode, output, outputDigest, durationMs }
}

// ────────────────────────────────────────────────────────────────
// Event pairing and metadata extraction
// ────────────────────────────────────────────────────────────────

interface PairedToolCall {
  callEvent: StoredEventRow
  returnEvent: StoredEventRow | null
  callPayload: Record<string, unknown>
  returnPayload: Record<string, unknown>
}

function pairToolEvents(events: StoredEventRow[]): PairedToolCall[] {
  const calls = new Map<string, StoredEventRow>()
  const returns = new Map<string, StoredEventRow>()

  for (const event of events) {
    if (event.type !== "tool.called" && event.type !== "tool.returned") continue
    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(event.payload) } catch { continue }
    const callID = typeof payload.callID === "string" ? payload.callID : null
    if (!callID) continue

    if (event.type === "tool.called") calls.set(callID, event)
    else returns.set(callID, event)
  }

  const pairs: PairedToolCall[] = []
  for (const [callID, callEvent] of calls) {
    const returnEvent = returns.get(callID) ?? null
    let callPayload: Record<string, unknown> = {}
    let returnPayload: Record<string, unknown> = {}
    try { callPayload = JSON.parse(callEvent.payload) } catch {}
    if (returnEvent) try { returnPayload = JSON.parse(returnEvent.payload) } catch {}

    pairs.push({ callEvent, returnEvent, callPayload, returnPayload })
  }

  return pairs
}

function extractCommandFromPair(pair: PairedToolCall): string | null {
  const replay = pair.callPayload.replay as Record<string, unknown> | undefined
  if (!replay) return null
  const executable = typeof replay.executable === "string" ? replay.executable : null
  const args = Array.isArray(replay.arguments) ? replay.arguments : []
  if (!executable) return null
  return [executable, ...args].join(" ")
}

function extractCwdFromPair(pair: PairedToolCall): string | null {
  const replay = pair.callPayload.replay as Record<string, unknown> | undefined
  if (!replay) return null
  return typeof replay.cwd === "string" ? replay.cwd : null
}

function extractPolicyDecision(pair: PairedToolCall): "ELIGIBLE" | "REFUSED" | "NOT_APPLICABLE" {
  const replay = pair.callPayload.replay as Record<string, unknown> | undefined
  if (!replay) return "NOT_APPLICABLE"
  const decision = replay.policyDecision
  if (decision === "ELIGIBLE" || decision === "REFUSED" || decision === "NOT_APPLICABLE") return decision
  return "NOT_APPLICABLE"
}

function extractOriginalExitCode(pair: PairedToolCall): number | null {
  const replay = pair.returnPayload.replay as Record<string, unknown> | undefined
  if (!replay) return null
  return typeof replay.exitCode === "number" ? replay.exitCode : null
}

function extractOriginalOutputDigest(pair: PairedToolCall): string | null {
  const replay = pair.returnPayload.replay as Record<string, unknown> | undefined
  if (!replay) return null
  return typeof replay.normalizedOutputDigest === "string" ? replay.normalizedOutputDigest : null
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
  const dryRun = opts?.dryRun ?? false

  // Load session events
  const events = db.prepare(`
    SELECT id, sequence, type, payload
    FROM events
    WHERE session_id = ?
    ORDER BY sequence ASC
  `).all(sessionId) as StoredEventRow[]

  // Compute source runRoot
  const sourceRunRoot = events.length > 0
    ? createHash("sha256").update(sessionId).digest("hex")
    : ""

  // Pair tool.called ↔ tool.returned
  const pairs = pairToolEvents(events)

  const steps: ReplayStepResult[] = []
  const refusalReasons: string[] = []
  let unauthorizedMutation = false

  for (const pair of pairs) {
    const command = extractCommandFromPair(pair)
    const cwd = extractCwdFromPair(pair)
    const policyDecision = extractPolicyDecision(pair)
    const replay = pair.callPayload.replay as Record<string, unknown> | undefined
    const executable = typeof replay?.executable === "string" ? replay.executable : null
    const args = Array.isArray(replay?.arguments) ? replay.arguments : []

    // Check 1: Is this tool call replayable?
    if (policyDecision !== "ELIGIBLE") {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "REFUSED",
        refusalReason: policyDecision === "REFUSED"
          ? `policy: ${typeof replay?.refusalReason === "string" ? replay.refusalReason : "refused"}`
          : "not applicable (non-terminal tool)",
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: ${policyDecision}`)
      continue
    }

    // Check 2: Command recorded?
    if (!command) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command: null,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "REFUSED",
        refusalReason: "no command in replay metadata",
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: no command`)
      continue
    }

    // Check 3: Working directory recorded?
    if (!cwd) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: null,
        status: "REFUSED",
        refusalReason: "no working directory recorded",
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: no cwd`)
      continue
    }

    // Check 4: Environment compatible?
    const envCompat = checkEnvironmentCompatibility(executable, cwd)
    if (envCompat !== "COMPATIBLE") {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "REFUSED",
        refusalReason: `environment ${envCompat.toLowerCase()}`,
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: env ${envCompat}`)
      continue
    }

    // Check 5: Original output recorded?
    const originalExitCode = extractOriginalExitCode(pair)
    const originalOutputDigest = extractOriginalOutputDigest(pair)
    if (originalExitCode === null || originalOutputDigest === null) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "REFUSED",
        refusalReason: "no recorded exit code or output digest in tool.returned",
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: no return data`)
      continue
    }

    // Dry-run: mark as SKIPPED
    if (dryRun) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "SKIPPED",
        originalExitCode,
        originalOutputDigest,
        policyDecision,
      })
      continue
    }

    // Snapshot workspace before
    const beforeSnapshot = snapshotWorkspace(cwd)

    // Execute
    try {
      const timeout = typeof replay?.timeout === "number" ? replay.timeout : 30_000
      const result = executeBoundedCommand(command, cwd, timeout)

      // Snapshot workspace after
      const afterSnapshot = snapshotWorkspace(cwd)
      const diff = diffSnapshots(beforeSnapshot, afterSnapshot)
      if (diff.modified.length > 0 || diff.added.length > 0 || diff.deleted.length > 0) {
        unauthorizedMutation = true
      }

      const exitCodeMatch = result.exitCode === originalExitCode
      const outputDigestMatch = result.outputDigest === originalOutputDigest

      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: exitCodeMatch && outputDigestMatch ? "SUCCESS" : "FAILED",
        originalExitCode,
        replayExitCode: result.exitCode,
        exitCodeMatch,
        originalOutputDigest,
        replayOutputDigest: result.outputDigest,
        outputDigestMatch,
        replayDurationMs: result.durationMs,
        policyDecision,
      })

      if (!exitCodeMatch || !outputDigestMatch) {
        refusalReasons.push(`seq ${pair.callEvent.sequence}: exit=${exitCodeMatch} output=${outputDigestMatch}`)
      }
    } catch (err: any) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        command,
        executable,
        arguments: args,
        workingDirectory: cwd,
        status: "FAILED",
        refusalReason: `execution error: ${err.message}`,
        policyDecision,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: execution error`)
    }
  }

  // Determine overall status
  const replayedSteps = steps.filter(s => s.status === "SUCCESS" || s.status === "FAILED")
  const refusedSteps = steps.filter(s => s.status === "REFUSED")
  const successSteps = steps.filter(s => s.status === "SUCCESS")
  const failedSteps = steps.filter(s => s.status === "FAILED")

  let status: "SUCCESS" | "PARTIAL" | "REFUSED" | "FAILED"
  if (replayedSteps.length === 0) {
    status = "REFUSED"
  } else if (failedSteps.length > 0) {
    status = "FAILED"
  } else if (successSteps.length === replayedSteps.length) {
    status = "SUCCESS"
  } else {
    status = "PARTIAL"
  }

  // P2 eligibility: ALL replayed steps succeed + no unauthorized mutation
  const p2Eligible = replayedSteps.length > 0
    && failedSteps.length === 0
    && successSteps.length === replayedSteps.length
    && !unauthorizedMutation

  // Environment compatibility
  const envStatuses = steps
    .filter(s => s.status !== "REFUSED" && s.status !== "SKIPPED")
    .map(s => checkEnvironmentCompatibility(s.executable, s.workingDirectory))
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
    unauthorizedMutation,
  }
}
