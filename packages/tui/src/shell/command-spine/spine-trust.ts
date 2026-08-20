/**
 * PR6: trust-first header model.
 *
 * The header answers "can I trust what I am seeing, and can I act?" before
 * model/context details. All inputs come from real runtime state:
 * - connection: sync bootstrap status + SSE stream activity
 * - governance trace health: engine session governance projection
 * - proof integrity: canonical RunProof snapshot
 * - pending approvals: durable approval records for the session
 */

export type SpineTrustConnection = "connected" | "connecting" | "degraded"

export type SpineTrustState = "healthy" | "degraded" | "disconnected"

export type SpineTrustEventGap = { from: number; to: number }

export type SpineTrustInput = {
  syncStatus: "loading" | "partial" | "complete"
  streamActive: boolean
  trace?: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  integrity?: "VALID" | "INVALID" | "UNVERIFIED"
  proofLevel?: string
  pendingApprovals: number
  eventGap?: SpineTrustEventGap
  /** When true, UNAVAILABLE trace health is treated as acceptable (self-governance mode). */
  selfGovernance?: boolean
}

export type SpineTrustStatus = {
  state: SpineTrustState
  connection: SpineTrustConnection
  trace: "COMPLETE" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN"
  integrity: "VALID" | "INVALID" | "UNVERIFIED" | "UNKNOWN"
  proofLevel?: string
  pendingApprovals: number
  workspaceTrusted: boolean
  authorityActionsDisabled: boolean
  eventGap?: SpineTrustEventGap
}

export function buildTrustStatus(input: SpineTrustInput): SpineTrustStatus {
  const connection: SpineTrustConnection =
    input.syncStatus === "loading"
      ? "connecting"
      : input.streamActive
        ? "connected"
        : input.syncStatus === "complete"
          ? "degraded"
          : "connecting"

  const trace = input.trace ?? "UNKNOWN"
  const integrity = input.integrity ?? "UNKNOWN"
  // In self-governance mode, UNAVAILABLE trace is acceptable (no external daemon required)
  const unhealthyTrace = input.selfGovernance
    ? trace === "DEGRADED"
    : trace === "DEGRADED" || trace === "UNAVAILABLE"
  const unhealthyIntegrity = integrity === "INVALID" || integrity === "UNVERIFIED"
  const hasGap = input.eventGap !== undefined

  const state: SpineTrustState =
    connection === "connecting"
      ? "disconnected"
      : unhealthyTrace || unhealthyIntegrity || hasGap || connection === "degraded"
        ? "degraded"
        : "healthy"

  // In self-governance mode, UNVERIFIED integrity is acceptable for local operation
  const effectiveIntegrity = input.selfGovernance && integrity === "UNVERIFIED" ? "VALID" : integrity
  const workspaceTrusted =
    state === "healthy" && (trace === "COMPLETE" || (input.selfGovernance === true && trace === "UNAVAILABLE")) && effectiveIntegrity === "VALID" && !hasGap

  return {
    state,
    connection,
    trace,
    integrity,
    proofLevel: input.proofLevel,
    pendingApprovals: input.pendingApprovals,
    workspaceTrusted,
    authorityActionsDisabled: !workspaceTrusted || connection !== "connected",
    eventGap: input.eventGap,
  }
}

/** Event gap derived from the governance trace when evidence is missing. */
export function eventGapFromTrace(input: {
  trace?: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  expectedCriticalEvents?: number
  recordedCriticalEvents?: number
}): SpineTrustEventGap | undefined {
  if (input.trace === "COMPLETE") return undefined
  const expected = input.expectedCriticalEvents
  const recorded = input.recordedCriticalEvents
  if (typeof expected !== "number" || typeof recorded !== "number") return undefined
  if (!Number.isFinite(expected) || !Number.isFinite(recorded)) return undefined
  if (recorded >= expected) return undefined
  return { from: recorded + 1, to: expected }
}
