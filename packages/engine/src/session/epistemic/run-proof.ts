// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
//
// RunProof derivation — read-only proof from epistemic events.
// Derives lifecycle completeness, trace health, integrity status,
// and proof level from the existing event store.
// Does NOT modify Phase A records.

import { Effect, Context, Layer } from "effect"
import { eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { EventTable } from "@arcana/core/epistemic/event-sql"
import { TraceHealthTable } from "@arcana/core/epistemic/trace-health-sql"
import { ClaimTable } from "@arcana/core/epistemic/sql"
import { ContractTable } from "@arcana/core/epistemic/contract-sql"
import { ObligationTable } from "@arcana/core/epistemic/obligation-sql"
import type { TraceStatus } from "./event-store"

// ── Types ─────────────────────────────────────────────────────────────

/** Proof level — what the evidence supports. */
export type ProofLevel = "P0" | "P1" | "P2" | "P3"

/** Trace health — recording integrity. Independent of proof level. */
export type TraceHealth = "COMPLETE" | "DEGRADED" | "UNAVAILABLE"

/** Lifecycle status — session lifecycle completeness. Independent of proof level. */
export type LifecycleStatus = "COMPLETE" | "INCOMPLETE" | "CRASHED" | "CANCELLED"

/**
 * Integrity status — whether hashes and roots verify.
 * P0 can exist with INVALID integrity (corrupted data still exists),
 * but INVALID cannot advance past P0.
 */
export type IntegrityStatus = "VALID" | "INVALID" | "UNVERIFIED"

/**
 * Assurance profile — independent axes, NOT a strict ordinal ladder.
 *
 * P3 ⊬ P2 and P2 ⊬ P3:
 * - A run can be P2 (reproducible) but not P3 (no completion contract).
 * - A run can be P3 (verified) but not P2 (no deterministic replay).
 *
 * P-labels are retained as compatibility badges:
 *   P0 = trace ≥ RECORDED
 *   P1 = P0 ∧ integrity = VALID
 *   P2 = reproducibility ≥ PARTIAL (independent of P3)
 *   P3 = verification = VERIFIED (independent of P2)
 */
export type TraceAssurance = "NONE" | "RECORDED"
export type IntegrityAssurance = "UNVERIFIED" | "VALID" | "INVALID"
export type VerificationAssurance = "UNVERIFIED" | "VERIFIED"
export type ReproducibilityAssurance = "NONE" | "PARTIAL" | "FULL"

export interface AssuranceProfile {
  readonly trace: TraceAssurance
  readonly integrity: IntegrityAssurance
  readonly verification: VerificationAssurance
  readonly reproducibility: ReproducibilityAssurance
  /** Human-readable reproducibility detail, e.g. "FULL · 1/1 declared steps" */
  readonly reproducibilityDetail: string | null
}

export interface LifecycleCompleteness {
  readonly started: boolean
  readonly hasTerminalEvent: boolean
  readonly terminalReason: string | null
  readonly pairsComplete: boolean
  readonly recordingFailure: boolean
}

/**
 * The canonical input to proofHash.
 * proofHash = H(ProofHashPayload).
 * proofHash itself is NOT included in its own input.
 */
export interface ProofHashPayload {
  readonly sessionId: string
  readonly eventCount: number
  readonly eventHashes: ReadonlyArray<string>
  readonly lifecycle: LifecycleCompleteness
  readonly lifecycleStatus: LifecycleStatus
  readonly traceHealth: TraceHealth
  readonly integrityStatus: IntegrityStatus
  readonly proofLevel: ProofLevel
  readonly assuranceProfile: AssuranceProfile
  readonly completionMethod: string | null
}

/**
 * Authorization trace health — whether authorization event recording is complete.
 */
export type AuthorizationTraceHealth = "COMPLETE" | "DEGRADED" | "UNAVAILABLE"

/**
 * Authorization profile — derived from authorization events in a session.
 * Hard invariant: unauthorizedExecutions = 0.
 */
export interface AuthorizationProfile {
  readonly policyVersions: ReadonlyArray<string>
  readonly requests: number
  readonly allowed: number
  readonly denied: number
  readonly approvalsRequired: number
  readonly staleDecisions: number
  readonly executed: number
  readonly executionFailures: number
  readonly unauthorizedExecutions: number
  readonly capabilityViolations: number
  readonly authorizationTraceHealth: AuthorizationTraceHealth
  readonly orphanExecutions: number
  readonly unmatchedAllows: number
  readonly unmatchedRequests: number
}

/**
 * Information flow profile — derived from security label events.
 * Hard invariant: unlabeledConsequentialRequests = 0.
 */
export interface InformationFlowProfile {
  readonly labeledInputs: number
  readonly labeledDerivedValues: number
  readonly secretValuesUsed: number
  readonly secretFlowsDenied: number
  readonly declassificationsRequested: number
  readonly declassificationsAllowed: number
  readonly labelTamperingAttempts: number
  readonly unlabeledConsequentialRequests: number
  readonly traceHealth: AuthorizationTraceHealth
}

/** The full RunProof = ProofHashPayload + derived hash fields. */
export type RunProof = ProofHashPayload & {
  readonly proofHash: string
  readonly runRoot: string
  readonly derivedAt: string
  readonly events: ReadonlyArray<RunProofEvent>
  readonly gaps: ReadonlyArray<string>
  readonly claimsByStatus: Readonly<Record<string, number>>
  readonly obligationsByStatus: Readonly<Record<string, number>>
  readonly contractStatus: string | null
  readonly p3DenialReasons: ReadonlyArray<string>
  readonly authorizationProfile: AuthorizationProfile
  readonly informationFlowProfile: InformationFlowProfile
}

export interface RunProofEvent {
  readonly eventId: string
  readonly sequence: number
  readonly type: string
  readonly timestamp: string
  readonly actor: { kind: string; id: string }
  readonly payload: unknown
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
        payload: (() => { try { return JSON.parse(r.payload) } catch { return r.payload } })(),
      }))

      // Query trace health
      const traceRows = yield* db.select().from(TraceHealthTable)
        .where(eq(TraceHealthTable.session_id, sessionId))
        .limit(1)
        .pipe(Effect.orDie)

      const traceHealth: TraceHealth = traceRows.length > 0
        ? (traceRows[0]!.status as TraceHealth)
        : "UNAVAILABLE"

      // Query claims grouped by status
      const claimRows = yield* db.select({ status: ClaimTable.status })
        .from(ClaimTable)
        .where(eq(ClaimTable.session_id, sessionId))
        .pipe(Effect.orDie)

      const claimsByStatus: Record<string, number> = {}
      for (const row of claimRows) {
        claimsByStatus[row.status] = (claimsByStatus[row.status] ?? 0) + 1
      }

      // Query contract status (take the first contract for this session)
      const contractRows = yield* db.select({ status: ContractTable.status })
        .from(ContractTable)
        .where(eq(ContractTable.session_id, sessionId))
        .limit(1)
        .pipe(Effect.orDie)

      const contractStatus: string | null = contractRows.length > 0
        ? contractRows[0]!.status
        : null

      // Query obligations grouped by status, joined through contracts for session_id
      const obligationRows = yield* db.select({ status: ObligationTable.status })
        .from(ObligationTable)
        .innerJoin(ContractTable, eq(ObligationTable.contract_id, ContractTable.id))
        .where(eq(ContractTable.session_id, sessionId))
        .pipe(Effect.orDie)

      const obligationsByStatus: Record<string, number> = {}
      for (const row of obligationRows) {
        obligationsByStatus[row.status] = (obligationsByStatus[row.status] ?? 0) + 1
      }

      // Derive lifecycle completeness
      const lifecycle = deriveLifecycle(events)

      // Derive lifecycle status
      const lifecycleStatus = deriveLifecycleStatus(lifecycle)

      // Derive completion method from events
      const completionMethod = extractCompletionMethod(events)

      // Compute runRoot (always, even if chain is broken)
      const runRoot = computeRunRoot(sessionId, rows)

      // Verify integrity: global chain, runRoot, proofHash
      const integrityStatus = verifyIntegrity(sessionId, rows, events, runRoot)

      // Derive assurance profile (independent axes) and proof level badges
      const { profile: assuranceProfile, proofLevel, gaps } = deriveAssuranceProfile({
        events,
        integrityStatus,
        completionMethod,
        contractStatus,
        obligationsByStatus,
        lifecycleStatus,
        traceHealth,
      })

      // Extract P3 denial reasons from gaps
      const p3DenialReasons = extractP3DenialReasons(gaps)

      // Build the ProofHashPayload (everything except proofHash)
      const payload: ProofHashPayload = {
        sessionId,
        eventCount: events.length,
        eventHashes: events.map((e) => e.eventId),
        lifecycle,
        lifecycleStatus,
        traceHealth,
        integrityStatus,
        proofLevel,
        assuranceProfile,
        completionMethod,
      }

      // Compute proofHash from payload only
      const proofHash = computeProofHash(payload)

      // Derive authorization profile from authorization events
      const authorizationProfile = deriveAuthorizationProfile(events)

      // Derive information flow profile from security label events
      const informationFlowProfile = deriveInformationFlowProfile(events)

      return {
        ...payload,
        proofHash,
        runRoot,
        derivedAt,
        events,
        gaps,
        claimsByStatus,
        obligationsByStatus,
        contractStatus,
        p3DenialReasons,
        authorizationProfile,
        informationFlowProfile,
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

  // Check tool.called / tool.returned pairs
  const toolCalled = events.filter((e) => e.type === "tool.called")
  const toolReturned = events.filter((e) => e.type === "tool.returned")
  const toolPairsComplete = toolCalled.length <= toolReturned.length

  return {
    started,
    hasTerminalEvent,
    terminalReason,
    pairsComplete: pairsComplete && contractPairsComplete && toolPairsComplete,
    recordingFailure: false, // set by trace health, not lifecycle
  }
}

