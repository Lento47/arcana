// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
//
// Audit Replay — reconstruct what was recorded without rerunning anything.
// Derived read-only from immutable events and RunProof data.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { computeEventHash } from "@arcana/core/epistemic/event-hash"
import { computeRunRoot, verifyRunRoot } from "@arcana/engine/session/epistemic/run-proof"
import { deriveRunProof } from "./proof"

// ── Types ────────────────────────────────────────────────────────────

export type ReplaySchemaVersion = "1"

export type ReplayIntegrity = "VALID" | "INVALID" | "UNVERIFIED"
export type SourceVerification = "VALID" | "INVALID" | "UNAVAILABLE"

export interface AuditReplayEntry {
  sequence: number
  eventId: string
  timestamp: string
  actor: string
  type: string
  summary: string
  relationships: {
    contractId?: string
    claimId?: string
    obligationId?: string
    toolCallId?: string
  }
  integrity: ReplayIntegrity
  rawEventAvailable: boolean
}

export interface ReplayWarning {
  category: string
  sequence: number
  message: string
}

export interface AuditReplay {
  schemaVersion: ReplaySchemaVersion
  sessionId: string
  generatedAt: string

  source: {
    eventCount: number
    firstSequence?: number
    lastSequence?: number
    runRoot?: string
    proofHash?: string
  }

  verification: {
    exportConsistency: SourceVerification
    sourceEvents: SourceVerification
    globalChain: SourceVerification
    traceHealth: string
    lifecycle: string
  }

  timeline: AuditReplayEntry[]
  reconstructionWarnings: ReplayWarning[]
  limitations: string[]
}

// ── Constants ────────────────────────────────────────────────────────

const REPLAY_SCHEMA_VERSION: ReplaySchemaVersion = "1"

const STANDARD_LIMITATIONS = [
  "No tool was rerun.",
  "No model was called.",
  "No external state was checked.",
  "No claim was revalidated.",
  "Current correctness is unknown unless separate live revalidation exists.",
  "A valid historical trace can describe an historically incorrect result.",
  "Hash integrity is not actor authentication.",
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  "session.started": "session started",
  "session.completed": "session completed",
  "session.crashed": "session crashed",
  "contract.proposed": "contract proposed",
  "contract.activated": "contract activated",
  "contract.amended": "contract amended",
  "claim.created": "claim created",
  "claim.transitioned": "claim transitioned",
  "evidence.attached": "evidence attached",
  "obligation.created": "obligation created",
  "obligation.resolved": "obligation resolved",
  "tool.called": "tool called",
  "tool.returned": "tool returned",
  "completion.attempted": "completion attempted",
  "completion.resolved": "completion resolved",
}

// ── Event row type ───────────────────────────────────────────────────

type EventRow = {
  id: string; sequence: number; session_id: string | null; type: string
  actor_kind: string; actor_id: string; hash: string; previous_hash: string | null
  timestamp: string; payload: string
}

// ── Helpers ──────────────────────────────────────────────────────────

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

export function openDB(): Database {
  const dbPath = join(getDataDir(), "memory.db")
  return new Database(dbPath, { readonly: true })
}

// ── Core derivation ──────────────────────────────────────────────────

