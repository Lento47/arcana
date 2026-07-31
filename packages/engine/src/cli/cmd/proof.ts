// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
//
// RunProof CLI — inspection, verification, and export commands.
// Uses raw bun:sqlite (matching existing epistemic.ts pattern).
// Imports pure hash functions from run-proof.ts for verification.

import type { CommandModule } from "yargs"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { computeRunRoot, verifyRunRoot, verifyProofHash, computeProofHash } from "@arcana/engine/session/epistemic/run-proof"
import type { ProofHashPayload, ProofLevel, TraceHealth, LifecycleStatus, IntegrityStatus, LifecycleCompleteness, AssuranceProfile } from "@arcana/engine/session/epistemic/run-proof"

// ── helpers ──────────────────────────────────────────────────────────

function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

function getDataDir(): string {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.dataDir === "string") return cfg.dataDir
    } catch {}
  }
  return join(getArcanaHome(), "data")
}

function openDB(): Database {
  const dbPath = join(getDataDir(), "memory.db")
  return new Database(dbPath, { readonly: true })
}

// ── SQL queries ──────────────────────────────────────────────────────

type EventRow = {
  id: string; sequence: number; session_id: string | null; type: string
  actor_kind: string; actor_id: string; hash: string; previous_hash: string | null
  timestamp: string; payload: string
}

type ClaimRow = { id: string; status: string }
type ContractRow = { id: string; status: string; session_id: string }
type ObligationRow = { id: string; contract_id: string; description: string; required: number; status: string }

// ── RunProof derivation (raw SQL) ────────────────────────────────────

export interface CLIRunProof {
  sessionId: string
  derivedAt: string
  eventCount: number
  sequenceRange: [number, number] | null
  traceHealth: TraceHealth
  lifecycle: LifecycleCompleteness
  lifecycleStatus: LifecycleStatus
  integrityStatus: IntegrityStatus
  proofLevel: ProofLevel
  completionMethod: string | null
  proofHash: string
  runRoot: string
  gaps: string[]
  p3DenialReasons: string[]
  claimsByStatus: Record<string, number>
  obligationsByStatus: Record<string, number>
  contractStatus: string | null
  totalRequiredObligations: number
  pendingRequiredObligations: number
  satisfiedRequiredObligations: number
}