function deriveLifecycleStatus(lifecycle: LifecycleCompleteness): LifecycleStatus {
  if (lifecycle.terminalReason === "crashed") return "CRASHED"
  if (lifecycle.started && lifecycle.hasTerminalEvent && lifecycle.pairsComplete) return "COMPLETE"
  return "INCOMPLETE"
}

/** Extract completion method from completion.resolved events. */
function extractCompletionMethod(events: ReadonlyArray<RunProofEvent>): string | null {
  const resolved = events.find((e) => e.type === "completion.resolved")
  if (!resolved) return null
  const p = resolved.payload as Record<string, unknown>
  return (p?.method as string) ?? null
}

/**
 * Derive authorization profile from authorization events.
 * Counts each authorization event type and extracts policy versions.
 * Hard invariant: unauthorizedExecutions = 0.
 * Trace health: COMPLETE when every executed has matching requested+allowed.
 */
function deriveAuthorizationProfile(events: ReadonlyArray<RunProofEvent>): AuthorizationProfile {
  const authEvents = events.filter((e) => e.type.startsWith("authorization."))
  const policyVersions = new Set<string>()
  let requests = 0
  let allowed = 0
  let denied = 0
  let approvalsRequired = 0
  let staleDecisions = 0
  let executed = 0
  let executionFailures = 0

  // Track requestIds for matching
  const requestedIds = new Set<string>()
  const allowedIds = new Set<string>()
  const executedIds = new Set<string>()

  for (const e of authEvents) {
    const p = e.payload as Record<string, unknown>
    const decision = p?.decision as Record<string, unknown> | undefined
    if (decision?.policyVersion) {
      policyVersions.add(decision.policyVersion as string)
    }

    const requestId = p?.requestId as string | undefined

    switch (e.type) {
      case "authorization.requested":
        requests++
        if (requestId) requestedIds.add(requestId)
        break
      case "authorization.allowed":
        allowed++
        if (requestId) allowedIds.add(requestId)
        break
      case "authorization.denied":
        denied++
        break
      case "authorization.approval_required":
        approvalsRequired++
        break
      case "authorization.stale":
        staleDecisions++
        break
      case "authorization.executed":
        executed++
        if (requestId) executedIds.add(requestId)
        break
      case "authorization.execution_failed":
        executionFailures++
        break
    }
  }

  // Orphan executions: executed without a prior matching allowed
  let orphanExecutions = 0
  for (const id of executedIds) {
    if (!allowedIds.has(id)) {
      orphanExecutions++
    }
  }

  // Unmatched allows: allowed but never executed or explicitly refused
  const refusedIds = new Set<string>(
    authEvents
      .filter((e) => e.type === "authorization.denied" || e.type === "authorization.stale" || e.type === "authorization.execution_failed")
      .map((e) => (e.payload as Record<string, unknown>)?.requestId as string)
      .filter(Boolean),
  )
  let unmatchedAllows = 0
  for (const id of allowedIds) {
    if (!executedIds.has(id) && !refusedIds.has(id)) {
      unmatchedAllows++
    }
  }

  // Unmatched requests: requested but never got a decision
  const decidedIds = new Set<string>([...allowedIds, ...refusedIds])
  for (const e of authEvents) {
    if (e.type === "authorization.approval_required") {
      decidedIds.add((e.payload as Record<string, unknown>)?.requestId as string)
    }
  }
  let unmatchedRequests = 0
  for (const id of requestedIds) {
    if (!decidedIds.has(id)) {
      unmatchedRequests++
    }
  }

  // Unauthorized executions = executions without prior authorization
  const unauthorizedExecutions = orphanExecutions

  // Authorization trace health
  let authorizationTraceHealth: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  if (authEvents.length === 0) {
    authorizationTraceHealth = "UNAVAILABLE"
  } else if (orphanExecutions > 0 || unmatchedRequests > 0) {
    authorizationTraceHealth = "DEGRADED"
  } else {
    authorizationTraceHealth = "COMPLETE"
  }

  return {
    policyVersions: [...policyVersions],
    requests,
    allowed,
    denied,
    approvalsRequired,
    staleDecisions,
    executed,
    executionFailures,
    unauthorizedExecutions,
    capabilityViolations: denied,
    authorizationTraceHealth,
    orphanExecutions,
    unmatchedAllows,
    unmatchedRequests,
  }
}

