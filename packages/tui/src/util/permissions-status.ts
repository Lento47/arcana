/**
 * Pure projection for the permissions status view (DialogPermissions).
 *
 * Answers one operator question: "what is waiting on me right now?"
 * Two independent queues feed it:
 *   - durable approval gates (ApprovalRecord with state PENDING) — the
 *     governed-approval path (P1 exact request → operator decide)
 *   - classic permission requests (PermissionRequest) — the action gates
 *     the engine is holding for allow-once / always / reject
 *
 * Separating the projection from the component keeps the rendering trivial
 * and lets the verifier suite pin the exact row labels.
 */

import type { ApprovalRecord, ApprovalState } from "@arcana/core/crypto/approval-lifecycle"
import type { PermissionRequest, SessionGovernanceResponse } from "@arcana/sdk/v2"
import { Locale } from "./locale"

/** Most recent non-pending approval records to show in the activity list. */
export const RECENT_ACTIVITY_LIMIT = 6

export type PermissionsStatus = {
  /** Durable approval records still awaiting an operator decision. */
  pendingApprovals: ApprovalRecord[]
  /** Classic permission action gates still awaiting a decision. */
  pendingRequests: readonly PermissionRequest[]
  /** Combined queue length — the "waiting" headline number. */
  totalWaiting: number
  /** Session authorization profile (P1–P3 counters), null when the
   *  governance projection is unavailable (never painted as zero). */
  authorization: AuthorizationStatus | null
  /** Most recent non-pending approval records, newest first. */
  recentActivity: ApprovalActivity[]
}

export type AuthorizationStatus = {
  traceHealth: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  requests: number
  allowed: number
  denied: number
  approvalsRequired: number
  executed: number
  staleDecisions: number
  unauthorizedExecutions: number
  capabilityViolations: number
}

export type ApprovalActivity = {
  approvalId: string
  requestHash: string
  state: ApprovalState
  updatedAt: string
  /** Session that spawned the approval's session (subagent delegation). */
  parentSessionId?: string
}

const numberValue = (value: number | string | undefined): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value) || 0
  return 0
}

const plural = (count: number): string => (count === 1 ? "" : "s")

export function projectPermissionsStatus(input: {
  approvals: readonly ApprovalRecord[]
  requests: readonly PermissionRequest[]
  governance?: SessionGovernanceResponse | null
}): PermissionsStatus {
  const pendingApprovals = input.approvals.filter((approval) => approval.state === "PENDING")
  const pendingRequests = input.requests

  const profile = input.governance?.proof?.authorizationProfile
  const traceHealth = input.governance?.trace.status ?? "UNAVAILABLE"
  // Fail-closed: an unavailable projection is never presented as zero counts.
  const authorization: AuthorizationStatus | null =
    profile && traceHealth !== "UNAVAILABLE"
      ? {
          traceHealth,
          requests: numberValue(profile.requests),
          allowed: numberValue(profile.allowed),
          denied: numberValue(profile.denied),
          approvalsRequired: numberValue(profile.approvalsRequired),
          executed: numberValue(profile.executed),
          staleDecisions: numberValue(profile.staleDecisions),
          unauthorizedExecutions: numberValue(profile.unauthorizedExecutions),
          capabilityViolations: numberValue(profile.capabilityViolations),
        }
      : null

  const recentActivity = input.approvals
    .filter((approval) => approval.state !== "PENDING")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((approval) => ({
      approvalId: approval.approvalId,
      requestHash: approval.requestHash,
      state: approval.state,
      updatedAt: approval.updatedAt,
      parentSessionId: approval.parentSessionId,
    }))

  return {
    pendingApprovals,
    pendingRequests,
    totalWaiting: pendingApprovals.length + pendingRequests.length,
    authorization,
    recentActivity,
  }
}

/** One-line P1–P3 counter summary — the "requests status" headline. */
export function authorizationSummary(authorization: AuthorizationStatus): string {
  return [
    `${authorization.requests} request${plural(authorization.requests)}`,
    `${authorization.allowed} allowed`,
    `${authorization.denied} denied`,
    `${authorization.approvalsRequired} approval${plural(authorization.approvalsRequired)} required`,
    `${authorization.executed} executed`,
  ].join(" · ")
}

/** Non-zero integrity flags that must never be hidden on a healthy-looking row. */
export function authorizationWarnings(authorization: AuthorizationStatus): string[] {
  const warnings: string[] = []
  if (authorization.staleDecisions > 0) {
    warnings.push(`${authorization.staleDecisions} stale decision${plural(authorization.staleDecisions)}`)
  }
  if (authorization.unauthorizedExecutions > 0) {
    warnings.push(
      `${authorization.unauthorizedExecutions} unauthorized execution${plural(authorization.unauthorizedExecutions)}`,
    )
  }
  if (authorization.capabilityViolations > 0) {
    warnings.push(
      `${authorization.capabilityViolations} capability violation${plural(authorization.capabilityViolations)}`,
    )
  }
  return warnings
}