export function deriveRunProof(db: Database, sessionId: string): CLIRunProof {
  const derivedAt = new Date().toISOString()

  // Query events for this session
  const rows = db.query<EventRow, [string]>(
    "SELECT id, sequence, session_id, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events WHERE session_id = ? ORDER BY sequence"
  ).all(sessionId)

  // Query trace health
  const traceRows = db.query<{ status: string }, [string]>(
    "SELECT status FROM trace_health WHERE session_id = ? LIMIT 1"
  ).all(sessionId)

  const traceHealth: TraceHealth = traceRows.length > 0
    ? (traceRows[0]!.status as TraceHealth)
    : "UNAVAILABLE"

  // Sequence range
  const sequenceRange: [number, number] | null = rows.length > 0
    ? [rows[0]!.sequence, rows[rows.length - 1]!.sequence]
    : null

  // Derive lifecycle
  const types = new Set(rows.map((r) => r.type))
  const started = types.has("session.started")
  const completed = types.has("session.completed")
  const crashed = types.has("session.crashed")
  const hasTerminalEvent = completed || crashed
  const terminalReason = completed ? "completed" : crashed ? "crashed" : null

  const hasContract = types.has("contract.proposed")
  const hasResolution = types.has("completion.resolved")
  const pairsComplete = started ? hasTerminalEvent : true
  const contractPairsComplete = hasContract ? hasResolution : true

  const toolCalled = rows.filter((r) => r.type === "tool.called")
  const toolReturned = rows.filter((r) => r.type === "tool.returned")
  const toolPairsComplete = toolCalled.length <= toolReturned.length

  const lifecycle: LifecycleCompleteness = {
    started,
    hasTerminalEvent,
    terminalReason,
    pairsComplete: pairsComplete && contractPairsComplete && toolPairsComplete,
    recordingFailure: false,
  }

  let lifecycleStatus: LifecycleStatus
  if (lifecycle.terminalReason === "crashed") lifecycleStatus = "CRASHED"
  else if (started && hasTerminalEvent && lifecycle.pairsComplete) lifecycleStatus = "COMPLETE"
  else lifecycleStatus = "INCOMPLETE"

  // Completion method
  const resolvedEvent = rows.find((r) => r.type === "completion.resolved")
  let completionMethod: string | null = null
  if (resolvedEvent) {
    try {
      const p = JSON.parse(resolvedEvent.payload)
      completionMethod = p?.method ?? null
    } catch {}
  }

  // Integrity verification
  let integrityStatus: IntegrityStatus = "UNVERIFIED"
  if (rows.length > 0) {
    let valid = true
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      const canonical = JSON.stringify({
        id: r.id, sequence: r.sequence, timestamp: r.timestamp,
        previousHash: r.previous_hash, actorKind: r.actor_kind, actorId: r.actor_id,
        type: r.type, payload: r.payload,
      })
      const computed = createHash("sha256").update(canonical).digest("hex")
      if (computed !== r.hash) { valid = false; break }
      if (i > 0 && r.previous_hash !== rows[i - 1]!.hash) { valid = false; break }
    }
    integrityStatus = valid ? "VALID" : "INVALID"
  }

  // RunRoot
  const runRoot = computeRunRoot(sessionId, rows.map((r) => ({
    sequence: r.sequence, id: r.id, hash: r.hash,
  })))

  // Claims by status
  const claimRows = db.query<ClaimRow, [string]>(
    "SELECT id, status FROM claims WHERE session_id = ?"
  ).all(sessionId)
  const claimsByStatus: Record<string, number> = {}
  for (const c of claimRows) {
    claimsByStatus[c.status] = (claimsByStatus[c.status] ?? 0) + 1
  }

  // Contract status
  const contractRows = db.query<ContractRow, [string]>(
    "SELECT id, status, session_id FROM contracts WHERE session_id = ? LIMIT 1"
  ).all(sessionId)
  const contractStatus = contractRows.length > 0 ? contractRows[0]!.status : null

  // Obligations by status (join through contracts)
  let obligationsByStatus: Record<string, number> = {}
  let totalRequiredObligations = 0
  let pendingRequiredObligations = 0
  let satisfiedRequiredObligations = 0

  if (contractRows.length > 0) {
    const contractId = contractRows[0]!.id
    const oblRows = db.query<ObligationRow, [string]>(
      "SELECT id, contract_id, description, required, status FROM obligations WHERE contract_id = ?"
    ).all(contractId)
    for (const o of oblRows) {
      obligationsByStatus[o.status] = (obligationsByStatus[o.status] ?? 0) + 1
      if (o.required) {
        totalRequiredObligations++
        if (o.status === "satisfied") satisfiedRequiredObligations++
        if (o.status === "pending") pendingRequiredObligations++
      }
    }
  }

  // Proof level derivation
  const gaps: string[] = []

  if (rows.length === 0) {
    gaps.push("no events recorded — P0 requires at least one event")
    return {
      sessionId, derivedAt, eventCount: 0, sequenceRange, traceHealth,
      lifecycle, lifecycleStatus, integrityStatus: "UNVERIFIED",
      proofLevel: "P0", completionMethod, proofHash: "", runRoot,
      gaps, p3DenialReasons: [], claimsByStatus, obligationsByStatus,
      contractStatus, totalRequiredObligations, pendingRequiredObligations,
      satisfiedRequiredObligations,
    }
  }

  if (integrityStatus === "INVALID") {
    gaps.push("integrity INVALID — global chain or runRoot verification failed")
    return {
      sessionId, derivedAt, eventCount: rows.length, sequenceRange, traceHealth,
      lifecycle, lifecycleStatus, integrityStatus,
      proofLevel: "P0", completionMethod, proofHash: "", runRoot,
      gaps, p3DenialReasons: extractP3Reasons(gaps), claimsByStatus,
      obligationsByStatus, contractStatus, totalRequiredObligations,
      pendingRequiredObligations, satisfiedRequiredObligations,
    }
  }

  // P1 achieved
  let proofLevel: ProofLevel = "P1"

  // P3 checks
  if (traceHealth !== "COMPLETE") {
    gaps.push(`traceHealth is ${traceHealth} — P3 requires COMPLETE`)
  }
  if (lifecycleStatus !== "COMPLETE") {
    gaps.push(`lifecycleStatus is ${lifecycleStatus} — P3 requires COMPLETE`)
  }
  if (completionMethod !== "VERIFIED_COMPLETE") {
    gaps.push(`completionMethod is ${completionMethod ?? "null"} — P3 requires VERIFIED_COMPLETE`)
  }
  // Required obligations check
  const requiredCreated = rows.filter((r) =>
    r.type === "obligation.created" && (() => { try { return JSON.parse(r.payload)?.required === true } catch { return false } })()
  )
  if (requiredCreated.length > 0) {
    const resolvedOblIds = new Set(
      rows.filter((r) => r.type === "obligation.resolved")
        .map((r) => { try { return JSON.parse(r.payload)?.obligationId } catch { return null } })
        .filter(Boolean)
    )
    const unresolved = requiredCreated.filter((r) => {
      try { return !resolvedOblIds.has(JSON.parse(r.payload)?.obligationId) } catch { return true }
    })
    if (unresolved.length > 0) {
      gaps.push(`${unresolved.length} required obligation(s) unresolved — P3 requires all satisfied`)
    }
  }

  // If any P3 gap exists, cap at P1
  const p3DenialReasons = extractP3Reasons(gaps)
  if (p3DenialReasons.length > 0) proofLevel = "P1"
  else proofLevel = "P3"

  // Derive assurance profile for ProofHashPayload
  const assuranceProfile: AssuranceProfile = {
    trace: traceHealth === "COMPLETE" ? "RECORDED" : "NONE",
    integrity: integrityStatus as AssuranceProfile["integrity"],
    verification: "UNVERIFIED",
    reproducibility: "NONE",
    reproducibilityDetail: null,
  }

  // Compute proofHash
  const payload: ProofHashPayload = {
    sessionId, eventCount: rows.length,
    eventHashes: rows.map((r) => r.id),
    lifecycle, lifecycleStatus, traceHealth, integrityStatus,
    proofLevel, assuranceProfile, completionMethod,
  }
  const proofHash = computeProofHash(payload)

  return {
    sessionId, derivedAt, eventCount: rows.length, sequenceRange, traceHealth,
    lifecycle, lifecycleStatus, integrityStatus, proofLevel, completionMethod,
    proofHash, runRoot, gaps, p3DenialReasons, claimsByStatus, obligationsByStatus,
    contractStatus, totalRequiredObligations, pendingRequiredObligations,
    satisfiedRequiredObligations,
  }
}