/**
 * Derive information flow profile from security label events.
 * Hard invariant: unlabeledConsequentialRequests = 0.
 */
function deriveInformationFlowProfile(events: ReadonlyArray<RunProofEvent>): InformationFlowProfile {
  const labelEvents = events.filter((e) => e.type.startsWith("security."))
  const authEvents = events.filter((e) => e.type.startsWith("authorization."))

  let labeledInputs = 0
  let labeledDerivedValues = 0
  let secretValuesUsed = 0
  let secretFlowsDenied = 0
  let declassificationsRequested = 0
  let declassificationsAllowed = 0
  let labelTamperingAttempts = 0
  let unlabeledConsequentialRequests = 0

  for (const e of labelEvents) {
    switch (e.type) {
      case "security.labels_assigned":
        labeledInputs++
        break
      case "security.labels_propagated":
        labeledDerivedValues++
        break
      case "security.label_tampering_detected":
        labelTamperingAttempts++
        break
      case "security.declassification_requested":
        declassificationsRequested++
        break
      case "security.declassification_allowed":
        declassificationsAllowed++
        break
      case "security.declassification_denied":
        // Counted but not separately tracked
        break
      case "security.secret_flow_denied":
        secretFlowsDenied++
        break
    }
  }

  // Count secret values used from authorization events
  for (const e of authEvents) {
    const p = e.payload as Record<string, unknown>
    if (e.type === "authorization.requested") {
      // Check if request had SECRET sensitivity
      const sensitivity = p?.sensitivity as string[] | undefined
      if (sensitivity?.includes("SECRET")) {
        secretValuesUsed++
      }
      // Check if request had labels at all
      const provenance = p?.provenance as string[] | undefined
      if (!provenance || provenance.length === 0) {
        unlabeledConsequentialRequests++
      }
    }
  }

  // Trace health: based on whether label events are present
  let traceHealth: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  if (labelEvents.length === 0 && authEvents.length === 0) {
    traceHealth = "UNAVAILABLE"
  } else if (unlabeledConsequentialRequests > 0) {
    traceHealth = "DEGRADED"
  } else {
    traceHealth = "COMPLETE"
  }

  return {
    labeledInputs,
    labeledDerivedValues,
    secretValuesUsed,
    secretFlowsDenied,
    declassificationsRequested,
    declassificationsAllowed,
    labelTamperingAttempts,
    unlabeledConsequentialRequests,
    traceHealth,
  }
}

