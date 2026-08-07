/**
 * ADR-003: Authority Action Affordance Contract
 *
 * Runtime-derived read model for operator-facing authority actions.
 * A client must never infer actionability from approval state, route text,
 * cached timestamps, or local UI state; it renders these affordances and
 * submits the corresponding bounded command. `available` is not an
 * authorization result and never replaces command-time revalidation.
 *
 * The vocabulary below is the ADR-003 machine vocabulary:
 *   - actions: inspect, approve, deny, revoke, retry_refresh, open_forensic
 *   - states: available, unavailable, in_flight, completed
 *   - surfaces: LOCAL_TUI, DESKTOP, CONTROL, SDK
 *   - reason codes: exactly the stable list in ADR-003
 */

import type { ApprovalRecord, AuthenticatedOperator } from "./approval-lifecycle"

export type AuthorityAction =
  | "inspect"
  | "approve"
  | "deny"
  | "revoke"
  | "retry_refresh"
  | "open_forensic"

export type AuthorityAffordanceState = "available" | "unavailable" | "in_flight" | "completed"

export type AuthoritySurface = "LOCAL_TUI" | "DESKTOP" | "CONTROL" | "SDK"

export type AuthorityAffordanceReason =
  | "OFFLINE"
  | "STALE_RECORD"
  | "RESYNC_REQUIRED"
  | "PROTOCOL_MISMATCH"
  | "ROUTE_LOCAL_TUI_ONLY"
  | "ROUTE_DESKTOP_REQUIRED"
  | "ROUTE_CENTRAL_REQUIRED"
  | "LOCAL_FALLBACK_NOT_ALLOWED"
  | "SURFACE_NOT_AUTHORIZED"
  | "SESSION_RESTRICTION"
  | "WORKSPACE_MISMATCH"
  | "AUTHENTICATION_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_REVOKED"
  | "ALREADY_DECIDED"
  | "ALREADY_CLAIMED"
  | "ALREADY_CONSUMED"
  | "REQUEST_CHANGED"
  | "CONTRACT_REVISION_CHANGED"
  | "CAPABILITY_REVOKED"
  | "POLICY_CHANGED"
  | "EVIDENCE_DEGRADED"
  | "UNKNOWN_RUNTIME_STATE"

export type AuthorityAffordance = {
  action: AuthorityAction
  state: AuthorityAffordanceState
  reasonCode?: AuthorityAffordanceReason
  expectedVersion?: number
  expectedRequestHash?: string
  expectedContractRevision?: number
  surface: AuthoritySurface
  requiresFreshRecord: boolean
  destructive: boolean
}

export type AuthorityFreshness = "FRESH" | "STALE" | "UNKNOWN"

/** Exact-request fields the operator's surface displayed and reviewed. */
export type ViewedApprovalRequest = {
  expectedVersion: number
  expectedRequestHash: string
  expectedContractRevision: number
}

/**
 * All inputs are explicit. This function is side-effect-free: it cannot read
 * clocks without an injected `now`, cannot write, and cannot authorize.
 * Any uncertainty fails closed to `unavailable` with a reason code; it never
 * optimistically returns `available`.
 */
export type AuthorityAffordanceInput = {
  approval: ApprovalRecord
  /** Authenticated operator identity derived by the runtime, never a client payload. */
  operator: AuthenticatedOperator
  /** Authenticated decision surface derived by the runtime. */
  surface: AuthoritySurface
  /**
   * The workspace the authenticated context resolved to. When present, a
   * record outside that workspace is unavailable with WORKSPACE_MISMATCH.
   */
  workspaceId?: string
  /** Optional authenticated session restriction (x-arcana-session). Grants nothing. */
  sessionRestriction?: string
  freshness: AuthorityFreshness
  connected: boolean
  protocolCompatible: boolean
  resyncRequired: boolean
  /** Live Desktop subscriber state for the routed workspace (advisory). */
  desktopOnline?: boolean
  /** Overrides the record's persisted localFallbackAllowed when known. */
  localFallbackAllowed?: boolean
  /** Actions currently in flight on this surface; rendered as in_flight. */
  inFlight?: readonly AuthorityAction[]
  /** Exact-request fields the operator's surface displayed; used for stale detection. */
  viewed?: ViewedApprovalRequest
  now?: Date
  capabilityValid?: boolean
  policyCompatible?: boolean
  evidenceDegraded?: boolean
}