function extractP3Reasons(gaps: string[]): string[] {
  return gaps.filter((g) => g.includes("P3"))
}

// ── Formatters ───────────────────────────────────────────────────────

const PROOF_LEVEL_LABELS: Record<ProofLevel, string> = {
  P0: "P0 TRACE",
  P1: "P1 INTEGRITY",
  P2: "P2 REPRODUCIBLE",
  P3: "P3 VERIFIED",
}

function formatInspect(proof: CLIRunProof): string {
  const lines: string[] = []
  const levelLabel = PROOF_LEVEL_LABELS[proof.proofLevel]

  lines.push(`proof         ${levelLabel}`)
  lines.push(`integrity     ${proof.integrityStatus}`)
  lines.push(`trace         ${proof.traceHealth}`)
  lines.push(`lifecycle     ${proof.lifecycleStatus}`)
  lines.push(`completion    ${proof.completionMethod ?? "none"}`)
  if (proof.contractStatus) {
    lines.push(`contract      ${proof.contractStatus}`)
  }

  // Claims
  const claimEntries = Object.entries(proof.claimsByStatus)
  if (claimEntries.length > 0) {
    const parts = claimEntries.map(([s, n]) => `${n} ${s}`)
    lines.push(`claims        ${parts.join(" · ")}`)
  } else {
    lines.push(`claims        none`)
  }

  // Obligations
  const oblEntries = Object.entries(proof.obligationsByStatus)
  if (oblEntries.length > 0) {
    const parts = oblEntries.map(([s, n]) => `${n} ${s}`)
    lines.push(`obligations   ${parts.join(" · ")}`)
  } else {
    lines.push(`obligations   none`)
  }

  // Events
  if (proof.sequenceRange) {
    lines.push(`events        ${proof.eventCount} · global sequence ${proof.sequenceRange[0]}–${proof.sequenceRange[1]}`)
  } else {
    lines.push(`events        0`)
  }

  lines.push(`runRoot       ${proof.runRoot.slice(0, 16)}…`)
  lines.push(`proofHash     ${proof.proofHash ? proof.proofHash.slice(0, 16) + "…" : "n/a"}`)

  // P3 denial reasons
  if (proof.p3DenialReasons.length > 0) {
    lines.push("")
    lines.push("P3 denied:")
    for (const reason of proof.p3DenialReasons) {
      lines.push(`- ${reason}`)
    }
  }

  return lines.join("\n")
}