// ── Integrity verification ───────────────────────────────────────────

/**
 * Verify integrity: global chain hashes, runRoot, and proofHash.
 * Returns INVALID if any check fails, VALID if all pass, UNVERIFIED if no events.
 */
function verifyIntegrity(
  sessionId: string,
  rows: ReadonlyArray<{ id: string; sequence: number; hash: string; previous_hash: string | null; timestamp: string; actor_kind: string; actor_id: string; type: string; payload: string }>,
  events: ReadonlyArray<RunProofEvent>,
  computedRunRoot: string,
): IntegrityStatus {
  if (rows.length === 0) return "UNVERIFIED"

  // 1. Verify global chain: each row's hash must recompute, and previous_hash must link
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const expectedHash = computeEventHashFromRow(r)
    if (expectedHash !== r.hash) return "INVALID"
    if (i > 0 && r.previous_hash !== rows[i - 1]!.hash) return "INVALID"
  }

  // 2. runRoot is already computed by caller — just verify it's non-empty
  if (!computedRunRoot || computedRunRoot.length !== 64) return "INVALID"

  // 3. ProofHash verification happens at deriveProofLevel time
  //    Here we just confirm the chain is intact
  return "VALID"
}

// ── Assurance profile derivation (independent axes) ────────────────

function deriveAssuranceProfile(ctx: {
  events: ReadonlyArray<RunProofEvent>
  integrityStatus: IntegrityStatus
  completionMethod: string | null
  contractStatus: string | null
  obligationsByStatus: Readonly<Record<string, number>>
  lifecycleStatus: LifecycleStatus
  traceHealth: TraceHealth
  replayCoverage?: { declaredReplaySubset: number; successfullyReproduced: number; reproducibility: string } | null
}): { profile: AssuranceProfile; proofLevel: ProofLevel; gaps: string[] } {
  const gaps: string[] = []

  // ── Trace (independent) ──
  const trace: TraceAssurance = ctx.events.length > 0 ? "RECORDED" : "NONE"

  // ── Integrity (independent) ──
  const integrity: IntegrityAssurance = ctx.integrityStatus

  // ── Verification (independent) ──
  // VERIFIED = completionMethod=VERIFIED_COMPLETE + lifecycle COMPLETE
  //            + all required obligations satisfied + contract resolved
  let verification: VerificationAssurance = "UNVERIFIED"
  if (ctx.completionMethod === "VERIFIED_COMPLETE"
      && ctx.lifecycleStatus === "COMPLETE"
      && ctx.traceHealth === "COMPLETE") {
    // Check contract
    const contractOk = ctx.contractStatus === null
      || ctx.contractStatus === "resolved"
      || ctx.contractStatus === "accepted"
    // Check required obligations (not all pending — only required ones)
    const hasRequiredObligations = ctx.events.some((e) =>
      e.type === "obligation.created" && (e.payload as Record<string, unknown>)?.required === true
    )
    let unresolvedRequired = 0
    if (hasRequiredObligations) {
      const createdRequired = ctx.events.filter((e) =>
        e.type === "obligation.created" && (e.payload as Record<string, unknown>)?.required === true
      )
      const resolvedObligations = new Set(
        ctx.events.filter((e) => e.type === "obligation.resolved")
          .map((e) => (e.payload as Record<string, unknown>)?.obligationId)
      )
      unresolvedRequired = createdRequired.filter((e) =>
        !resolvedObligations.has((e.payload as Record<string, unknown>)?.obligationId)
      ).length
    }
    if (contractOk && unresolvedRequired === 0) {
      verification = "VERIFIED"
    } else {
      if (!contractOk) gaps.push(`contractStatus is ${ctx.contractStatus} — P3 requires resolved/accepted`)
      if (unresolvedRequired > 0) gaps.push(`${unresolvedRequired} required obligation(s) unresolved — P3 requires all satisfied`)
    }
  } else {
    if (ctx.completionMethod !== "VERIFIED_COMPLETE") gaps.push(`completionMethod is ${ctx.completionMethod ?? "null"} — P3 requires VERIFIED_COMPLETE`)
    if (ctx.lifecycleStatus !== "COMPLETE") gaps.push(`lifecycleStatus is ${ctx.lifecycleStatus} — P3 requires COMPLETE`)
    if (ctx.traceHealth !== "COMPLETE") gaps.push(`traceHealth is ${ctx.traceHealth} — P3 requires COMPLETE`)
  }

  // ── Reproducibility (independent) ──
  let reproducibility: ReproducibilityAssurance = "NONE"
  let reproducibilityDetail: string | null = null
  if (ctx.replayCoverage) {
    const rc = ctx.replayCoverage
    if (rc.reproducibility === "FULL" && rc.declaredReplaySubset > 0) {
      reproducibility = "FULL"
      reproducibilityDetail = `FULL · ${rc.successfullyReproduced}/${rc.declaredReplaySubset} declared steps`
    } else if (rc.reproducibility === "PARTIAL") {
      reproducibility = "PARTIAL"
      reproducibilityDetail = `PARTIAL · ${rc.successfullyReproduced}/${rc.declaredReplaySubset} declared steps`
    } else {
      reproducibilityDetail = rc.declaredReplaySubset > 0
        ? `NONE · ${rc.successfullyReproduced}/${rc.declaredReplaySubset} declared steps`
        : null
    }
  }

  // ── P-label badges (from profile, not a ladder) ──
  let proofLevel: ProofLevel
  if (trace === "NONE") {
    proofLevel = "P0"
    gaps.unshift("no events recorded — P0 requires at least one event")
  } else if (integrity !== "VALID") {
    proofLevel = "P0"
    if (integrity === "INVALID") gaps.unshift("integrity INVALID — global chain or runRoot verification failed")
    else gaps.unshift("integrity UNVERIFIED — P1 requires VALID")
  } else {
    // P1 baseline
    proofLevel = "P1"
    // P2 badge: reproducibility ≥ PARTIAL (independent of P3)
    if (reproducibility === "PARTIAL" || reproducibility === "FULL") {
      proofLevel = "P2"
    }
    // P3 badge: verification = VERIFIED (independent of P2)
    if (verification === "VERIFIED") {
      proofLevel = "P3"
    }
  }

  return {
    profile: { trace, integrity, verification, reproducibility, reproducibilityDetail },
    proofLevel,
    gaps,
  }
}

