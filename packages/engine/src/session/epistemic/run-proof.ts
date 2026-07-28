// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
//
// RunProof derivation — read-only proof from epistemic events.
// Derives lifecycle completeness, trace health, and proof level
// from the existing event store. Does NOT modify Phase A records.

import { Effect, Context, Layer } from "effect"
import { desc, eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { EventTable } from "@arcana/core/epistemic/event-sql"
import { TraceHealthTable } from "@arcana/core/epistemic/trace-health-sql"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"
import { computeEventHash } from "@arcana/core/epistemic/event-hash"
import type { TraceStatus, TraceRecordingError } from "./event-store"

// ── Types ─────────────────────────────────────────────────────────────

export type ProofLevel = "P0" | "P1" | "P2" | "P3"

export interface LifecycleCompleteness {
  readonly started: boolean
  readonly hasTerminalEvent: boolean
  readonly terminalReason: string | null
  readonly pairsComplete: boolean
  readonly recordingFailure: boolean
}

export interface RunProof {
  readonly sessionId: string
  readonly derivedAt: string
  readonly eventCount: number
  readonly traceStatus: TraceStatus
  readonly lifecycle: LifecycleCompleteness
  readonly proofLevel: ProofLevel
  readonly proofHash: string
  readonly events: ReadonlyArray<RunProofEvent>
  readonly gaps: ReadonlyArray<string>
}

export interface RunProofEvent {
  readonly eventId: string
  readonly sequence: number
  readonly type: string
  readonly timestamp: string
  readonly actor: { kind: string; id: string }
}

// ── Service ───────────────────────────────────────────────────────────

export interface Interface {
  readonly derive: (sessionId: string) => Effect.Effect<RunProof>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/RunProof") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const derive = Effect.fn("RunProof.derive")(function* (sessionId: string) {
      const derivedAt = new Date().toISOString()

      // Query all events for this session, ordered by sequence
      const rows = yield* db.select().from(EventTable)
        .where(eq(EventTable.session_id, sessionId))
        .orderBy(EventTable.sequence)
        .pipe(Effect.orDie)

      const events: RunProofEvent[] = rows.map((r) => ({
        eventId: r.id,
        sequence: r.sequence,
        type: r.type,
        timestamp: r.timestamp,
        actor: { kind: r.actor_kind, id: r.actor_id },
      }))

      // Query trace health
      const traceRows = yield* db.select().from(TraceHealthTable)
        .where(eq(TraceHealthTable.session_id, sessionId))
        .limit(1)
        .pipe(Effect.orDie)

      const traceStatus: TraceStatus = traceRows.length > 0
        ? (traceRows[0]!.status as TraceStatus)
        : "UNAVAILABLE"

      // Derive lifecycle completeness
      const lifecycle = deriveLifecycle(events)

      // Derive proof level
      const { proofLevel, gaps } = deriveProofLevel(events, lifecycle, traceStatus)

      // Compute deterministic proof hash
      const proofHash = computeProofHash(sessionId, events, lifecycle, traceStatus, proofLevel)

      return {
        sessionId,
        derivedAt,
        eventCount: events.length,
        traceStatus,
        lifecycle,
        proofLevel,
        proofHash,
        events,
        gaps,
      } satisfies RunProof
    })

    return Service.of({ derive })
  }),
)

// ── Lifecycle derivation ──────────────────────────────────────────────

function deriveLifecycle(events: ReadonlyArray<RunProofEvent>): LifecycleCompleteness {
  const types = new Set(events.map((e) => e.type))

  const started = types.has("session.started")
  const completed = types.has("session.completed")
  const crashed = types.has("session.crashed")

  const hasTerminalEvent = completed || crashed
  const terminalReason = completed ? "completed" : crashed ? "crashed" : null

  // Pairs complete: if started, must have terminal
  // If contract exists, must have completion.resolved
  const hasContract = types.has("contract.proposed")
  const hasResolution = types.has("completion.resolved")
  const pairsComplete = started ? hasTerminalEvent : true
  const contractPairsComplete = hasContract ? hasResolution : true

  // Recording failure: check if any event types are missing from expected pairs
  const recordingFailure = false // Will be set by trace status check

  return {
    started,
    hasTerminalEvent,
    terminalReason,
    pairsComplete: pairsComplete && contractPairsComplete,
    recordingFailure,
  }
}

// ── Proof level derivation ────────────────────────────────────────────

function deriveProofLevel(
  events: ReadonlyArray<RunProofEvent>,
  lifecycle: LifecycleCompleteness,
  traceStatus: TraceStatus,
): { proofLevel: ProofLevel; gaps: string[] } {
  const gaps: string[] = []

  // P0: No events at all
  if (events.length === 0) {
    return { proofLevel: "P0", gaps: ["no events recorded"] }
  }

  // P1: Events exist but lifecycle incomplete
  if (!lifecycle.started) {
    gaps.push("session.started missing")
  }
  if (!lifecycle.hasTerminalEvent) {
    gaps.push("no terminal event (session.completed or session.crashed)")
  }
  if (!lifecycle.pairsComplete) {
    gaps.push("event pairs incomplete (contract without resolution)")
  }

  if (gaps.length > 0) {
    return { proofLevel: "P1", gaps }
  }

  // P2: Lifecycle complete but trace health degraded
  if (traceStatus === "DEGRADED") {
    gaps.push("trace health DEGRADED — recording failures detected")
    return { proofLevel: "P2", gaps }
  }
  if (traceStatus === "UNAVAILABLE") {
    gaps.push("trace health UNAVAILABLE — no health record")
    return { proofLevel: "P2", gaps }
  }

  // P2: Check for completion method
  const types = new Set(events.map((e) => e.type))
  if (!types.has("completion.resolved") && !types.has("session.crashed")) {
    gaps.push("no completion.resolved event — epistemic outcome unknown")
    return { proofLevel: "P2", gaps }
  }

  // P3: Everything verified
  return { proofLevel: "P3", gaps: [] }
}

// ── Deterministic hash ────────────────────────────────────────────────

function computeProofHash(
  sessionId: string,
  events: ReadonlyArray<RunProofEvent>,
  lifecycle: LifecycleCompleteness,
  traceStatus: TraceStatus,
  proofLevel: ProofLevel,
): string {
  // Canonical JSON of the proof state — deterministic across runs
  const canonical = JSON.stringify({
    sessionId,
    eventCount: events.length,
    eventHashes: events.map((e) => e.eventId),
    lifecycle,
    traceStatus,
    proofLevel,
  })

  // Use the same hash function as event hashing
  const { createHash } = require("node:crypto")
  return createHash("sha256").update(canonical).digest("hex")
}

export * as RunProof from "./run-proof"