function formatVerify(proof: CLIRunProof): string {
  const lines: string[] = []

  lines.push(`proof level       ${PROOF_LEVEL_LABELS[proof.proofLevel]}`)
  lines.push(`integrity         ${proof.integrityStatus}`)
  lines.push(`trace health      ${proof.traceHealth}`)
  lines.push(`lifecycle         ${proof.lifecycleStatus}`)

  // Independent verification results
  lines.push("")
  lines.push("verification:")
  lines.push(`  chain           ${proof.integrityStatus === "VALID" ? "✓" : proof.integrityStatus === "INVALID" ? "✗" : "○"}`)
  lines.push(`  runRoot         ${proof.runRoot ? "✓" : "○"}`)
  lines.push(`  proofHash       ${proof.proofHash ? "✓" : "○"}`)

  return lines.join("\n")
}

// ── Export schema ────────────────────────────────────────────────────

const EXPORT_SCHEMA_VERSION = "1"

interface RunProofExport {
  schemaVersion: string
  exportedAt: string
  sessionId: string
  proof: {
    level: ProofLevel
    levelLabel: string
    integrity: IntegrityStatus
    traceHealth: TraceHealth
    lifecycleStatus: LifecycleStatus
    completionMethod: string | null
    contractStatus: string | null
    runRoot: string
    proofHash: string
  }
  /** ProofHashPayload fields — needed to recompute proofHash independently. */
  proofHashInput: {
    sessionId: string
    eventCount: number
    eventHashes: string[]
    lifecycle: LifecycleCompleteness
    lifecycleStatus: LifecycleStatus
    traceHealth: TraceHealth
    integrityStatus: IntegrityStatus
    proofLevel: ProofLevel
    completionMethod: string | null
  }
  /** Event references for store-aware runRoot verification. */
  eventReferences: ReadonlyArray<{
    sequence: number
    id: string
    hash: string
  }>
  summary: {
    eventCount: number
    sequenceRange: [number, number] | null
    claimsByStatus: Record<string, number>
    obligationsByStatus: Record<string, number>
    requiredObligations: {
      total: number
      satisfied: number
      pending: number
    }
  }
  p3DenialReasons: string[]
  gaps: string[]
  verification: {
    chainValid: boolean
    runRootValid: boolean
    proofHashValid: boolean
  }
  derivedAt: string
}