export function deriveAuditReplay(db: Database, sessionId: string): AuditReplay {
  const generatedAt = new Date().toISOString()

  // Query session events in global sequence order
  const rows = db.query<EventRow, [string]>(
    "SELECT id, sequence, session_id, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events WHERE session_id = ? ORDER BY sequence"
  ).all(sessionId)

  // Query ALL events for global chain verification
  const allRows = db.query<EventRow, []>(
    "SELECT id, sequence, session_id, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events ORDER BY sequence"
  ).all()

  // ── Source-event verification ─────────────────────────────────────
  // Verify each session event against stored global events
  let sourceEventsValid = rows.length > 0 // empty = UNAVAILABLE, not VALID
  const eventIntegrityMap = new Map<string, ReplayIntegrity>()

  for (const row of rows) {
    // Find in global store
    const stored = allRows.find((a) => a.id === row.id)
    if (!stored) {
      eventIntegrityMap.set(row.id, "UNVERIFIED")
      sourceEventsValid = false
      continue
    }

    // Verify session membership
    if (stored.session_id !== sessionId) {
      eventIntegrityMap.set(row.id, "INVALID")
      sourceEventsValid = false
      continue
    }

    // Verify hash
    const recomputed = computeEventHash({
      id: stored.id, sequence: stored.sequence, timestamp: stored.timestamp,
      previousHash: stored.previous_hash, actorKind: stored.actor_kind,
      actorId: stored.actor_id, type: stored.type, payload: stored.payload,
    })
    if (recomputed !== stored.hash) {
      eventIntegrityMap.set(row.id, "INVALID")
      sourceEventsValid = false
      continue
    }

    eventIntegrityMap.set(row.id, "VALID")
  }

  // ── Global chain verification ─────────────────────────────────────
  let globalChainValid = true
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i]!
    const recomputed = computeEventHash({
      id: r.id, sequence: r.sequence, timestamp: r.timestamp,
      previousHash: r.previous_hash, actorKind: r.actor_kind,
      actorId: r.actor_id, type: r.type, payload: r.payload,
    })
    if (recomputed !== r.hash) { globalChainValid = false; break }
    if (i > 0 && r.previous_hash !== allRows[i - 1]!.hash) { globalChainValid = false; break }
  }

  // ── Export consistency (recompute runRoot from session rows) ──────
  const runRoot = rows.length > 0
    ? computeRunRoot(sessionId, rows.map((r) => ({ sequence: r.sequence, id: r.id, hash: r.hash })))
    : undefined

  const runRootMatchesStore = rows.length > 0
    ? verifyRunRoot(sessionId, rows.map((r) => ({ sequence: r.sequence, id: r.id, hash: r.hash })), runRoot!)
    : false

  // ── Derive RunProof for verification data ─────────────────────────
  const proof = deriveRunProof(db, sessionId)

  // ── Timeline reconstruction ───────────────────────────────────────
  const timeline: AuditReplayEntry[] = []
  const warnings: ReplayWarning[] = []

  // Track pairs for analysis
  const toolCalls = new Map<string, { sequence: number; returned: boolean }>()
  const claimCreations = new Set<string>()
  const obligationCreations = new Set<string>()
  const seenIds = new Set<string>()
  let seenTerminal = false
  let seenStarted = false

  for (const row of rows) {
    // Duplicate check
    if (seenIds.has(row.id)) {
      warnings.push({ category: "duplicate", sequence: row.sequence, message: `duplicate event reference: ${row.id}` })
    }
    seenIds.add(row.id)

    const payload = (() => { try { return JSON.parse(row.payload) } catch { return {} } })()
    const integrity = eventIntegrityMap.get(row.id) ?? "UNVERIFIED"

    // Build summary
    const summary = buildEventSummary(row.type, payload)

    // Build relationships
    const relationships: AuditReplayEntry["relationships"] = {}
    if (payload?.contractId) relationships.contractId = payload.contractId
    if (payload?.claimId) relationships.claimId = payload.claimId
    if (payload?.obligationId) relationships.obligationId = payload.obligationId
    if (payload?.toolCallId) relationships.toolCallId = payload.toolCallId

    timeline.push({
      sequence: row.sequence,
      eventId: row.id,
      timestamp: row.timestamp,
      actor: `${row.actor_kind}/${row.actor_id}`,
      type: row.type,
      summary,
      relationships,
      integrity,
      rawEventAvailable: true,
    })

    // ── Pair and lifecycle analysis ───────────────────────────────
    if (row.type === "session.started") seenStarted = true

    if (row.type === "session.completed" || row.type === "session.crashed") {
      if (seenTerminal) {
        warnings.push({ category: "conflicting_terminal", sequence: row.sequence, message: "multiple terminal events" })
      }
      seenTerminal = true
    }

    if (seenTerminal && row.type !== "session.completed" && row.type !== "session.crashed") {
      warnings.push({ category: "post_terminal", sequence: row.sequence, message: "event after terminal completion" })
    }

    if (row.type === "tool.called") {
      toolCalls.set(payload?.toolCallId ?? row.id, { sequence: row.sequence, returned: false })
    }
    if (row.type === "tool.returned") {
      const callId = payload?.toolCallId ?? ""
      const call = toolCalls.get(callId)
      if (call) call.returned = true
      else warnings.push({ category: "orphan_return", sequence: row.sequence, message: "tool.returned without tool.called" })
    }

    if (row.type === "claim.created") claimCreations.add(payload?.claimId)
    if (row.type === "claim.transitioned") {
      if (!claimCreations.has(payload?.claimId)) {
        warnings.push({ category: "missing_creation", sequence: row.sequence, message: "claim.transitioned without claim.created" })
      }
    }

    if (row.type === "obligation.created") obligationCreations.add(payload?.obligationId)
    if (row.type === "obligation.resolved") {
      if (!obligationCreations.has(payload?.obligationId)) {
        warnings.push({ category: "missing_creation", sequence: row.sequence, message: "obligation.resolved without obligation.created" })
      }
    }

    if (row.type === "evidence.attached") {
      if (payload?.claimId && !claimCreations.has(payload.claimId)) {
        warnings.push({ category: "missing_target", sequence: row.sequence, message: "evidence attached to missing claim" })
      }
    }

    if (row.type === "completion.resolved") {
      // completion.resolved without prior completion.attempted
      const hasAttempt = rows.some((r) => r.type === "completion.attempted" && r.sequence < row.sequence)
      if (!hasAttempt) {
        warnings.push({ category: "missing_attempt", sequence: row.sequence, message: "completion.resolved without completion.attempted" })
      }
    }
  }

  // Check unmatched tool calls
  for (const [callId, info] of toolCalls) {
    if (!info.returned) {
      warnings.push({ category: "unmatched_call", sequence: info.sequence, message: `tool.called without tool.returned (${callId})` })
    }
  }

  if (!seenStarted && rows.length > 0) {
    warnings.push({ category: "missing_start", sequence: 0, message: "events exist but no session.started" })
  }

  if (seenStarted && !seenTerminal && rows.length > 0) {
    warnings.push({ category: "missing_terminal", sequence: rows[rows.length - 1]!.sequence, message: "session.started without terminal event" })
  }

  // ── Build result ─────────────────────────────────────────────────
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    sessionId,
    generatedAt,
    source: {
      eventCount: rows.length,
      firstSequence: rows.length > 0 ? rows[0]!.sequence : undefined,
      lastSequence: rows.length > 0 ? rows[rows.length - 1]!.sequence : undefined,
      runRoot,
      proofHash: proof.proofHash || undefined,
    },
    verification: {
      exportConsistency: runRootMatchesStore ? "VALID" : rows.length > 0 ? "INVALID" : "UNAVAILABLE",
      sourceEvents: sourceEventsValid ? "VALID" : rows.length > 0 ? "INVALID" : "UNAVAILABLE",
      globalChain: globalChainValid ? "VALID" : "INVALID",
      traceHealth: proof.traceHealth,
      lifecycle: proof.lifecycleStatus,
    },
    timeline,
    reconstructionWarnings: warnings,
    limitations: [...STANDARD_LIMITATIONS],
  }
}