const DECISION_ACTIONS: readonly Extract<AuthorityAction, "approve" | "deny" | "revoke">[] = [
  "approve",
  "deny",
  "revoke",
]

const AFFORDANCE_ORDER: readonly AuthorityAction[] = [
  "inspect",
  "approve",
  "deny",
  "revoke",
  "retry_refresh",
  "open_forensic",
]

function expectedFields(approval: ApprovalRecord): Pick<
  AuthorityAffordance,
  "expectedVersion" | "expectedRequestHash" | "expectedContractRevision"
> {
  return {
    expectedVersion: approval.version,
    expectedRequestHash: approval.requestHash,
    expectedContractRevision: approval.contractRevision,
  }
}

function isInFlight(input: AuthorityAffordanceInput, action: AuthorityAction): boolean {
  return input.inFlight?.includes(action) ?? false
}

function baseProblem(
  input: AuthorityAffordanceInput,
): AuthorityAffordanceReason | undefined {
  if (!input.connected) return "OFFLINE"
  if (!input.protocolCompatible) return "PROTOCOL_MISMATCH"
  if (input.resyncRequired) return "RESYNC_REQUIRED"
  if (input.freshness === "STALE") return "STALE_RECORD"
  if (input.freshness === "UNKNOWN") return "UNKNOWN_RUNTIME_STATE"
  return undefined
}

function viewedProblem(input: AuthorityAffordanceInput): AuthorityAffordanceReason | undefined {
  const viewed = input.viewed
  if (!viewed) return undefined
  if (viewed.expectedVersion !== input.approval.version) return "STALE_RECORD"
  if (viewed.expectedRequestHash !== input.approval.requestHash) return "REQUEST_CHANGED"
  if (viewed.expectedContractRevision !== input.approval.contractRevision) {
    return "CONTRACT_REVISION_CHANGED"
  }
  return undefined
}

function routeProblem(
  input: AuthorityAffordanceInput,
): AuthorityAffordanceReason | undefined {
  const approval = input.approval
  const route = approval.route ?? "LOCAL_TUI"

  switch (route) {
    case "LOCAL_TUI":
      return input.surface === "LOCAL_TUI" ? undefined : "ROUTE_LOCAL_TUI_ONLY"

    case "CENTRAL_REQUIRED":
      return input.surface === "CONTROL" ? undefined : "ROUTE_CENTRAL_REQUIRED"

    case "DESKTOP_REQUIRED": {
      if (input.desktopOnline === undefined) return "UNKNOWN_RUNTIME_STATE"
      if (input.surface !== "DESKTOP") return "ROUTE_DESKTOP_REQUIRED"
      return input.desktopOnline ? undefined : "OFFLINE"
    }

    case "DESKTOP_PREFERRED": {
      if (input.desktopOnline === undefined) return "UNKNOWN_RUNTIME_STATE"
      if (input.surface === "DESKTOP") return input.desktopOnline ? undefined : "OFFLINE"
      if (input.surface === "LOCAL_TUI") {
        if (input.desktopOnline) return "ROUTE_DESKTOP_REQUIRED"
        const fallbackAllowed = input.localFallbackAllowed ?? approval.localFallbackAllowed !== false
        return fallbackAllowed ? undefined : "LOCAL_FALLBACK_NOT_ALLOWED"
      }
      return "SURFACE_NOT_AUTHORIZED"
    }

    default:
      return "UNKNOWN_RUNTIME_STATE"
  }
}

function completedState(action: AuthorityAction, state: ApprovalRecord["state"]): boolean {
  switch (action) {
    case "approve":
      return state === "APPROVED" || state === "CLAIMED" || state === "CONSUMED"
    case "deny":
      return state === "DENIED"
    case "revoke":
      return state === "INVALIDATED"
    default:
      return false
  }
}

