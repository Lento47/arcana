/**
 * Gate protocol types for Arcana as a deliberate permission surface.
 *
 * arcana-desktop owns policy, autonomy, and audit.
 * Arcana renders the ask + receipt when a gate fires.
 */

export type PermissionDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "edited"
  | "auto"
  | "expired"

export type ExecutionState = "idle" | "running" | "success" | "error" | "cancelled"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type WorkDensity = "comfortable" | "compact"

export type WorkVoice = "quiet" | "arcane"

export type RememberScope = "session" | "project"

/** Why Arcana is interrupting — produced by desktop / local policy evaluation. */
export type PermissionRequest = {
  id: string
  reason: string
  reasonCode?: string
  risk: RiskLevel
  policyId?: string
  scope?: string
}

/** The action under review or already executed. */
export type ActionPayload = {
  tool: string
  title: string
  /** Command, patch summary, URL, etc. Editable when decision is pending and editable=true. */
  preview: string
  editable?: boolean
  meta?: {
    cwd?: string
    path?: string
    durationMs?: number
    exitCode?: number
  }
}

/** Event Arcana receives when a gate fires. */
export type GateEvent = {
  request: PermissionRequest
  action: ActionPayload
}

/** Resolution Arcana sends back to the runtime / desktop. */
export type GateResolution = {
  id: string
  decision: Extract<PermissionDecision, "approved" | "rejected" | "edited">
  preview: string
  remember?: RememberScope
}

export function defaultOpenForPermission(
  decision: PermissionDecision,
  execution?: ExecutionState,
): boolean {
  if (decision === "pending") return true
  if (execution === "error") return true
  return false
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

type VoiceLabels = {
  approve: string
  reject: string
  edit: string
  remember: string
  waiting: string
  approved: string
  rejected: string
  edited: string
  auto: string
  running: string
  success: string
  error: string
  cancelled: string
}

const quiet: VoiceLabels = {
  approve: "Approve",
  reject: "Reject",
  edit: "Edit",
  remember: "Remember",
  waiting: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Edited",
  auto: "Allowed by policy",
  running: "Running",
  success: "Done",
  error: "Failed",
  cancelled: "Cancelled",
}

const arcane: VoiceLabels = {
  approve: "Seal",
  reject: "Refuse",
  edit: "Amend",
  remember: "Bind",
  waiting: "Awaiting seal",
  approved: "Sealed",
  rejected: "Refused",
  edited: "Amended",
  auto: "Passed the circle",
  running: "Channeling",
  success: "Complete",
  error: "Corrupted",
  cancelled: "Dismissed",
}

export function permissionLabels(voice: WorkVoice = "quiet"): VoiceLabels {
  return voice === "arcane" ? arcane : quiet
}