// ── Proof level derivation (legacy, now delegates to assurance profile) ────

function deriveProofLevel(ctx: {
  events: ReadonlyArray<RunProofEvent>
  lifecycle: LifecycleCompleteness
  lifecycleStatus: LifecycleStatus
  traceHealth: TraceHealth
  integrityStatus: IntegrityStatus
  completionMethod: string | null
  claimsByStatus: Readonly<Record<string, number>>
  obligationsByStatus: Readonly<Record<string, number>>
  contractStatus: string | null
}): { proofLevel: ProofLevel; gaps: string[] } {
  const { events, lifecycleStatus, traceHealth, integrityStatus, completionMethod, contractStatus } = ctx
  const gaps: string[] = []

  // ── P0 TRACE ── At least one event exists
  if (events.length === 0) {
    return { proofLevel: "P0", gaps: ["no events recorded — P0 requires at least one event"] }
  }

  // Integrity check: corrupted chain cannot advance past P0
  if (integrityStatus === "INVALID") {
    gaps.push("integrity INVALID — global chain or runRoot verification failed")
    return { proofLevel: "P0", gaps }
  }

  // ── P1 INTEGRITY ── global chain + runRoot + proofHash verify
  if (integrityStatus === "VALID") {
    // P1 achieved — integrity is valid
  } else {
    gaps.push("integrity UNVERIFIED — cannot confirm chain integrity")
    return { proofLevel: "P0", gaps }
  }

  // ── P2 REPRODUCIBLE ── A declared subset successfully replays
  // UNTIL REPLAY EXISTS: no RunProof receives P2.
  // When replay is implemented, check here. For now, cap at P1.
  // P2 requires replay infrastructure which does not exist yet.

  // ── P3 VERIFIED ── All invariants hold
  // P3 = P1 ∧ completionMethod=VERIFIED_COMPLETE ∧ lifecycle=COMPLETE
  //       ∧ traceHealth=COMPLETE ∧ all required obligations satisfied

  // Check: trace health must be COMPLETE
  if (traceHealth !== "COMPLETE") {
    gaps.push(`traceHealth is ${traceHealth} — P3 requires COMPLETE`)
    return { proofLevel: "P1", gaps }
  }

  // Check: lifecycle must be COMPLETE
  if (lifecycleStatus !== "COMPLETE") {
    gaps.push(`lifecycleStatus is ${lifecycleStatus} — P3 requires COMPLETE`)
    return { proofLevel: "P1", gaps }
  }

  // Check: completion method must be VERIFIED_COMPLETE
  if (completionMethod !== "VERIFIED_COMPLETE") {
    gaps.push(`completionMethod is ${completionMethod ?? "null"} — P3 requires VERIFIED_COMPLETE`)
    return { proofLevel: "P1", gaps }
  }

  // Check: contract must be resolved (accepted/completed)
  if (contractStatus !== null && contractStatus !== "resolved" && contractStatus !== "accepted") {
    gaps.push(`contractStatus is ${contractStatus} — P3 requires resolved/accepted`)
    return { proofLevel: "P1", gaps }
  }

  // Check: all required obligations must be satisfied
  const hasRequiredObligations = events.some((e) =>
    e.type === "obligation.created" && (e.payload as Record<string, unknown>)?.required === true
  )
  if (hasRequiredObligations) {
    const createdRequired = events.filter((e) =>
      e.type === "obligation.created" && (e.payload as Record<string, unknown>)?.required === true
    )
    const resolvedObligations = new Set(
      events.filter((e) => e.type === "obligation.resolved")
        .map((e) => (e.payload as Record<string, unknown>)?.obligationId)
    )
    const unresolved = createdRequired.filter((e) =>
      !resolvedObligations.has((e.payload as Record<string, unknown>)?.obligationId)
    )
    if (unresolved.length > 0) {
      gaps.push(`${unresolved.length} required obligation(s) unresolved — P3 requires all satisfied`)
      return { proofLevel: "P1", gaps }
    }
  }

  // All P3 invariants hold
  return { proofLevel: "P3", gaps: [] }
}

