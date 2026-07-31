/**
 * Audit replay: read-only reconstruction of recorded session history.
 *
 * This module is the trusted derivation core. It does not contain
 * CLI formatting, argument parsing, or output writing.
 *
 * Schema: uses the same `events` table as the real system:
 *   id, sequence, session_id, timestamp, previous_hash, hash,
 *   actor_kind, actor_id, type, payload
 *
 * Invariant: Audit replay proves only what was recorded. It does not
 * prove that the historical conclusion remains correct today.
 */

import { createHash } from "node:crypto"
import type { Database } from "bun:sqlite"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ReplaySeverity = "error" | "warning" | "info"

export interface ReplayWarning {
  readonly severity: ReplaySeverity
  readonly category: string
  readonly message: string
  readonly relatedSequence?: number
}

export interface AuditReplayEntry {
  readonly sequence: number
  readonly eventId: string
  readonly timestamp: string
  readonly actor: string
  readonly type: string
  readonly summary: string
  readonly relationships: {
    readonly contractId?: string
    readonly claimId?: string
    readonly obligationId?: string
    readonly toolCallId?: string
  }
  readonly integrity: "VALID" | "INVALID" | "UNVERIFIED"
  readonly rawEventAvailable: boolean
}

export interface AuditReplay {
  readonly schemaVersion: "1"
  readonly sessionId: string
  readonly generatedAt: string

  readonly source: {
    readonly eventCount: number
    readonly firstSequence?: number
    readonly lastSequence?: number
    readonly runRoot?: string
    readonly proofHash?: string
  }

  readonly verification: {
    readonly exportConsistency: "VALID" | "INVALID" | "UNAVAILABLE"
    readonly sourceEvents: "VALID" | "INVALID" | "MISMATCH" | "UNAVAILABLE"
    readonly globalChain: "VALID" | "INVALID" | "UNAVAILABLE"
    readonly traceHealth: "COMPLETE" | "DEGRADED" | "INCOMPLETE"
    readonly lifecycle: "COMPLETE" | "CRASHED" | "TIMED_OUT" | "INCOMPLETE"
  }

  readonly timeline: ReadonlyArray<AuditReplayEntry>
  readonly reconstructionWarnings: ReadonlyArray<ReplayWarning>
  readonly limitations: ReadonlyArray<string>
}

// ────────────────────────────────────────────────────────────────
// Row type matching real schema
// ────────────────────────────────────────────────────────────────

interface StoredEventRow {
  id: string
  sequence: number
  session_id: string | null
  timestamp: string
  previous_hash: string | null
  hash: string
  actor_kind: string
  actor_id: string
  type: string
  payload: string
}

// ────────────────────────────────────────────────────────────────
// Canonical event hash (matches event-hash.ts exactly)
// ────────────────────────────────────────────────────────────────

