/**
 * TUI-2.1A: Production Spine Input Union
 *
 * Unified input type for the production command-spine mapper.
 * Prevents approval lifecycle logic from leaking across the shell.
 *
 * Path:
 *   governance event → ProductionSpineInput → productionInputToSpineEntry → SpineEntry
 *
 * Never imports:
 *   GovernedApprovalExecutor
 *   raw database mutations
 *   Phase C executor callbacks
 */

import type { SpineEntry, SpineKind } from "./spine-types"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { approvalToSpineEntry } from "./approval-spine-adapter"
import { Locale } from "../../util/locale"
import { shortHash } from "./approval-snapshot"
import type { GovernanceRunProof } from "../types"

// ─── Input Union ──────────────────────────────────────────────────

export type ProductionSpineInput =
  | { source: "GOVERNANCE"; value: GovernanceView }
  | { source: "APPROVAL"; value: ApprovalRecord }

export type GovernanceView = {
  id: string
  sessionId: string
  eventType: string
  timestamp: number
  sequence?: number
  actor?: string
  payload: unknown
}

export type GovernanceTraceView = {
  sessionId: string
  status: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  expectedCriticalEvents: number
  recordedCriticalEvents: number
  recordingErrors: ReadonlyArray<{ timestamp: string; error: string }>
}

// ─── Mapper ──────────────────────────────────────────────────────

/**
 * Convert a ProductionSpineInput to a SpineEntry.
 * Single integration boundary for the production shell.
 */
export function productionInputToSpineEntry(
  input: ProductionSpineInput,
): SpineEntry {
  switch (input.source) {
    case "APPROVAL":
      return approvalToSpineEntry(input.value)

    case "GOVERNANCE":
      return governanceToSpineEntry(input.value)
  }
}

function governanceToSpineEntry(view: GovernanceView): SpineEntry {
  if (view.eventType === "authorization.executed" || view.eventType === "authorization.execution_failed") {
    return governanceExecutedToSpineEntry({ view })
  }
  const presentation = governancePresentation(view)
  const payload = JSON.stringify(view.payload, null, 2) ?? String(view.payload)
  const metadata = [
    `Event: ${view.eventType}`,
    `Sequence: ${view.sequence ?? "unknown"}`,
    `Session: ${view.sessionId}`,
    `Actor: ${view.actor ?? "unknown"}`,
    `Recorded: ${formatRecordedAt(view.timestamp)}`,
  ]
  return {
    id: `governance:${view.id}`,
    index: view.sequence ?? 0,
    elapsed: "",
    occurredAt: view.timestamp,
    timestamp: formatWallClock(view.timestamp),
    actor: view.actor,
    label: presentation.label,
    kind: presentation.kind,
    glyph: presentation.glyph,
    summary: presentation.summary,
    // Governance payloads are evidence. Keep the complete committed payload;
    // viewport wrapping/collapse belongs to presentation, never data removal.
    body: [...metadata, "", payload].join("\n"),
    bodyLabel: "governance event",
    collapsible: true,
    expandedByDefault: presentation.expandedByDefault,
    breakthrough: presentation.breakthrough,
    source: {
      messageID: view.id,
      kind: "governance",
    },
  }
}

/**
 * PR6: proof continuation for an executed (or failed) effect.
 *
 * Rendered directly beneath the completed tool row when the shell can match
 * the effect (by command), and as a standalone proof row otherwise. The
 * receipt is the request hash (the only durable effect hash the governance
 * projection exposes); evidence counts matching `evidence.attached` events;
 * proof level/integrity come from the canonical RunProof snapshot.
 */
