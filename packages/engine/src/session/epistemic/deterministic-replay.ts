/**
 * Bounded deterministic replay: re-execute verifiable local commands
 * under validated constraints.
 *
 * Safety invariant:
 * Execute(c) ⟹ HistoricalPolicy(c)=ELIGIBLE ∧ CurrentPolicy(c)=ELIGIBLE
 *              ∧ EnvironmentCompatible(c) ∧ ¬ShellWrapped(c)
 *
 * P2 ⟺ P1 ∧ |R|>0 ∧ ∀r∈R: all conditions satisfied
 *      ∧ ¬UnauthorizedMutation
 *
 * Where R = declared replayable subset (ALL must succeed).
 */

import { createHash, randomUUID } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import type Database from "better-sqlite3"

import {
  classifyCommand,
  CURRENT_POLICY_VERSION,
  type ReplayCallMetadata,
  type ReplayReturnMetadata,
} from "./replay-metadata.js"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ReplayStepStatus =
  | "SUCCESS"
  | "FAILED"
  | "REFUSED"
  | "SKIPPED"
  | "EXCLUDED"   // not in declared replay subset

export interface PolicyDriftRecord {
  readonly originalPolicyVersion: string
  readonly originalDecision: string
  readonly currentPolicyVersion: string
  readonly currentDecision: string
  readonly policyDrift: boolean
}

export interface ReplayStepResult {
  readonly eventSequence: number
  readonly eventId: string
  readonly callID: string
  readonly command: string | null
  readonly executable: string | null
  readonly arguments: ReadonlyArray<string>
  readonly workingDirectory: string | null
  readonly status: ReplayStepStatus
  readonly refusalReason?: string

  readonly policyDrift: PolicyDriftRecord | null

  readonly originalExitCode?: number
  readonly replayExitCode?: number
  readonly exitCodeMatch?: boolean

  readonly originalOutputDigest?: string
  readonly replayOutputDigest?: string
  readonly outputDigestMatch?: boolean

  readonly replayDurationMs?: number
}

export interface ReplayCoverage {
  readonly replayableHistoricalSteps: number
  readonly declaredReplaySubset: number
  readonly successfullyReproduced: number
  readonly excluded: number
  readonly reproducibility: "FULL" | "PARTIAL" | "NONE" | "NOT_APPLICABLE"
}

export interface DeterministicReplayResult {
  readonly schemaVersion: "1"
  readonly replayId: string
  readonly sourceSessionId: string
  readonly sourceRunRoot: string

  readonly attemptedAt: string
  readonly environmentCompatibility: "COMPATIBLE" | "DRIFTED" | "UNKNOWN"

  readonly steps: ReadonlyArray<ReplayStepResult>
  readonly coverage: ReplayCoverage

  readonly status: "SUCCESS" | "PARTIAL" | "REFUSED" | "FAILED"
  readonly p2Eligible: boolean
  readonly refusalReasons: ReadonlyArray<string>
  readonly unauthorizedMutation: boolean
}

// ────────────────────────────────────────────────────────────────
// Workspace snapshot
// ────────────────────────────────────────────────────────────────