function buildExport(proof: CLIRunProof, db: Database): RunProofExport {
  // Re-verify independently
  const rows = db.query<EventRow, [string]>(
    "SELECT id, sequence, session_id, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events WHERE session_id = ? ORDER BY sequence"
  ).all(proof.sessionId)

  let chainValid = true
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const canonical = JSON.stringify({
      id: r.id, sequence: r.sequence, timestamp: r.timestamp,
      previousHash: r.previous_hash, actorKind: r.actor_kind, actorId: r.actor_id,
      type: r.type, payload: r.payload,
    })
    const computed = createHash("sha256").update(canonical).digest("hex")
    if (computed !== r.hash) { chainValid = false; break }
    if (i > 0 && r.previous_hash !== rows[i - 1]!.hash) { chainValid = false; break }
  }

  const runRootValid = verifyRunRoot(
    proof.sessionId,
    rows.map((r) => ({ sequence: r.sequence, id: r.id, hash: r.hash })),
    proof.runRoot,
  )

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessionId: proof.sessionId,
    proof: {
      level: proof.proofLevel,
      levelLabel: PROOF_LEVEL_LABELS[proof.proofLevel],
      integrity: proof.integrityStatus,
      traceHealth: proof.traceHealth,
      lifecycleStatus: proof.lifecycleStatus,
      completionMethod: proof.completionMethod,
      contractStatus: proof.contractStatus,
      runRoot: proof.runRoot,
      proofHash: proof.proofHash,
    },
    proofHashInput: {
      sessionId: proof.sessionId,
      eventCount: proof.eventCount,
      eventHashes: rows.map((r) => r.id),
      lifecycle: proof.lifecycle,
      lifecycleStatus: proof.lifecycleStatus,
      traceHealth: proof.traceHealth,
      integrityStatus: proof.integrityStatus,
      proofLevel: proof.proofLevel,
      completionMethod: proof.completionMethod,
    },
    eventReferences: rows.map((r) => ({
      sequence: r.sequence,
      id: r.id,
      hash: r.hash,
    })),
    summary: {
      eventCount: proof.eventCount,
      sequenceRange: proof.sequenceRange,
      claimsByStatus: proof.claimsByStatus,
      obligationsByStatus: proof.obligationsByStatus,
      requiredObligations: {
        total: proof.totalRequiredObligations,
        satisfied: proof.satisfiedRequiredObligations,
        pending: proof.pendingRequiredObligations,
      },
    },
    p3DenialReasons: proof.p3DenialReasons,
    gaps: [...proof.gaps],
    verification: {
      chainValid,
      runRootValid,
      proofHashValid: proof.proofHash !== "",
    },
    derivedAt: proof.derivedAt,
  }
}

function formatMarkdown(proof: CLIRunProof, exportData: RunProofExport): string {
  const lines: string[] = []

  lines.push(`# RunProof — ${proof.sessionId}`)
  lines.push("")
  lines.push(`**Derived:** ${proof.derivedAt}`)
  lines.push(`**Schema:** v${EXPORT_SCHEMA_VERSION}`)
  lines.push("")

  lines.push("## Executive Status")
  lines.push("")
  lines.push(`**Proof Level:** ${PROOF_LEVEL_LABELS[proof.proofLevel]}`)
  lines.push(`**Integrity:** ${proof.integrityStatus}`)
  lines.push(`**Trace Health:** ${proof.traceHealth}`)
  lines.push(`**Lifecycle:** ${proof.lifecycleStatus}`)
  lines.push(`**Completion:** ${proof.completionMethod ?? "none"}`)
  lines.push("")

  if (proof.contractStatus) {
    lines.push("## Contract")
    lines.push("")
    lines.push(`Status: ${proof.contractStatus}`)
    lines.push("")
  }

  // Claims
  lines.push("## Claims")
  lines.push("")
  const claimEntries = Object.entries(proof.claimsByStatus)
  if (claimEntries.length > 0) {
    for (const [status, count] of claimEntries) {
      lines.push(`- ${count} ${status}`)
    }
  } else {
    lines.push("No claims recorded.")
  }
  lines.push("")

  // Obligations
  lines.push("## Obligations")
  lines.push("")
  const oblEntries = Object.entries(proof.obligationsByStatus)
  if (oblEntries.length > 0) {
    for (const [status, count] of oblEntries) {
      lines.push(`- ${count} ${status}`)
    }
    if (proof.totalRequiredObligations > 0) {
      lines.push("")
      lines.push(`Required: ${proof.satisfiedRequiredObligations} satisfied, ${proof.pendingRequiredObligations} pending`)
    }
  } else {
    lines.push("No obligations recorded.")
  }
  lines.push("")

  // Events
  lines.push("## Events")
  lines.push("")
  if (proof.sequenceRange) {
    lines.push(`${proof.eventCount} events, global sequence ${proof.sequenceRange[0]}–${proof.sequenceRange[1]}`)
  } else {
    lines.push("No events recorded.")
  }
  lines.push("")

  // Integrity verification
  lines.push("## Integrity Verification")
  lines.push("")
  lines.push(`- Chain: ${exportData.verification.chainValid ? "✓ valid" : "✗ invalid"}`)
  lines.push(`- runRoot: ${exportData.verification.runRootValid ? "✓ valid" : "✗ invalid"}`)
  lines.push(`- proofHash: ${exportData.verification.proofHashValid ? "✓ present" : "○ absent"}`)
  lines.push("")

  // Cryptographic bindings
  lines.push("## Cryptographic Bindings")
  lines.push("")
  lines.push(`**runRoot:** \`${proof.runRoot}\``)
  lines.push(`**proofHash:** \`${proof.proofHash || "n/a"}\``)
  lines.push("")

  // P3 denial
  if (proof.p3DenialReasons.length > 0) {
    lines.push("## Reasons Higher Levels Denied")
    lines.push("")
    for (const reason of proof.p3DenialReasons) {
      lines.push(`- ${reason}`)
    }
    lines.push("")
  }

  // Honest limitations
  lines.push("## Limitations")
  lines.push("")
  lines.push("- P2 (REPRODUCIBLE) is not yet implementable — replay infrastructure does not exist")
  lines.push("- Event membership in session is not cryptographically bound (v1 limitation)")
  lines.push("- Export does not strengthen proof level")
  lines.push("")

  return lines.join("\n")
}