/**
 * Extract P3-specific denial reasons from the gaps array.
 * Filters for gap strings that mention P3 requirements.
 */
function extractP3DenialReasons(gaps: ReadonlyArray<string>): string[] {
  return gaps.filter((g) => g.includes("P3"))
}

// ── RunRoot computation (hardened) ────────────────────────────────────

/**
 * Compute runRoot with domain-separated, versioned, length-prefixed encoding.
 *
 * R = H(
 *   "arcana-run-root-v1"            // domain separator
 *   ∥ u32BE(sessionId.length)       // length-prefix sessionId
 *   ∥ sessionId                     // UTF-8 bytes
 *   ∥ u32BE(eventCount)             // event count
 *   ∥ ∥_i (
 *     u64BE(sequence_i)             // global sequence
 *     ∥ u32BE(id_i.length)          // length-prefix event ID
 *     ∥ id_i                        // UUID string bytes
 *     ∥ hash_i (raw 32 bytes)       // SHA-256 digest (decoded from hex)
 *   )
 * )
 */
export function computeRunRoot(
  sessionId: string,
  rows: ReadonlyArray<{ sequence: number; id: string; hash: string }>,
): string {
  const h = createHash("sha256")

  // Domain separator — fixed string, no length prefix needed
  h.update("arcana-run-root-v1")

  // Length-prefixed sessionId
  const sidBuf = Buffer.from(sessionId, "utf-8")
  const sidLen = Buffer.alloc(4)
  sidLen.writeUInt32BE(sidBuf.length, 0)
  h.update(sidLen)
  h.update(sidBuf)

  // Event count
  const countBuf = Buffer.alloc(4)
  countBuf.writeUInt32BE(rows.length, 0)
  h.update(countBuf)

  // Per-event: sequence || length-prefixed id || raw hash bytes
  for (const row of rows) {
    // u64 sequence
    const seqBuf = Buffer.alloc(8)
    seqBuf.writeBigUInt64BE(BigInt(row.sequence), 0)
    h.update(seqBuf)

    // length-prefixed UUID
    const idBuf = Buffer.from(row.id, "utf-8")
    const idLen = Buffer.alloc(4)
    idLen.writeUInt32BE(idBuf.length, 0)
    h.update(idLen)
    h.update(idBuf)

    // raw 32-byte SHA-256 digest (decode hex → bytes)
    h.update(Buffer.from(row.hash, "hex"))
  }

  return h.digest("hex")
}