function snapshotWorkspace(dir: string, maxFiles: number = 1000): Map<string, string> {
  const files = new Map<string, string>()
  function walk(current: string, depth: number) {
    if (depth > 5 || files.size >= maxFiles) return
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        if (files.size >= maxFiles) break
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) {
          if (["node_modules", ".git", "dist", "build", ".cache", ".next"].includes(entry.name)) continue
          walk(fullPath, depth + 1)
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath)
            files.set(fullPath, createHash("sha256").update(content).digest("hex"))
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(dir, 0)
  return files
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): {
  modified: string[]; added: string[]; deleted: string[]
} {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  for (const [file, hash] of after) {
    const b = before.get(file)
    if (!b) added.push(file)
    else if (b !== hash) modified.push(file)
  }
  for (const file of before.keys()) {
    if (!after.has(file)) deleted.push(file)
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

function executeBoundedCommand(
  command: string,
  workingDirectory: string | null,
  timeoutMs: number = 30_000,
): { exitCode: number; stdout: string; stderr: string; durationMs: number } {
  const start = Date.now()
  let exitCode = 0
  let stdout = ""
  let stderr = ""
  try {
    stdout = execSync(command, {
      cwd: workingDirectory ?? process.cwd(),
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (err: any) {
    exitCode = err.status ?? 1
    stdout = err.stdout ?? ""
    stderr = err.stderr ?? ""
  }
  return { exitCode, stdout, stderr, durationMs: Date.now() - start }
}

// ────────────────────────────────────────────────────────────────
// Event pairing
// ────────────────────────────────────────────────────────────────

interface StoredEvent { id: string; sequence: number; type: string; payload: string }

interface PairedToolCall {
  callEvent: StoredEvent
  returnEvent: StoredEvent | null
  callReplay: ReplayCallMetadata | null
  returnReplay: ReplayReturnMetadata | null
}

function pairToolEvents(events: StoredEvent[]): PairedToolCall[] {
  const calls = new Map<string, StoredEvent>()
  const returns = new Map<string, StoredEvent>()

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

    const callReplay = (callPayload.replay as ReplayCallMetadata) ?? null
    const returnReplay = (returnPayload.replay as ReplayReturnMetadata) ?? null

    pairs.push({ callEvent, returnEvent, callReplay, returnReplay })
  }

  return pairs
}

// ────────────────────────────────────────────────────────────────
// Policy drift detection
// ────────────────────────────────────────────────────────────────

function evaluatePolicyDrift(callReplay: ReplayCallMetadata): PolicyDriftRecord {
  const currentEval = classifyCommand(
    callReplay.executable ?? "",
    callReplay.arguments,
    callReplay.shellWrapped,
    callReplay.inferredInvocation,
  )

  return {
    originalPolicyVersion: callReplay.policyVersion,
    originalDecision: callReplay.policyDecision,
    currentPolicyVersion: CURRENT_POLICY_VERSION,
    currentDecision: currentEval.decision,
    policyDrift: callReplay.policyDecision !== currentEval.decision,
  }
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

  const events = db.prepare(`
    SELECT id, sequence, type, payload FROM events WHERE session_id = ? ORDER BY sequence ASC
  `).all(sessionId) as StoredEvent[]

  const sourceRunRoot = events.length > 0
    ? createHash("sha256").update(sessionId).digest("hex")
    : ""

  const pairs = pairToolEvents(events)

  const steps: ReplayStepResult[] = []
  const refusalReasons: string[] = []
  let unauthorizedMutation = false

  // Coverage counters
  let replayableHistoricalSteps = 0
  let declaredReplaySubset = 0
  let successfullyReproduced = 0
  let excluded = 0

  for (const pair of pairs) {
    const cr = pair.callReplay
    const callID = (JSON.parse(pair.callEvent.payload) as Record<string, unknown>).callID as string ?? ""

    // No replay metadata → excluded
    if (!cr) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command: null,
        executable: null,
        arguments: [],
        workingDirectory: null,
        status: "EXCLUDED",
        refusalReason: "no replay metadata in event",
        policyDrift: null,
      })
      excluded++
      continue
    }

    const command = cr.executable ? [cr.executable, ...cr.arguments].join(" ") : null
    replayableHistoricalSteps++

    // Policy drift check: re-evaluate current policy
    const drift = evaluatePolicyDrift(cr)

    // Historical policy must have been ELIGIBLE
    if (cr.policyDecision !== "ELIGIBLE") {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "REFUSED",
        refusalReason: `historical policy: ${cr.refusalReason ?? cr.policyDecision}`,
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: historical ${cr.policyDecision}`)
      continue
    }

    // Current policy must also be ELIGIBLE
    if (drift.currentDecision !== "ELIGIBLE") {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "REFUSED",
        refusalReason: `current policy: ${drift.currentDecision} (policy drift detected)`,
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: current policy ${drift.currentDecision}`)
      continue
    }

    // At this point, command is in declared replay subset
    declaredReplaySubset++

    // Working directory required
    if (!cr.cwd) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: null,
        status: "REFUSED",
        refusalReason: "no working directory recorded",
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: no cwd`)
      continue
    }

    // Environment compatibility
    const envCompat = checkEnvironmentCompatibility(cr.executable, cr.cwd)
    if (envCompat !== "COMPATIBLE") {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "REFUSED",
        refusalReason: `environment ${envCompat.toLowerCase()}`,
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: env ${envCompat}`)
      continue
    }

    // Return data required
    const rr = pair.returnReplay
    if (!rr || rr.exitCode === null || !rr.normalizedOutputDigest) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "REFUSED",
        refusalReason: "no recorded exit code or output digest in tool.returned",
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: no return data`)
      continue
    }

    // Dry-run
    if (dryRun) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "SKIPPED",
        policyDrift: drift,
        originalExitCode: rr.exitCode,
        originalOutputDigest: rr.normalizedOutputDigest,
      })
      continue
    }

    // Snapshot before
    const beforeSnap = snapshotWorkspace(cr.cwd)

    // Execute
    try {
      const timeout = cr.timeout ?? 30_000
      const result = executeBoundedCommand(command!, cr.cwd, timeout)

      // Snapshot after
      const afterSnap = snapshotWorkspace(cr.cwd)
      const diff = diffSnapshots(beforeSnap, afterSnap)
      if (diff.modified.length > 0 || diff.added.length > 0 || diff.deleted.length > 0) {
        unauthorizedMutation = true
      }

      // Compute normalized digest from replay output
      const normalized = result.stdout.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
      const replayOutputDigest = createHash("sha256").update(normalized).digest("hex")

      const exitCodeMatch = result.exitCode === rr.exitCode
      const outputDigestMatch = replayOutputDigest === rr.normalizedOutputDigest

      if (exitCodeMatch && outputDigestMatch) {
        successfullyReproduced++
      }

      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: exitCodeMatch && outputDigestMatch ? "SUCCESS" : "FAILED",
        policyDrift: drift,
        originalExitCode: rr.exitCode,
        replayExitCode: result.exitCode,
        exitCodeMatch,
        originalOutputDigest: rr.normalizedOutputDigest,
        replayOutputDigest,
        outputDigestMatch,
        replayDurationMs: result.durationMs,
      })

      if (!exitCodeMatch || !outputDigestMatch) {
        refusalReasons.push(`seq ${pair.callEvent.sequence}: exit=${exitCodeMatch} output=${outputDigestMatch}`)
      }
    } catch (err: any) {
      steps.push({
        eventSequence: pair.callEvent.sequence,
        eventId: pair.callEvent.id,
        callID,
        command,
        executable: cr.executable,
        arguments: cr.arguments,
        workingDirectory: cr.cwd,
        status: "FAILED",
        refusalReason: `execution error: ${err.message}`,
        policyDrift: drift,
      })
      refusalReasons.push(`seq ${pair.callEvent.sequence}: execution error`)
    }
  }

  // Coverage
  const coverage: ReplayCoverage = {
    replayableHistoricalSteps,
    declaredReplaySubset,
    successfullyReproduced,
    excluded,
    reproducibility: declaredReplaySubset === 0
      ? "NOT_APPLICABLE"
      : successfullyReproduced === declaredReplaySubset
        ? "FULL"
        : successfullyReproduced > 0
          ? "PARTIAL"
          : "NONE",
  }

  // Overall status
  const replayedSteps = steps.filter(s => s.status === "SUCCESS" || s.status === "FAILED")
  const successSteps = steps.filter(s => s.status === "SUCCESS")
  const failedSteps = steps.filter(s => s.status === "FAILED")

  let status: "SUCCESS" | "PARTIAL" | "REFUSED" | "FAILED"
  if (replayedSteps.length === 0) status = "REFUSED"
  else if (failedSteps.length > 0) status = "FAILED"
  else if (successSteps.length === replayedSteps.length) status = "SUCCESS"
  else status = "PARTIAL"

  // P2: ALL declared subset must succeed + no unauthorized mutation
  const p2Eligible = declaredReplaySubset > 0
    && successfullyReproduced === declaredReplaySubset
    && !unauthorizedMutation

  // Environment
  const envStatuses = steps
    .filter(s => s.status !== "REFUSED" && s.status !== "SKIPPED" && s.status !== "EXCLUDED")
    .map(s => checkEnvironmentCompatibility(s.executable, s.workingDirectory))
  const environmentCompatibility = envStatuses.length === 0
    ? "UNKNOWN"
    : envStatuses.every(e => e === "COMPATIBLE") ? "COMPATIBLE" : "DRIFTED"

  return {
    schemaVersion: "1",
    replayId,
    sourceSessionId: sessionId,
    sourceRunRoot,
    attemptedAt: now,
    environmentCompatibility,
    steps,
    coverage,
    status,
    p2Eligible,
    refusalReasons,
    unauthorizedMutation,
  }
}