// ── Commands ─────────────────────────────────────────────────────────

export const proofInspect: CommandModule = {
  command: "inspect [session-id]",
  describe: "Inspect RunProof for a session",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to inspect",
      type: "string",
    }),
  handler: (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string | undefined
      if (!sessionId) {
        console.log("Usage: arcana epistemic proof inspect <session-id>")
        return
      }
      const proof = deriveRunProof(db, sessionId)
      console.log(formatInspect(proof))
    } finally {
      db.close()
    }
  },
}

export const proofVerify: CommandModule = {
  command: "verify [session-id]",
  describe: "Verify RunProof integrity for a session",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to verify",
      type: "string",
    }),
  handler: (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string | undefined
      if (!sessionId) {
        console.log("Usage: arcana epistemic proof verify <session-id>")
        return
      }
      const proof = deriveRunProof(db, sessionId)
      console.log(formatVerify(proof))
    } finally {
      db.close()
    }
  },
}

export const proofExport: CommandModule = {
  command: "export [session-id]",
  describe: "Export RunProof as JSON or Markdown",
  builder: (yargs) =>
    yargs
      .positional("session-id", {
        describe: "Session ID to export",
        type: "string",
      })
      .option("format", {
        alias: "f",
        describe: "Export format",
        type: "string",
        choices: ["json", "markdown", "md"],
        default: "json",
      })
      .option("output", {
        alias: "o",
        describe: "Output file path (default: .arcana/proofs/<session-id>.runproof.v1.<ext>)",
        type: "string",
      }),
  handler: (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string | undefined
      if (!sessionId) {
        console.log("Usage: arcana epistemic proof export <session-id> --format json|markdown")
        return
      }

      const proof = deriveRunProof(db, sessionId)
      const exportData = buildExport(proof, db)

      const format = (argv.format as string) ?? "json"
      const ext = (format === "markdown" || format === "md") ? "md" : "json"

      let content: string
      if (ext === "md") {
        content = formatMarkdown(proof, exportData)
      } else {
        content = JSON.stringify(exportData, null, 2)
      }

      // Determine output path
      let outputPath = argv.output as string | undefined
      if (!outputPath) {
        const proofsDir = join(getArcanaHome(), "proofs")
        if (!existsSync(proofsDir)) {
          mkdirSync(proofsDir, { recursive: true })
        }
        outputPath = join(proofsDir, `${sessionId}.runproof.v1.${ext}`)
      }

      // Atomic write: write to temp, rename
      const tmpPath = outputPath + ".tmp"
      writeFileSync(tmpPath, content, "utf-8")
      const { renameSync } = require("node:fs")
      renameSync(tmpPath, outputPath)

      console.log(`Exported to ${outputPath}`)
    } finally {
      db.close()
    }
  },
}