export function computeEventHash(input: {
  id: string
  sequence: number
  timestamp: string
  previousHash: string | null
  actorKind: string
  actorId: string
  type: string
  payload: string
}): string {
  const canonical = JSON.stringify({
    id: input.id,
    sequence: input.sequence,
    timestamp: input.timestamp,
    previousHash: input.previousHash,
    actorKind: input.actorKind,
    actorId: input.actorId,
    type: input.type,
    payload: input.payload,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

function recomputeRowHash(row: StoredEventRow): string {
  return computeEventHash({
    id: row.id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    previousHash: row.previous_hash,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    type: row.type,
    payload: row.payload,
  })
}

// ────────────────────────────────────────────────────────────────
// Source-event verification
// ────────────────────────────────────────────────────────────────

export interface VerifiedEvent {
  readonly row: StoredEventRow
  readonly isValid: boolean
  readonly isValidSessionMember: boolean
}

export function verifySourceEvents(
  db: Database,
  sessionId: string,
  eventRefs: ReadonlyArray<{ readonly eventId: string; readonly sequence: number; readonly hash: string }>,
): { events: VerifiedEvent[]; status: "VALID" | "INVALID" | "MISMATCH" | "UNAVAILABLE" } {
  const stmt = db.prepare(`
    SELECT id, sequence, session_id, timestamp, previous_hash, hash,
           actor_kind, actor_id, type, payload
    FROM events WHERE id = ?
  `)

  const events: VerifiedEvent[] = []
  let hasInvalid = false

  for (const ref of eventRefs) {
    const row = stmt.get(ref.eventId) as StoredEventRow | undefined
    if (!row) {
      events.push({
        row: {
          id: ref.eventId, sequence: ref.sequence, session_id: null,
          timestamp: "", previous_hash: null, hash: ref.hash,
          actor_kind: "", actor_id: "", type: "missing", payload: "{}",
        },
        isValid: false,
        isValidSessionMember: false,
      })
      hasInvalid = true
      continue
    }

    // Verify hash matches ref
    const hashMatch = row.hash === ref.hash
    // Verify session membership
    const sessionMatch = row.session_id === sessionId
    // Verify event hash independently
    const recomputedHash = recomputeRowHash(row)
    const hashValid = recomputedHash === row.hash
    // Verify sequence
    const seqMatch = row.sequence === ref.sequence

    if (!hashMatch || !sessionMatch || !hashValid || !seqMatch) {
      hasInvalid = true
    }

    events.push({
      row,
      isValid: hashValid && hashMatch && seqMatch,
      isValidSessionMember: sessionMatch,
    })
  }

  if (eventRefs.length === 0) return { events, status: "UNAVAILABLE" }
  if (hasInvalid) return { events, status: "INVALID" }
  return { events, status: "VALID" }
}

// ────────────────────────────────────────────────────────────────
// Timeline analysis
// ────────────────────────────────────────────────────────────────

function summarizeEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "session.started":
      return "Session started"
    case "session.completed":
      return `Session completed: ${String(payload.reason ?? "unknown")}`
    case "session.crashed":
      return `Session crashed: ${String(payload.error ?? "unknown error")}`
    case "contract.proposed":
      return "Contract proposed"
    case "contract.activated":
      return `Contract activated: ${String(payload.contractId ?? "")}`
    case "contract.amended":
      return "Contract amended"
    case "claim.created":
      return `Claim created: ${String(payload.claimId ?? "")} [${String(payload.level ?? "")}]`
    case "claim.transitioned":
      return `Claim ${String(payload.claimId ?? "")} → ${String(payload.newLevel ?? payload.newStatus ?? "")}`
    case "evidence.attached":
      return `Evidence attached to ${String(payload.claimId ?? "")}`
    case "obligation.created":
      return `Obligation created: ${String(payload.obligationId ?? "")}`
    case "obligation.resolved":
      return `Obligation resolved: ${String(payload.obligationId ?? "")}`
    case "tool.called":
      return `Tool called: ${String(payload.tool ?? payload.toolName ?? "unknown")}`
    case "tool.returned":
      return `Tool returned: exit ${String(payload.exitCode ?? "?")}`
    case "completion.attempted":
      return `Completion attempted: ${String(payload.method ?? payload.reason ?? "")}`
    case "completion.resolved":
      return `Completion resolved: ${String(payload.method ?? "")}`
    default:
      return type
  }
}

function resolveActor(type: string): string {
  if (type.startsWith("session.")) return "runtime"
  if (type.startsWith("tool.")) return "tool"
  if (type.startsWith("completion.")) return "completion"
  if (type.startsWith("contract.")) return "contract"
  if (type.startsWith("claim.") || type === "evidence.attached") return "claim"
  if (type.startsWith("obligation.")) return "obligation"
  return "system"
}

export function analyzeTimeline(events: ReadonlyArray<VerifiedEvent>): AuditReplayEntry[] {
  return events
    .filter(e => e.isValidSessionMember)
    .sort((a, b) => a.row.sequence - b.row.sequence)
    .map(e => {
      let payload: Record<string, unknown> = {}
      try { payload = JSON.parse(e.row.payload) } catch { /* corrupt payload */ }
      return {
        sequence: e.row.sequence,
        eventId: e.row.id,
        timestamp: e.row.timestamp,
        actor: resolveActor(e.row.type),
        type: e.row.type,
        summary: summarizeEvent(e.row.type, payload),
        relationships: {
          contractId: typeof payload.contractId === "string" ? payload.contractId : undefined,
          claimId: typeof payload.claimId === "string" ? payload.claimId : undefined,
          obligationId: typeof payload.obligationId === "string" ? payload.obligationId : undefined,
          toolCallId: typeof payload.callId === "string" ? payload.callId : undefined,
        },
        integrity: e.isValid ? "VALID" as const : "INVALID" as const,
        rawEventAvailable: true,
      }
    })
}

// ────────────────────────────────────────────────────────────────
// Pair and lifecycle analysis
// ────────────────────────────────────────────────────────────────

export function detectIncompletePairs(entries: ReadonlyArray<AuditReplayEntry>): ReplayWarning[] {
  const warnings: ReplayWarning[] = []
  const toolCalls = new Map<string, number>()
  const toolReturns = new Map<string, number>()
  let completionAttempts = 0
  let completionResolutions = 0
  let hasSessionStart = false
  const terminalEvents: AuditReplayEntry[] = []

  for (const entry of entries) {
    switch (entry.type) {
      case "session.started":
        hasSessionStart = true
        break
      case "session.completed":
      case "session.crashed":
        terminalEvents.push(entry)
        break
      case "tool.called": {
        const callId = entry.relationships.toolCallId ?? `seq-${entry.sequence}`
        toolCalls.set(callId, entry.sequence)
        break
      }
      case "tool.returned": {
        const callId = entry.relationships.toolCallId ?? `seq-${entry.sequence}`
        toolReturns.set(callId, entry.sequence)
        break
      }
      case "completion.attempted":
        completionAttempts++
        break
      case "completion.resolved":
        completionResolutions++
        break
    }
  }

  // Unmatched tool calls
  for (const [callId, seq] of toolCalls) {
    if (!toolReturns.has(callId)) {
      warnings.push({
        severity: "warning",
        category: "unmatched_call",
        message: "tool.called without tool.returned",
        relatedSequence: seq,
      })
    }
  }
  for (const [callId, seq] of toolReturns) {
    if (!toolCalls.has(callId)) {
      warnings.push({
        severity: "warning",
        category: "orphan_return",
        message: "tool.returned without tool.called",
        relatedSequence: seq,
      })
    }
  }

  // Completion without resolution
  if (completionAttempts > 0 && completionResolutions === 0) {
    warnings.push({
      severity: "warning",
      category: "missing_resolution",
      message: `${completionAttempts} completion attempt(s) with no resolution`,
    })
  }

  // Completion resolved without attempt
  if (completionResolutions > 0 && completionAttempts === 0) {
    warnings.push({
      severity: "warning",
      category: "missing_attempt",
      message: "completion.resolved without prior completion.attempted",
    })
  }

  // No session start
  if (!hasSessionStart && entries.length > 0) {
    warnings.push({
      severity: "error",
      category: "missing_terminal",
      message: "Timeline contains events but no session.started",
    })
  }

  // No terminal event
  if (hasSessionStart && terminalEvents.length === 0) {
    warnings.push({
      severity: "warning",
      category: "missing_terminal",
      message: "session.started without terminal event",
    })
  }

  // Multiple terminal events
  if (terminalEvents.length > 1) {
    warnings.push({
      severity: "error",
      category: "conflicting_terminal",
      message: `${terminalEvents.length} terminal events found (sequences: ${terminalEvents.map(e => e.sequence).join(", ")})`,
    })
  }

  // Events after terminal
  if (terminalEvents.length > 0) {
    const lastTerminal = terminalEvents[terminalEvents.length - 1]
    const afterTerminal = entries.filter(e => e.sequence > lastTerminal.sequence)
    if (afterTerminal.length > 0) {
      warnings.push({
        severity: "warning",
        category: "post_terminal",
        message: `${afterTerminal.length} event(s) after terminal event at sequence ${lastTerminal.sequence}`,
      })
    }
  }

  return warnings
}

export function detectDuplicateReferences(entries: ReadonlyArray<AuditReplayEntry>): ReplayWarning[] {
  const warnings: ReplayWarning[] = []
  const seen = new Map<string, number>()
  for (const entry of entries) {
    const existing = seen.get(entry.eventId)
    if (existing !== undefined) {
      warnings.push({
        severity: "error",
        category: "duplicate",
        message: `Event ${entry.eventId} appears at both sequence ${existing} and ${entry.sequence}`,
      })
    } else {
      seen.set(entry.eventId, entry.sequence)
    }
  }
  return warnings
}

export function detectClaimObligationIssues(entries: ReadonlyArray<AuditReplayEntry>): ReplayWarning[] {
  const warnings: ReplayWarning[] = []
  const claimsCreated = new Set<string>()
  const obligationsCreated = new Set<string>()

  for (const entry of entries) {
    const claimId = entry.relationships.claimId
    const obligationId = entry.relationships.obligationId

    if (entry.type === "claim.created" && claimId) claimsCreated.add(claimId)
    if (entry.type === "claim.transitioned" && claimId && !claimsCreated.has(claimId)) {
      warnings.push({ severity: "warning", category: "claim_mismatch", message: "claim.transitioned without claim.created" })
    }
    if (entry.type === "evidence.attached" && claimId && !claimsCreated.has(claimId)) {
      warnings.push({ severity: "warning", category: "claim_mismatch", message: "evidence attached to unknown claim" })
    }
    if (entry.type === "obligation.created" && obligationId) obligationsCreated.add(obligationId)
    if (entry.type === "obligation.resolved" && obligationId && !obligationsCreated.has(obligationId)) {
      warnings.push({ severity: "warning", category: "obligation_mismatch", message: "obligation.resolved without obligation.created" })
    }
  }

  return warnings
}

// ────────────────────────────────────────────────────────────────
// Global chain verification
// ────────────────────────────────────────────────────────────────

export function verifyGlobalChain(db: Database): "VALID" | "INVALID" | "UNAVAILABLE" {
  const events = db.prepare(`
    SELECT id, sequence, session_id, timestamp, previous_hash, hash,
           actor_kind, actor_id, type, payload
    FROM events ORDER BY sequence ASC
  `).all() as StoredEventRow[]

  if (events.length === 0) return "VALID"

  // Verify every event's hash integrity
  for (const event of events) {
    const recomputedHash = recomputeRowHash(event)
    if (recomputedHash !== event.hash) return "INVALID"
  }

  if (events.length === 1) return "VALID"

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1]
    const curr = events[i]

    // Verify sequence continuity
    if (curr.sequence !== prev.sequence + 1) return "INVALID"

    // Verify chain linkage
    if (curr.previous_hash !== prev.hash) return "INVALID"
  }

  return "VALID"
}