/** Compact marker for an approval outcome, for the activity list. */
export function approvalStateMarker(state: ApprovalState): string {
  switch (state) {
    case "APPROVED":
    case "CONSUMED":
      return "✓"
    case "DENIED":
      return "✗"
    case "CLAIMED":
      return "►"
    case "EXPIRED":
      return "∅"
    case "INVALIDATED":
      return "⊘"
    case "PENDING":
      return "◤"
  }
}

/** Relative time for a past event — "just now", "4m ago", "2h ago", "3d ago". */
export function relativeTimeLabel(value: string): string {
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return "recently"
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Subagent attribution suffix for an approval owned by a child session. */
export function subagentSuffix(approval: { parentSessionId?: string }): string {
  return approval.parentSessionId ? " · subagent" : ""
}

/** One-line summary for a settled approval in the activity list. */
export function approvalActivityRow(activity: ApprovalActivity): string {
  const id = Locale.truncate(activity.approvalId, 12)
  return `${activity.state.toLowerCase()} ${id} · request ${activity.requestHash.slice(0, 8)} · ${relativeTimeLabel(activity.updatedAt)}${subagentSuffix(activity)}`
}

/**
 * Relative expiry label — "5m left", "2h left", "3d left", "expired".
 * Never a bare ISO string: an operator deciding an approval needs to know
 * at a glance whether it is still actionable.
 */
export function expiresLabel(value: string | undefined): string {
  if (!value) return "no expiry"
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return "no expiry"
  const ms = at - Date.now()
  if (ms <= 0) return "expired"
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

/** Which operator surface decides an approval, from its routing policy. */
export type ApprovalSurface = "spine" | "desktop" | "central"

export function approvalSurface(route: ApprovalRecord["route"]): ApprovalSurface | null {
  switch (route) {
    case "LOCAL_TUI":
      return "spine"
    case "DESKTOP_PREFERRED":
    case "DESKTOP_REQUIRED":
      return "desktop"
    case "CENTRAL_REQUIRED":
      return "central"
    default:
      // No routing metadata on the record — surface unknown, keep the row bare.
      return null
  }
}

/** One-line summary for a durable approval waiting on the operator. */
export function approvalStatusRow(approval: ApprovalRecord): string {
  const id = Locale.truncate(approval.approvalId, 16)
  const request = approval.requestHash.slice(0, 8)
  const surface = approvalSurface(approval.route)
  return `approval ${id} · request ${request} · ${expiresLabel(approval.expiresAt)}${surface ? ` · ${surface}` : ""}${subagentSuffix(approval)}`
}

/**
 * Footer guidance naming the actual decision surface(s) for what is waiting.
 *
 * The TUI only ever sees classic permission gates it may decide itself, but
 * durable approvals carry a routing surface: with a live Arcana Desktop the
 * engine routes gates to Desktop (DESKTOP_PREFERRED / DESKTOP_REQUIRED) and
 * the TUI spine decides only LOCAL_TUI work. The hint must say where the
 * decision happens, never assume the spine.
 */
export function waitingHint(status: Pick<PermissionsStatus, "pendingApprovals" | "pendingRequests">): string {
  const surfaces = new Set<ApprovalSurface>()
  for (const approval of status.pendingApprovals) {
    const surface = approvalSurface(approval.route)
    if (surface) surfaces.add(surface)
  }
  const spineWork = status.pendingRequests.length > 0 || surfaces.has("spine")
  const desktopWork = surfaces.has("desktop")
  const centralWork = surfaces.has("central")

  if (desktopWork && !spineWork && !centralWork) {
    return "Waiting for Arcana Desktop to decide these approvals."
  }
  if (centralWork && !spineWork && !desktopWork) {
    return "Waiting for the central authority to decide these approvals."
  }
  if (desktopWork) {
    return "Arcana Desktop decides the desktop-routed gates; the session spine decides the rest (a approve once / d deny / v inspect)."
  }
  if (spineWork) {
    return "Decide them on the session spine (a approve once / d deny / v inspect)."
  }
  return "New gates appear here while the agent waits for your decision."
}

/** Guard flags embedded in edit/write/apply_patch permission metadata. */
export interface EditGuardFlags {
  wholesale_replacement?: boolean
  large_change?: boolean
  backup_created?: boolean
  destructive_patch?: boolean
  permission_policy?: boolean
  self_awareness?: boolean
  /** Stable guard rule IDs describing why the mutation is guarded. */
  guard_rules?: readonly string[]
}

/** Extract file-edit-guard flags from a permission request's metadata. */
export function extractGuardFlags(metadata: Record<string, unknown>): EditGuardFlags {
  const guardRules = Array.isArray(metadata.guard_rules)
    ? metadata.guard_rules.filter((r): r is string => typeof r === "string")
    : undefined
  return {
    wholesale_replacement: typeof metadata.wholesale_replacement === "boolean" ? metadata.wholesale_replacement : undefined,
    large_change: typeof metadata.large_change === "boolean" ? metadata.large_change : undefined,
    backup_created: typeof metadata.backup_created === "boolean" ? metadata.backup_created : undefined,
    destructive_patch: typeof metadata.destructive_patch === "boolean" ? metadata.destructive_patch : undefined,
    permission_policy: typeof metadata.permission_policy === "boolean" ? metadata.permission_policy : undefined,
    self_awareness: typeof metadata.self_awareness === "boolean" ? metadata.self_awareness : undefined,
    guard_rules: guardRules,
  }
}

/** Map a guard rule ID to a human-readable chip label. */
export function guardRuleLabel(rule: string): string {
  switch (rule) {
    case "WHOLESALE_REPLACEMENT":
      return "WHOLESALE REPLACEMENT"
    case "LARGE_CHANGE":
      return "LARGE CHANGE"
    case "BLOCK_DELETION":
      return "BLOCK DELETION"
    case "BLOCK_INSERTION":
      return "BLOCK INSERTION"
    case "MANIFEST_EDIT":
      return "manifest edit"
    case "PERMISSION_POLICY_EDIT":
      return "permission policy"
    case "SELF_AWARENESS_DESTRUCTIVE":
      return "self-awareness rewrite"
    case "FILE_DELETE":
      return "FILE DELETE"
    case "FILE_MOVE":
      return "FILE MOVE"
    default:
      return rule.replace(/_/g, " ").toLowerCase()
  }
}

/** Guard-specific warning chips for a permission request. */
export function guardWarnings(flags: EditGuardFlags): string[] {
  const warnings: string[] = []
  if (flags.wholesale_replacement) warnings.push(guardRuleLabel("WHOLESALE_REPLACEMENT"))
  if (flags.large_change) warnings.push(guardRuleLabel("LARGE_CHANGE"))
  if (flags.destructive_patch) warnings.push("destructive patch")
  if (flags.permission_policy) warnings.push(guardRuleLabel("PERMISSION_POLICY_EDIT"))
  if (flags.self_awareness) warnings.push("self-awareness")
  for (const rule of flags.guard_rules ?? []) {
    const label = guardRuleLabel(rule)
    if (!warnings.includes(label)) warnings.push(label)
  }
  if (flags.backup_created) warnings.push("backup created")
  return warnings
}

/**
 * Guard summary suffix — a compact, inline indicator for the permission row.
 * Example: "edit · foo.ts  · ⚠ WHOLESALE · backup" or empty string.
 */
export function guardSuffix(flags: EditGuardFlags): string {
  const chips = guardWarnings(flags)
  if (chips.length === 0) return ""
  return "  · " + chips.map((c) => (c === "backup created" ? c : `⚠ ${c}`)).join(" · ")
}

/** One-line summary for a classic permission action gate. */
export function permissionRequestSummary(request: PermissionRequest): string {
  const data = request.metadata ?? {}
  const field = (key: string): string => (typeof data[key] === "string" ? (data[key] as string).trim() : "")
  const label = (kind: string, detail: string) => (detail ? `${kind} · ${Locale.truncate(detail, 48)}` : kind)

  switch (request.permission) {
    case "bash": {
      const command = field("command") || field("description")
      return label("bash", command)
    }
    case "read": {
      return label("read", field("filePath") || field("filepath"))
    }
    case "edit": {
      const base = label("edit", field("filepath") || field("filePath"))
      return base + guardSuffix(extractGuardFlags(data))
    }
    case "glob":
      return label("glob", field("pattern"))
    case "grep":
      return label("grep", field("pattern"))
    case "list":
      return label("list", field("path"))
    case "webfetch":
      return label("webfetch", field("url"))
    case "websearch":
      return label("websearch", field("query"))
    case "task":
      return label("task", field("description"))
    case "external_directory": {
      const parent = field("parentDir") || field("filepath") || (typeof request.patterns?.[0] === "string" ? request.patterns[0] : "")
      return label("external directory", parent)
    }
    case "doom_loop":
      return "continue after repeated failures"
    default:
      return request.permission
  }
}