function decisionProblem(
  input: AuthorityAffordanceInput,
  action: Extract<AuthorityAction, "approve" | "deny" | "revoke">,
): AuthorityAffordanceReason | undefined {
  const approval = input.approval

  if (!input.operator.operatorId) return "AUTHENTICATION_REQUIRED"
  if (input.workspaceId !== undefined && approval.workspaceId !== input.workspaceId) {
    return "WORKSPACE_MISMATCH"
  }
  if (input.sessionRestriction && approval.sessionId !== input.sessionRestriction) {
    return "SESSION_RESTRICTION"
  }
  const workspaceAllowed =
    input.operator.workspaceScope.includes(approval.workspaceId) ||
    input.operator.workspaceScope.includes("*")
  if (!workspaceAllowed) return "SURFACE_NOT_AUTHORIZED"
  if (input.capabilityValid === false) return "CAPABILITY_REVOKED"
  if (input.policyCompatible === false) return "POLICY_CHANGED"

  const base = baseProblem(input)
  if (base) return base

  const viewed = viewedProblem(input)
  if (viewed) return viewed

  const now = input.now ?? new Date()
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) return "APPROVAL_EXPIRED"

  switch (approval.state) {
    case "PENDING":
      return routeProblem(input)

    case "APPROVED":
      if (action === "revoke") return routeProblem(input)
      return "ALREADY_DECIDED"

    case "DENIED":
      return "ALREADY_DECIDED"

    case "CLAIMED":
      return "ALREADY_CLAIMED"

    case "CONSUMED":
      return "ALREADY_CONSUMED"

    case "EXPIRED":
      return "APPROVAL_EXPIRED"

    case "INVALIDATED":
      return "APPROVAL_REVOKED"

    default:
      return "UNKNOWN_RUNTIME_STATE"
  }
}

function decisionAffordance(
  input: AuthorityAffordanceInput,
  action: Extract<AuthorityAction, "approve" | "deny" | "revoke">,
): AuthorityAffordance {
  const destructive = action !== "approve"
  const base = {
    action,
    ...expectedFields(input.approval),
    surface: input.surface,
    requiresFreshRecord: true,
    destructive,
  }

  if (isInFlight(input, action)) {
    return { ...base, state: "in_flight" }
  }
  if (completedState(action, input.approval.state)) {
    return { ...base, state: "completed" }
  }

  const reason = decisionProblem(input, action)
  if (reason) {
    return { ...base, state: "unavailable", reasonCode: reason }
  }
  return { ...base, state: "available" }
}

function refreshAffordance(input: AuthorityAffordanceInput): AuthorityAffordance {
  const base = {
    action: "retry_refresh" as const,
    ...expectedFields(input.approval),
    surface: input.surface,
    requiresFreshRecord: false,
    destructive: false,
  }
  if (isInFlight(input, "retry_refresh")) {
    return { ...base, state: "in_flight" }
  }
  const needsRefresh =
    baseProblem(input) !== undefined ||
    viewedProblem(input) !== undefined ||
    input.freshness !== "FRESH" ||
    input.evidenceDegraded === true
  return needsRefresh ? { ...base, state: "available" } : { ...base, state: "completed" }
}

function inspectionAffordance(
  input: AuthorityAffordanceInput,
  action: "inspect" | "open_forensic",
): AuthorityAffordance {
  const base = {
    action,
    ...expectedFields(input.approval),
    surface: input.surface,
    requiresFreshRecord: false,
    destructive: false,
  }
  if (isInFlight(input, action)) {
    return { ...base, state: "in_flight" }
  }
  return {
    ...base,
    state: "available",
    ...(input.evidenceDegraded === true && action === "open_forensic"
      ? { reasonCode: "EVIDENCE_DEGRADED" as const }
      : {}),
  }
}

/**
 * Derive the affordance set for one approval from authoritative runtime
 * inputs. Pure and deterministic: no writes, no client display preferences,
 * no authority. `available` only means the authenticated surface may submit
 * the bounded command; the runtime still revalidates atomically.
 */
export function deriveAuthorityAffordances(input: AuthorityAffordanceInput): AuthorityAffordance[] {
  const byAction = new Map<AuthorityAction, AuthorityAffordance>()

  byAction.set("inspect", inspectionAffordance(input, "inspect"))
  for (const action of DECISION_ACTIONS) {
    byAction.set(action, decisionAffordance(input, action))
  }
  byAction.set("retry_refresh", refreshAffordance(input))
  byAction.set("open_forensic", inspectionAffordance(input, "open_forensic"))

  return AFFORDANCE_ORDER.map((action) => byAction.get(action)!)
}