// ────────────────────────────────────────────────────────────────
// Trace health lookup
// ────────────────────────────────────────────────────────────────

function getTraceHealth(db: Database, sessionId: string): "COMPLETE" | "DEGRADED" | "INCOMPLETE" {
  try {
    const row = db.prepare("SELECT status FROM trace_health WHERE session_id = ?").get(sessionId) as { status: string } | undefined
    if (row && (row.status === "COMPLETE" || row.status === "DEGRADED" || row.status === "INCOMPLETE")) {
      return row.status
    }
  } catch { /* table may not exist */ }
  return "INCOMPLETE"
}

// ────────────────────────────────────────────────────────────────
// Lifecycle status derivation
// ────────────────────────────────────────────────────────────────

function deriveLifecycleStatus(timeline: ReadonlyArray<AuditReplayEntry>): "COMPLETE" | "CRASHED" | "TIMED_OUT" | "INCOMPLETE" {
  for (const entry of timeline) {
    if (entry.type === "session.completed") return "COMPLETE"
    if (entry.type === "session.crashed") return "CRASHED"
  }
  return "INCOMPLETE"
}

// ────────────────────────────────────────────────────────────────
// Export-only event references from DB
// ────────────────────────────────────────────────────────────────

function getEventRefsFromDB(
  db: Database,
  sessionId: string,
): Array<{ eventId: string; sequence: number; hash: string }> {
  const rows = db.prepare(
    "SELECT id, sequence, hash FROM events WHERE session_id = ? ORDER BY sequence ASC",
  ).all(sessionId) as Array<{ id: string; sequence: number; hash: string }>
  return rows.map(r => ({ eventId: r.id, sequence: r.sequence, hash: r.hash }))
}