export function governanceExecutedToSpineEntry(input: {
  view: GovernanceView
  proof?: GovernanceRunProof
  evidenceCount?: number
}): SpineEntry {
  const { view, proof, evidenceCount } = input
  const payload = asRecord(view.payload)
  const decision = asRecord(payload.decision)
  const failed = view.eventType === "authorization.execution_failed"
  const tool = firstText(payload.tool) ?? "effect"
  const requestHash = firstText(payload.requestHash) ?? "unavailable"
  const executionId = firstText(payload.executionId)
  const policy = firstText(decision.policyVersion) ?? proof?.authorizationProfile.policyVersions?.[0]
  const evidence = typeof evidenceCount === "number" && Number.isFinite(evidenceCount) ? evidenceCount : 0
  const integrity = proof?.integrityStatus ?? "UNVERIFIED"
  const proofLevel = proof?.proofLevel ?? "P0"

  const body = [
    `Receipt: ${shortHash(requestHash)}`,
    `Evidence: ${evidence} artifact${evidence === 1 ? "" : "s"}`,
    `Proof: ${proofLevel} · integrity ${integrity.toLowerCase()}`,
    `Policy: ${policy ?? "unavailable"}`,
    `Request: ${requestHash}`,
    `Tool: ${tool}`,
    `Action: ${firstText(payload.action) ?? "unavailable"}`,
    `Execution: ${executionId ?? "unavailable"}`,
    `Started: ${firstText(payload.startedAt) ?? "unavailable"}`,
    `Completed: ${firstText(payload.completedAt) ?? "unavailable"}`,
  ].join("\n")

  return {
    id: `proof-continuation:${view.id}`,
    index: view.sequence ?? 0,
    elapsed: "",
    occurredAt: view.timestamp,
    timestamp: formatWallClock(view.timestamp),
    kind: failed ? "fail" : "ok",
    glyph: failed ? "×" : "◎",
    label: failed ? "effect failed" : "verified effect",
    summary: `${failed ? "EFFECT FAILED" : "VERIFIED EFFECT"} · ${tool}`,
    body,
    bodyLabel: "execution proof",
    collapsible: true,
    expandedByDefault: failed,
    proof: {
      receipt: shortHash(requestHash),
      evidence,
      proofLevel,
      integrity,
      policy,
      executionId,
      requestHash,
      tool,
      action: firstText(payload.action),
      startedAt: firstText(payload.startedAt),
      completedAt: firstText(payload.completedAt),
    },
    source: { messageID: view.id, sessionID: view.sessionId, kind: "governance" },
  }
}

export function governanceTraceToSpineEntry(view: GovernanceTraceView): SpineEntry | undefined {
  if (view.status === "COMPLETE") return undefined
  const errors = view.recordingErrors.flatMap((item) => [`${item.timestamp}: ${item.error}`])
  return {
    id: `governance-trace:${view.sessionId}`,
    index: 0,
    elapsed: "",
    kind: "fail",
    glyph: "!",
    label: "trace health",
    summary: view.status === "DEGRADED" ? "Governance trace degraded" : "Governance trace unavailable",
    body: [
      `Engine status: ${view.status}`,
      `Expected critical events: ${view.expectedCriticalEvents}`,
      `Recorded critical events: ${view.recordedCriticalEvents}`,
      ...(errors.length ? ["", ...errors] : []),
    ].join("\n"),
    bodyLabel: "governance evidence",
    collapsible: true,
    expandedByDefault: true,
    breakthrough: true,
    source: { messageID: view.sessionId, sessionID: view.sessionId, kind: "governance" },
  }
}

/**
 * Project the canonical RunProof for inspector / tests.
 * Session proof is header chrome (projectSessionCharter), not a timeline row.
 * security claim only when its own authorization trace is COMPLETE; otherwise
 * the row is fail-visible and explicitly says the evidence is unavailable.
 */
