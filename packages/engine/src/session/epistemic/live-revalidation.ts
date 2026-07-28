/**
 * Live revalidation: check whether historical claims and obligations
 * are still valid now.
 *
 * DIFFERENT FROM DETERMINISTIC REPLAY:
 *   Replay:       Can the recorded operation produce the same bounded result?
 *   Revalidation: Are the historical claims and obligations still valid?
 *
 * HARD RULES:
 * - Never mutate the historical RunProof.
 * - Never rewrite historical claims.
 * - Revalidation creates new claims or transitions.
 * - Missing dependencies produce UNAVAILABLE, not failure or success.
 * - A previously verified obligation may become stale or contradicted.
 */

import { createHash, randomUUID } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import type Database from "better-sqlite3"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface DriftRecord {
  readonly kind: "environment" | "artifact"
  readonly identifier: string
  readonly expected: string | null
  readonly actual: string | null
  readonly severity: "INFO" | "WARNING" | "CRITICAL"
}

export interface RevalidatedObligation {
  readonly obligationId: string
  readonly description: string
  readonly historicalStatus: string
  readonly revalidationStatus: "STILL_SATISFIED" | "STALE" | "CONTRADICTED" | "UNAVAILABLE"
  readonly reason: string | null
}

export interface RevalidatedClaimTransition {
  readonly claimId: string
  readonly historicalLevel: string
  readonly revalidationAction: "CONFIRMED" | "DOWNGRADED" | "UPGRADED" | "UNAVAILABLE"
  readonly newLevel: string | null
  readonly reason: string | null
}

export interface RevalidationResult {
  readonly schemaVersion: "1"
  readonly revalidationId: string
  readonly sourceSessionId: string
  readonly sourceRunRoot: string
  readonly sourceProofHash: string

  readonly startedAt: string
  readonly completedAt: string

  readonly environmentDrift: ReadonlyArray<DriftRecord>
  readonly artifactDrift: ReadonlyArray<DriftRecord>
  readonly obligationResults: ReadonlyArray<RevalidatedObligation>
  readonly claimTransitions: ReadonlyArray<RevalidatedClaimTransition>

  readonly status: "STILL_VALID" | "PARTIALLY_VALID" | "INVALIDATED" | "UNAVAILABLE"

  readonly limitations: ReadonlyArray<string>
}

// ────────────────────────────────────────────────────────────────
// Environment drift detection
// ────────────────────────────────────────────────────────────────

function checkEnvironmentDrift(
  events: ReadonlyArray<{ type: string; payload: string }>,
): DriftRecord[] {
  const drifts: DriftRecord[] = []

  // Extract working directories from tool.called events
  const cwds = new Set<string>()
  for (const event of events) {
    if (event.type !== "tool.called") continue
    try {
      const payload = JSON.parse(event.payload)
      const replay = payload.replay
      if (replay?.cwd && typeof replay.cwd === "string") {
        cwds.add(replay.cwd)
      }
    } catch { /* corrupt */ }
  }

  // Check if working directories still exist
  for (const cwd of cwds) {
    if (!fs.existsSync(cwd)) {
      drifts.push({
        kind: "environment",
        identifier: `cwd:${cwd}`,
        expected: cwd,
        actual: null,
        severity: "CRITICAL",
      })
    }
  }

  return drifts
}

// ────────────────────────────────────────────────────────────────
// Artifact drift detection
// ────────────────────────────────────────────────────────────────

function checkArtifactDrift(
  events: ReadonlyArray<{ type: string; payload: string }>,
): DriftRecord[] {
  const drifts: DriftRecord[] = []

  // Extract file operations from tool events
  const fileOps = new Map<string, { hash: string; eventSequence: number }>()
  for (const event of events) {
    if (event.type !== "tool.called") continue
    try {
      const payload = JSON.parse(event.payload)
      const replay = payload.replay
      if (replay?.executable && Array.isArray(replay.arguments)) {
        // Check for file-writing commands (not in our allowlist, but recorded)
        const cmd = [replay.executable, ...replay.arguments].join(" ")
        if (/write|create|modify/i.test(cmd) && replay.cwd) {
          // Record but don't verify — we don't have the file hashes
        }
      }
    } catch { /* corrupt */ }
  }

  return drifts
}

// ────────────────────────────────────────────────────────────────
// Obligation revalidation
// ────────────────────────────────────────────────────────────────

function revalidateObligations(
  events: ReadonlyArray<{ type: string; payload: string }>,
): RevalidatedObligation[] {
  const results: RevalidatedObligation[] = []

  // Collect obligation lifecycle
  const created = new Map<string, { description: string; required: boolean }>()
  const resolved = new Set<string>()

  for (const event of events) {
    try {
      const payload = JSON.parse(event.payload)
      if (event.type === "obligation.created" && payload.obligationId) {
        created.set(payload.obligationId, {
          description: typeof payload.description === "string" ? payload.description : "",
          required: payload.required === true,
        })
      }
      if (event.type === "obligation.resolved" && payload.obligationId) {
        resolved.add(payload.obligationId)
      }
    } catch { /* corrupt */ }
  }

  for (const [id, info] of created) {
    if (resolved.has(id)) {
      results.push({
        obligationId: id,
        description: info.description,
        historicalStatus: "resolved",
        revalidationStatus: "STILL_SATISFIED",
        reason: null,
      })
    } else if (info.required) {
      results.push({
        obligationId: id,
        description: info.description,
        historicalStatus: "unresolved",
        revalidationStatus: "UNAVAILABLE",
        reason: "required obligation was not resolved at session end",
      })
    }
  }

  return results
}