// ── Event summary builder ────────────────────────────────────────────

function buildEventSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "session.started":
      return `agent: ${payload?.agent ?? "default"}`
    case "session.completed":
      return `reason: ${payload?.reason ?? "normal"}${payload?.steps ? `, steps: ${payload.steps}` : ""}`
    case "session.crashed":
      return `error: ${payload?.error ?? "unknown"}`
    case "contract.proposed":
      return `objective: ${payload?.objective ?? "unknown"}`
    case "contract.activated":
      return `contract ${payload?.contractId ?? "?"}`
    case "contract.amended":
      return `contract ${payload?.contractId ?? "?"}`
    case "claim.created":
      return `${payload?.proposition ?? "unknown claim"}`
    case "claim.transitioned":
      return `${payload?.claimId ?? "?"} → ${payload?.newStatus ?? "?"}`
    case "evidence.attached":
      return `claim ${payload?.claimId ?? "?"}`
    case "obligation.created":
      return `${payload?.description ?? "unknown"}${payload?.required ? " [required]" : ""}`
    case "obligation.resolved":
      return `${payload?.obligationId ?? "?"}: ${payload?.resolution ?? "?"}`
    case "tool.called":
      return `${payload?.tool ?? "unknown"}`
    case "tool.returned":
      return `${payload?.tool ?? "?"} → ${payload?.exitCode ?? "ok"}`
    case "completion.attempted":
      return `method: ${payload?.method ?? "unknown"}`
    case "completion.resolved":
      return `${payload?.method ?? "unknown"}`
    default:
      return type
  }
}