export function governanceProofToSpineEntry(sessionId: string, proof: GovernanceRunProof): SpineEntry {
  const authorization = proof.authorizationProfile
  const unauthorized = numeric(authorization.unauthorizedExecutions)
  const orphanExecutions = numeric(authorization.orphanExecutions)
  const evidenceUnhealthy =
    proof.traceHealth !== "COMPLETE"
    || authorization.authorizationTraceHealth !== "COMPLETE"
    || authorization.intentEnforcementMode !== "REQUIRED"
    || authorization.intentTraceHealth !== "COMPLETE"
    || proof.integrityStatus === "INVALID"
    || unauthorized > 0
    || orphanExecutions > 0
  const verified =
    !evidenceUnhealthy
    && proof.integrityStatus === "VALID"
    && proof.assuranceProfile.verification === "VERIFIED"
  const requests = numeric(authorization.requests)
  const allowed = numeric(authorization.allowed)
  const executed = numeric(authorization.executed)
  const denied = numeric(authorization.denied)
  const executionFailures = numeric(authorization.executionFailures)
  const failureSuffix = executionFailures > 0 ? ` · ${executionFailures} failed` : ""
  // Overall assurance is one axis: recorded evidence + required assurance must
  // both be complete. "Authorization trace COMPLETE" no longer reads as a
  // blanket healthy claim when intent/completion/verification are missing.
  const overall = verified ? "complete" : proof.traceHealth === "UNAVAILABLE" ? "unavailable" : "degraded"

  const claims = statusCounts(proof.claimsByStatus)
  const obligations = statusCounts(proof.obligationsByStatus)
  const body = [
    `Proof level: ${proof.proofLevel}`,
    `Overall assurance: ${overall.toUpperCase()}`,
    `Recorded trace: ${proof.traceHealth}`,
    `Authorization trace: ${authorization.authorizationTraceHealth}`,
    `Intent enforcement: ${authorization.intentEnforcementMode}`,
    `Intent trace: ${authorization.intentTraceHealth}`,
    `Intent bindings: ${numeric(authorization.intentBindingsCreated)}`,
    `Integrity: ${proof.integrityStatus}`,
    `Lifecycle: ${proof.lifecycleStatus}`,
    `Completion: ${proof.completionMethod ?? "not resolved"}`,
    `Verification: ${proof.assuranceProfile.verification}`,
    `Reproducibility: ${proof.assuranceProfile.reproducibility}${proof.assuranceProfile.reproducibilityDetail ? ` · ${proof.assuranceProfile.reproducibilityDetail}` : ""}`,
    `Authorization: ${requests} requested · ${allowed} allowed · ${denied} denied · ${executed} executed`,
    `Execution failures: ${executionFailures}`,
    `Unauthorized executions: ${unauthorized}`,
    `Orphan executions: ${orphanExecutions}`,
    `Capability violations: ${numeric(authorization.capabilityViolations)}`,
    `Contract: ${proof.contractStatus ?? "none"}`,
    `Claims: ${claims || "none"}`,
    `Obligations: ${obligations || "none"}`,
    `Events: ${numeric(proof.eventCount)}`,
    `Proof hash: ${proof.proofHash || "unavailable"}`,
    `Run root: ${proof.runRoot || "unavailable"}`,
    ...(proof.gaps.length ? ["", "Evidence gaps:", ...proof.gaps.map((gap) => `- ${gap}`)] : []),
  ].join("\n")

  return {
    id: `governance-proof:${sessionId}`,
    // Stable ordering: the proof always sorts AFTER every governance event.
    // Using `lastSequence + 1` let a lagging proof payload interleave with new
    // events, making the proof row and the governed group swap positions on
    // live updates (visually a transient "second proof" that then vanished).
    index: Number.MAX_SAFE_INTEGER,
    elapsed: "",
    occurredAt: Date.parse(proof.derivedAt),
    timestamp: formatWallClock(Date.parse(proof.derivedAt)),
    kind: evidenceUnhealthy ? "fail" : verified ? "ok" : "inspect",
    glyph: evidenceUnhealthy ? "!" : verified ? "✓" : "◇",
    label: "proof",
    summary: `${proof.proofLevel} · ${overall} · ${allowed} authorized · ${executed} executed · ${denied} denied${failureSuffix}`,
    body,
    bodyLabel: "RunProof",
    collapsible: true,
    // The proof is a summary row by default; the axes + raw events live in
    // the expanded inspector body (progressive disclosure).
    expandedByDefault: false,
    breakthrough: evidenceUnhealthy,
    source: { messageID: sessionId, sessionID: sessionId, kind: "governance" },
  }
}