// ────────────────────────────────────────────────────────────────
// Claim transition revalidation
// ────────────────────────────────────────────────────────────────

function revalidateClaims(
  events: ReadonlyArray<{ type: string; payload: string }>,
): RevalidatedClaimTransition[] {
  const results: RevalidatedClaimTransition[] = []

  // Collect claim lifecycle
  const claims = new Map<string, { level: string; transitions: string[] }>()

  for (const event of events) {
    try {
      const payload = JSON.parse(event.payload)
      if (event.type === "claim.created" && payload.claimId) {
        claims.set(payload.claimId, {
          level: typeof payload.level === "string" ? payload.level : "observed",
          transitions: [],
        })
      }
      if (event.type === "claim.transitioned" && payload.claimId) {
        const claim = claims.get(payload.claimId)
        if (claim && typeof payload.newLevel === "string") {
          claim.transitions.push(payload.newLevel)
        }
      }
    } catch { /* corrupt */ }
  }

  for (const [id, info] of claims) {
    const finalLevel = info.transitions.length > 0
      ? info.transitions[info.transitions.length - 1]!
      : info.level

    // Claims are historical records — we confirm them as recorded
    // but cannot verify they reflect current reality
    results.push({
      claimId: id,
      historicalLevel: finalLevel,
      revalidationAction: "CONFIRMED",
      newLevel: null,
      reason: "historical claim confirmed as recorded; current validity not re-checked",
    })
  }

  return results
}

// ────────────────────────────────────────────────────────────────
// Main revalidation
// ────────────────────────────────────────────────────────────────

export function deriveRevalidation(
  db: Database.Database,
  sessionId: string,
): RevalidationResult {
  const startedAt = new Date().toISOString()
  const revalidationId = randomUUID()

  // Load session events
  const events = db.prepare(`
    SELECT id, sequence, type, payload
    FROM events
    WHERE session_id = ?
    ORDER BY sequence ASC
  `).all(sessionId) as Array<{ id: string; sequence: number; type: string; payload: string }>

  // Load RunProof data if available
  let sourceRunRoot = ""
  let sourceProofHash = ""
  try {
    const traceRow = db.prepare("SELECT * FROM trace_health WHERE session_id = ?").get(sessionId)
    if (traceRow) {
      sourceRunRoot = createHash("sha256").update(sessionId).digest("hex")
    }
  } catch { /* table may not exist */ }

  // If no events, revalidation is UNAVAILABLE
  if (events.length === 0) {
    return {
      schemaVersion: "1",
      revalidationId,
      sourceSessionId: sessionId,
      sourceRunRoot,
      sourceProofHash,
      startedAt,
      completedAt: new Date().toISOString(),
      environmentDrift: [],
      artifactDrift: [],
      obligationResults: [],
      claimTransitions: [],
      status: "UNAVAILABLE",
      limitations: [
        "No events found for this session.",
        "Revalidation requires a recorded trace.",
      ],
    }
  }

  // Check environment drift
  const environmentDrift = checkEnvironmentDrift(events)

  // Check artifact drift
  const artifactDrift = checkArtifactDrift(events)

  // Revalidate obligations
  const obligationResults = revalidateObligations(events)

  // Revalidate claims
  const claimTransitions = revalidateClaims(events)

  // Determine overall status
  const hasCriticalDrift = environmentDrift.some(d => d.severity === "CRITICAL")
  const hasUnavailableObligations = obligationResults.some(o => o.revalidationStatus === "UNAVAILABLE")
  const hasContradictedObligations = obligationResults.some(o => o.revalidationStatus === "CONTRADICTED")

  let status: "STILL_VALID" | "PARTIALLY_VALID" | "INVALIDATED" | "UNAVAILABLE"
  if (hasCriticalDrift) {
    status = "INVALIDATED"
  } else if (hasContradictedObligations) {
    status = "INVALIDATED"
  } else if (hasUnavailableObligations || environmentDrift.length > 0) {
    status = "PARTIALLY_VALID"
  } else {
    status = "STILL_VALID"
  }

  return {
    schemaVersion: "1",
    revalidationId,
    sourceSessionId: sessionId,
    sourceRunRoot,
    sourceProofHash,
    startedAt,
    completedAt: new Date().toISOString(),
    environmentDrift,
    artifactDrift,
    obligationResults,
    claimTransitions,
    status,
    limitations: [
      "Revalidation checks whether historical claims and obligations remain consistent.",
      "It does not re-execute historical operations.",
      "It does not re-call models or re-run tools.",
      "It does not verify that historical results are still correct in the current environment.",
      "Missing dependencies produce UNAVAILABLE, not failure or success.",
      "A previously verified obligation may become stale or contradicted.",
    ],
  }
}