// ── Formatters ───────────────────────────────────────────────────────

export function formatTerminal(replay: AuditReplay): string {
  const lines: string[] = []

  // Derive proof level label from verification data
  const proofLabel = replay.verification.sourceEvents === "VALID" && replay.verification.globalChain === "VALID"
    ? "P1 INTEGRITY"
    : replay.verification.sourceEvents === "UNAVAILABLE"
      ? "P0 TRACE"
      : "P0 TRACE"

  lines.push(`audit replay    session ${replay.sessionId.slice(0, 12)}`)
  lines.push(`proof           ${proofLabel}`)
  lines.push(`source events   ${replay.verification.sourceEvents}`)
  lines.push(`global chain    ${replay.verification.globalChain}`)
  lines.push(`trace           ${replay.verification.traceHealth}`)
  lines.push(`lifecycle       ${replay.verification.lifecycle}`)
  lines.push("")

  // Timeline (compact)
  for (const entry of replay.timeline) {
    const seq = String(entry.sequence).padStart(4, " ")
    const typeLabel = (EVENT_TYPE_LABELS[entry.type] ?? entry.type).padEnd(22, " ")
    lines.push(`${seq}  ${typeLabel} ${entry.summary}`)
  }

  lines.push("")
  lines.push(`warnings         ${replay.reconstructionWarnings.length}`)

  // Tool pair stats
  const toolCalls = replay.timeline.filter((e) => e.type === "tool.called")
  const toolReturns = replay.timeline.filter((e) => e.type === "tool.returned")
  const unmatched = toolCalls.length - toolReturns.length
  lines.push(`tools             ${toolReturns.length} complete · ${unmatched} unmatched`)

  // Claim stats
  const claimsCreated = replay.timeline.filter((e) => e.type === "claim.created").length
  const claimTransitions = replay.timeline.filter((e) => e.type === "claim.transitioned")
  const verified = claimTransitions.filter((e) => e.summary.includes("verified")).length
  const assumed = claimTransitions.filter((e) => e.summary.includes("assumed")).length
  lines.push(`claims            ${claimsCreated} created · ${verified} verified · ${assumed} assumed`)

  // Obligation stats
  const oblCreated = replay.timeline.filter((e) => e.type === "obligation.created").length
  const oblResolved = replay.timeline.filter((e) => e.type === "obligation.resolved").length
  const unresolved = oblCreated - oblResolved
  lines.push(`obligations       ${oblResolved} satisfied · ${unresolved} unresolved`)

  lines.push("")
  lines.push("limitation:")
  lines.push("Historical execution reconstructed. No tools were rerun and current validity was not re-established.")

  return lines.join("\n")
}