function governancePresentation(view: GovernanceView): {
  kind: SpineKind
  glyph: string
  label: string
  summary: string
  expandedByDefault: boolean
  breakthrough?: boolean
} {
  const payload = asRecord(view.payload)
  const subject = firstText(
    payload.action,
    payload.tool,
    payload.objective,
    payload.proposition,
    payload.description,
    payload.requestId,
    payload.capabilityId,
    payload.claimId,
    payload.obligationId,
    payload.contractId,
    payload.id,
  )
  const reason = governanceReason(payload)
  const suffix = (value?: string) => (value ? ` · ${Locale.truncate(value, 96)}` : "")

  switch (view.eventType) {
    case "contract.proposed": {
      const revision = numeric(payload.revision)
      const criteria = numeric(payload.criteria)
      const detail = [revision > 0 ? `revision ${revision}` : undefined, criteria > 0 ? `${criteria} criteria` : undefined]
        .filter(Boolean)
        .join(" · ")
      return { kind: "plan", glyph: "◇", label: "contract", summary: `Intent contract proposed${suffix(detail || subject)}`, expandedByDefault: false }
    }
    case "contract.activated":
      return { kind: "ok", glyph: "✓", label: "contract", summary: `Intent contract active${suffix(subject)}`, expandedByDefault: false }
    case "contract.amended":
      return { kind: "inspect", glyph: "◇", label: "contract", summary: `Intent contract updated${suffix(firstText(payload.resolution, payload.reason) ?? subject)}`, expandedByDefault: false }
    case "claim.created":
      return { kind: "inspect", glyph: "◇", label: "claim", summary: `Claim recorded${suffix(subject)}`, expandedByDefault: false }
    case "claim.transitioned": {
      const status = firstText(payload.newStatus) ?? "status unavailable"
      const failed = status === "contradicted"
      return { kind: failed ? "fail" : status === "verified" ? "ok" : "inspect", glyph: failed ? "✗" : status === "verified" ? "✓" : "◇", label: "claim", summary: `Claim ${status}${suffix(subject)}`, expandedByDefault: failed }
    }
    case "evidence.attached":
      return { kind: "ok", glyph: "+", label: "evidence", summary: `Provenance evidence attached${suffix(firstText(payload.relationship) ?? subject)}`, expandedByDefault: false }
    case "obligation.created":
      return { kind: "inspect", glyph: "◇", label: "verify", summary: `Verification obligation created${suffix(subject)}`, expandedByDefault: payload.required === true }
    case "obligation.resolved": {
      const status = firstText(payload.status) ?? "status unavailable"
      const failed = status === "failed" || status === "waived"
      return { kind: failed ? "fail" : "ok", glyph: failed ? "✗" : "✓", label: "verify", summary: `Verification obligation ${status}${suffix(subject)}`, expandedByDefault: failed }
    }
    case "completion.attempted":
      return { kind: "inspect", glyph: "◇", label: "verify", summary: `Completion verification requested${suffix(subject)}`, expandedByDefault: false }
    case "completion.resolved": {
      const method = firstText(payload.method) ?? "method unavailable"
      const verifiedCompletion = method === "VERIFIED_COMPLETE"
      return { kind: verifiedCompletion ? "ok" : "inspect", glyph: verifiedCompletion ? "✓" : "◇", label: "verify", summary: `Completion resolved · ${method}`, expandedByDefault: !verifiedCompletion }
    }
    case "intent.enforcement_required": {
      const revision = firstText(payload.contractRevision) ?? "revision unavailable"
      return { kind: "ok", glyph: "✓", label: "intent", summary: `Exact intent enforcement required · ${revision}${suffix(subject)}`, expandedByDefault: false }
    }
    case "intent.binding_created": {
      const justification = firstText(payload.justification) ?? "justification unavailable"
      return { kind: "ok", glyph: "✓", label: "intent", summary: `Exact intent binding created · ${justification}${suffix(subject)}`, expandedByDefault: false }
    }
    case "intent.binding_revoked":
      return { kind: "fail", glyph: "×", label: "intent revoked", summary: `Intent binding revoked${suffix(reason ?? subject)}`, expandedByDefault: true, breakthrough: true }
    case "intent.compatibility_mode":
      return { kind: "fail", glyph: "!", label: "intent degraded", summary: `Intent enforcement is LEGACY_COMPAT${suffix(reason ?? subject)}`, expandedByDefault: true, breakthrough: true }
    case "authorization.requested":
      return { kind: "inspect", glyph: "◇", label: "authorization", summary: `Authorization requested${suffix(subject)}`, expandedByDefault: false }
    case "authorization.allowed":
      return { kind: "ok", glyph: "✓", label: "authorized", summary: `Authorization allowed${suffix(subject)}`, expandedByDefault: false }
    case "authorization.denied":
      return { kind: "fail", glyph: "✗", label: "denied", summary: `Authorization denied${suffix(reason ?? subject ?? "reason unavailable")}`, expandedByDefault: true, breakthrough: true }
    case "authorization.approval_required":
      return { kind: "approve", glyph: "◤", label: "approval required", summary: `Approval required${suffix(reason ?? subject)}`, expandedByDefault: true }
    case "authorization.stale":
      return { kind: "fail", glyph: "!", label: "stale decision", summary: `Authorization became stale${suffix(reason ?? subject)}`, expandedByDefault: true, breakthrough: true }
    case "authorization.executed":
      return { kind: "ok", glyph: "✓", label: "executed", summary: `Authorized effect executed${suffix(subject)}`, expandedByDefault: false }
    case "authorization.execution_failed":
      return { kind: "fail", glyph: "✗", label: "execution failed", summary: `Authorized effect failed${suffix(reason ?? subject)}`, expandedByDefault: true, breakthrough: true }
    case "capability.created":
      return { kind: "ok", glyph: "+", label: "capability", summary: `Capability created${suffix(subject)}`, expandedByDefault: false }
    case "capability.revoked":
      return { kind: "fail", glyph: "×", label: "revoked", summary: `Capability revoked${suffix(reason ?? subject)}`, expandedByDefault: true, breakthrough: true }
    case "capability.exhausted":
      return { kind: "fail", glyph: "×", label: "exhausted", summary: `Capability exhausted${suffix(subject)}`, expandedByDefault: true, breakthrough: true }
    case "verification.recorded": {
      const outcome = firstText(payload.outcome) ?? "recorded"
      const verification = firstText(payload.verification) ?? "verification"
      const failed = outcome === "failed" || outcome === "waived"
      return {
        kind: failed ? "fail" : "ok",
        glyph: failed ? "✗" : "✓",
        label: "operator decision",
        summary: `Operator verification ${outcome} · ${verification}${suffix(reason)}`,
        expandedByDefault: failed,
      }
    }
    default:
      return { kind: "inspect", glyph: "◇", label: "governance", summary: view.eventType, expandedByDefault: false }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0)
}

function governanceReason(payload: Record<string, unknown>): string | undefined {
  const direct = firstText(payload.reason, payload.error)
  if (direct) return direct
  const decision = asRecord(payload.decision)
  const decisionReason = firstText(decision.reason, decision.reasonCode, decision.code)
  if (decisionReason) return decisionReason
  if (Array.isArray(decision.reasons)) {
    const reasons = decision.reasons.filter((value): value is string => typeof value === "string")
    if (reasons.length) return reasons.join(", ")
  }
  return undefined
}

function numeric(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function statusCounts(value: Record<string, unknown>): string {
  return Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status} ${numeric(count)}`)
    .join(" · ")
}

function formatWallClock(timestamp: number): string | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function formatRecordedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "unknown"
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString()
}