// ────────────────────────────────────────────────────────────────
// Main derivation
// ────────────────────────────────────────────────────────────────

export function deriveAuditReplay(
  db: Database,
  sessionId: string,
): AuditReplay {
  const now = new Date().toISOString()

  // Get event references from DB
  const eventRefs = getEventRefsFromDB(db, sessionId)

  // Source-event verification
  const { events: verifiedEvents, status: sourceStatus } = verifySourceEvents(db, sessionId, eventRefs)

  // Timeline analysis
  const timeline = analyzeTimeline(verifiedEvents)

  // Warning detection
  const warnings: ReplayWarning[] = [
    ...detectIncompletePairs(timeline),
    ...detectDuplicateReferences(timeline),
    ...detectClaimObligationIssues(timeline),
  ]

  // Global chain verification
  const globalChainStatus = verifyGlobalChain(db)

  // Trace health
  const traceHealth = getTraceHealth(db, sessionId)

  // Lifecycle
  const lifecycle = deriveLifecycleStatus(timeline)

  // Export consistency: recompute runRoot from session events
  // runRoot = SHA-256(sessionId ∥ ordered event hashes)
  let exportConsistency: "VALID" | "INVALID" | "UNAVAILABLE" = "UNAVAILABLE"
  if (eventRefs.length > 0) {
    const allValid = verifiedEvents.every(e => e.isValid && e.isValidSessionMember)
    exportConsistency = allValid ? "VALID" : "INVALID"
  }

  // Compute runRoot if we have events
  let runRoot: string | undefined
  if (eventRefs.length > 0) {
    const hash = createHash("sha256")
    hash.update(sessionId)
    for (const ref of eventRefs) {
      hash.update(ref.eventId)
      hash.update(ref.hash)
    }
    runRoot = hash.digest("hex")
  }

  return {
    schemaVersion: "1",
    sessionId,
    generatedAt: now,
    source: {
      eventCount: eventRefs.length,
      firstSequence: eventRefs.length > 0 ? eventRefs[0]!.sequence : undefined,
      lastSequence: eventRefs.length > 0 ? eventRefs[eventRefs.length - 1]!.sequence : undefined,
      runRoot,
    },
    verification: {
      exportConsistency,
      sourceEvents: sourceStatus,
      globalChain: globalChainStatus,
      traceHealth,
      lifecycle,
    },
    timeline,
    reconstructionWarnings: warnings,
    limitations: [
      "No tool was rerun.",
      "No model was called.",
      "No external state was checked.",
      "No claim was revalidated.",
      "Current correctness is unknown unless separate live revalidation exists.",
      "A valid historical trace can describe a historically incorrect result.",
      "Hash integrity is not actor authentication.",
      "Individual Event v1 records do not bind session membership. A verified RunProof runRoot binds its selected events to a session, but the global event log alone does not.",
    ],
  }
}