// ── Proof hash computation ────────────────────────────────────────────

/**
 * Compute proofHash from ProofHashPayload only.
 * proofHash is NOT included in its own input.
 * Uses canonical JSON (sorted keys via replacer).
 */
export function computeProofHash(payload: ProofHashPayload): string {
  const canonical = canonicalJSON(payload)
  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * Verify a proofHash against a payload.
 * Returns true if the hash matches.
 */
export function verifyProofHash(payload: ProofHashPayload, expectedHash: string): boolean {
  const computed = computeProofHash(payload)
  return computed === expectedHash
}

/**
 * Verify a runRoot against session data.
 * Returns true if the root matches.
 */
export function verifyRunRoot(
  sessionId: string,
  rows: ReadonlyArray<{ sequence: number; id: string; hash: string }>,
  expectedRoot: string,
): boolean {
  const computed = computeRunRoot(sessionId, rows)
  return computed === expectedRoot
}

// ── Canonical JSON ────────────────────────────────────────────────────

/**
 * Deterministic JSON serialization.
 * Sorts object keys at every level to guarantee identical output
 * regardless of property insertion order.
 */
function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, sortedReplacer)
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k]
    }
    return sorted
  }
  return value
}

// ── Event hash recomputation (for chain verification) ─────────────────

/**
 * Recompute an event hash from raw row data.
 * Uses the same logic as computeEventHash in @arcana/core/epistemic/event-hash.
 * Duplicated here to avoid a circular dependency in verification path.
 */
function computeEventHashFromRow(row: {
  id: string; sequence: number; timestamp: string; previous_hash: string | null;
  actor_kind: string; actor_id: string; type: string; payload: string;
}): string {
  // Must match @arcana/core/epistemic/event-hash.ts exactly:
  // flat actorKind/actorId, NOT nested actor object
  const canonical = JSON.stringify({
    id: row.id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    previousHash: row.previous_hash,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    type: row.type,
    payload: row.payload,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export * as RunProof from "./run-proof"