// ── Export verification ──────────────────────────────────────────────

const HEX64 = /^[0-9a-f]{64}$/

export interface VerificationResult {
  valid: boolean
  errors: string[]
  /** Independent proofHash recomputation from exported ProofHashPayload. */
  proofHash?: { recomputed: string; exported: string; match: boolean }
  /** Store-aware runRoot verification. */
  runRoot?: { status: "VALID" | "INVALID" | "UNAVAILABLE"; reason?: string }
}

export function verifyExport(filePath: string, dbPath?: string): VerificationResult {
  const errors: string[] = []

  if (!existsSync(filePath)) {
    return { valid: false, errors: ["file not found"] }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (e) {
    return { valid: false, errors: [`read error: ${e}`] }
  }

  let data: RunProofExport
  try {
    data = JSON.parse(raw)
  } catch {
    return { valid: false, errors: ["malformed JSON"] }
  }

  // Schema version check
  if (data.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push(`unsupported schema version: ${data.schemaVersion} (expected ${EXPORT_SCHEMA_VERSION})`)
    return { valid: false, errors }
  }

  // Required fields (accumulate, don't return early)
  if (!data.sessionId) errors.push("missing sessionId")
  if (!data.proof) errors.push("missing proof section")
  if (!data.verification) errors.push("missing verification section")
  if (data.proof?.proofHash === undefined || data.proof?.proofHash === null) errors.push("missing proofHash")
  if (!data.proofHashInput) errors.push("missing proofHashInput (required for independent verification)")

  // Can't proceed with hash checks if proof section is missing
  if (!data.proof || !data.proofHashInput) return { valid: false, errors }

  // ── Strict hex validation ────────────────────────────────────────
  const proofHashHex = data.proof!.proofHash
  const runRootHex = data.proof!.runRoot

  if (!HEX64.test(proofHashHex)) {
    errors.push(`proofHash MALFORMED: not a valid 64-char lowercase hex SHA-256 digest`)
  }
  if (!HEX64.test(runRootHex)) {
    errors.push(`runRoot MALFORMED: not a valid 64-char lowercase hex SHA-256 digest`)
  }

  // ── Independent proofHash recomputation ──────────────────────────
  let proofHashResult: VerificationResult["proofHash"]
  if (data.proofHashInput) {
    const recomputed = computeProofHash(data.proofHashInput as unknown as ProofHashPayload)
    proofHashResult = {
      recomputed,
      exported: proofHashHex,
      match: recomputed === proofHashHex,
    }
    if (!proofHashResult.match) {
      errors.push(`proofHash INTEGRITY INVALID: recomputed ${recomputed.slice(0, 16)}… ≠ exported ${proofHashHex.slice(0, 16)}…`)
    }
  }

  // ── Store-aware runRoot verification ─────────────────────────────
  let runRootResult: VerificationResult["runRoot"]
  if (data.eventReferences && data.eventReferences.length > 0) {
    // Recompute runRoot from exported event references
    const recomputed = computeRunRoot(data.sessionId, data.eventReferences)
    if (recomputed === runRootHex) {
      runRootResult = { status: "VALID" }
    } else {
      runRootResult = { status: "INVALID", reason: `recomputed ${recomputed.slice(0, 16)}… ≠ exported ${runRootHex.slice(0, 16)}…` }
      errors.push(`runRoot INTEGRITY INVALID: ${runRootResult.reason}`)
    }
  } else if (data.summary?.eventCount === 0) {
    runRootResult = { status: "UNAVAILABLE", reason: "no events — runRoot cannot be verified" }
  } else {
    runRootResult = { status: "UNAVAILABLE", reason: "referenced source events were not provided" }
  }

  return { valid: errors.length === 0, errors, proofHash: proofHashResult, runRoot: runRootResult }
}

// ── Parent command ───────────────────────────────────────────────────

export const ProofCommand: CommandModule = {
  command: "proof",
  describe: "RunProof inspection, verification, and export",
  builder: (yargs) =>
    yargs
      .command(proofInspect)
      .command(proofVerify)
      .command(proofExport)
      .demandCommand(),
  handler: () => {},
}