export function formatJSON(replay: AuditReplay): string {
  return JSON.stringify(replay, null, 2)
}

export function formatMarkdown(replay: AuditReplay): string {
  const lines: string[] = []

  lines.push(`# Audit Replay — ${replay.sessionId}`)
  lines.push("")
  lines.push(`**Generated:** ${replay.generatedAt}`)
  lines.push(`**Schema:** v${replay.schemaVersion}`)
  lines.push("")

  lines.push("## Verification")
  lines.push("")
  lines.push(`- Export consistency: ${replay.verification.exportConsistency}`)
  lines.push(`- Source events: ${replay.verification.sourceEvents}`)
  lines.push(`- Global chain: ${replay.verification.globalChain}`)
  lines.push(`- Trace health: ${replay.verification.traceHealth}`)
  lines.push(`- Lifecycle: ${replay.verification.lifecycle}`)
  lines.push("")

  lines.push("## Timeline")
  lines.push("")
  for (const entry of replay.timeline) {
    const integrity = entry.integrity === "VALID" ? "✓" : entry.integrity === "INVALID" ? "✗" : "○"
    lines.push(`- \`${entry.sequence}\` ${integrity} **${EVENT_TYPE_LABELS[entry.type] ?? entry.type}** — ${entry.summary}`)
  }
  lines.push("")

  if (replay.reconstructionWarnings.length > 0) {
    lines.push("## Warnings")
    lines.push("")
    for (const w of replay.reconstructionWarnings) {
      lines.push(`- [${w.category}] seq ${w.sequence}: ${w.message}`)
    }
    lines.push("")
  }

  lines.push("## Limitations")
  lines.push("")
  for (const lim of replay.limitations) {
    lines.push(`- ${lim}`)
  }
  lines.push("")

  return lines.join("\n")
}

// ── Exports ──────────────────────────────────────────────────────────

export function exportAuditReplay(replay: AuditReplay, format: "json" | "markdown" | "md"): string {
  if (format === "json") return formatJSON(replay)
  return formatMarkdown(replay)
}

// ── CLI commands ─────────────────────────────────────────────────────

import type { CommandModule } from "yargs"
import { mkdirSync, writeFileSync } from "node:fs"

const auditCommand: CommandModule = {
  command: "audit [session-id]",
  describe: "Reconstruct session execution from immutable events",
  builder: (yargs) =>
    yargs
      .positional("session-id", { describe: "Session ID to replay", type: "string" })
      .option("format", {
        alias: "f",
        describe: "Output format",
        type: "string",
        choices: ["terminal", "json", "markdown", "md"],
        default: "terminal",
      })
      .option("output", {
        alias: "o",
        describe: "Output file path",
        type: "string",
      }),
  handler: (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string | undefined
      if (!sessionId) {
        console.log("Usage: arcana epistemic replay audit <session-id> [--format terminal|json|markdown]")
        return
      }

      const replay = deriveAuditReplay(db, sessionId)

      const format = (argv.format as string) ?? "terminal"
      let content: string
      if (format === "json") content = formatJSON(replay)
      else if (format === "markdown" || format === "md") content = formatMarkdown(replay)
      else content = formatTerminal(replay)

      const outputPath = argv.output as string | undefined
      if (outputPath) {
        // Atomic write
        const tmpPath = outputPath + ".tmp"
        writeFileSync(tmpPath, content, "utf-8")
        const { renameSync } = require("node:fs")
        renameSync(tmpPath, outputPath)
        console.log(`Exported to ${outputPath}`)
      } else {
        console.log(content)
      }
    } finally {
      db.close()
    }
  },
}

export const ReplayCommand: CommandModule = {
  command: "replay",
  describe: "Audit replay — reconstruct recorded execution",
  builder: (yargs) =>
    yargs
      .command(auditCommand)
      .demandCommand(),
  handler: () => {},
}
