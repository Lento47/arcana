/**
 * Self-driven session loop: after the model idles, decide whether to continue
 * working toward the session goal without another user message.
 *
 * Pure. The prompt loop gathers a snapshot and calls `decideDrive`.
 * Continuations are the same session, same PEP — not extra authority.
 */
import type { GoalStatus } from "@arcana/core/session/goal"

export const DEFAULT_MAX_CONTINUATIONS = 6

/** Agents that drive until the user prompt is satisfied. */
export const DRIVE_AGENTS = new Set(["build", "general"])

export const DRIVE_CONTINUATION_REMINDER = [
  "<system-reminder>",
  "The session goal is still open. Continue from the current workspace state.",
  "Do not restart. Do not wait for another user message.",
  "Ask `question` if a decision is required. Call `goal_check` with status complete",
  "only when the user's prompt is actually satisfied.",
  "</system-reminder>",
].join("\n")

export const DRIVE_METADATA = {
  continuations: "__arcana_drive_continuations",
  exhausted: "__arcana_drive_exhausted",
  decisionRequired: "__arcana_decision_required",
} as const

export type DriveSnapshot = {
  enabled: boolean
  agent: string
  goalStatus: GoalStatus | "unset"
  pendingQuestions: number
  pendingPermissions: number
  pendingApprovals: number
  cancelled: boolean
  pepDeniedRequired: boolean
  continuationsUsed: number
  maxContinuations: number
}

export type DriveStopReason =
  | "disabled"
  | "agent_exempt"
  | "no_goal"
  | "goal_complete"
  | "goal_blocked"
  | "goal_stale"
  | "decision_required"
  | "cancelled"
  | "pep_denied"
  | "exhausted"

export type DriveDecision =
  | { action: "continue"; reason: "goal_open" }
  | { action: "stop"; reason: DriveStopReason }

export function isDriveAgent(agent: string): boolean {
  return DRIVE_AGENTS.has(agent)
}

export function resolveDriveConfig(input: {
  enabled?: boolean
  maxContinuations?: number
}): { enabled: boolean; maxContinuations: number } {
  const max = input.maxContinuations
  return {
    enabled: input.enabled !== false,
    maxContinuations:
      typeof max === "number" && Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_CONTINUATIONS,
  }
}

export function continuationsUsed(metadata: Record<string, unknown> | undefined): number {
  const raw = metadata?.[DRIVE_METADATA.continuations]
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0
}

export function decideDrive(snap: DriveSnapshot): DriveDecision {
  if (!snap.enabled) return { action: "stop", reason: "disabled" }
  if (!isDriveAgent(snap.agent)) return { action: "stop", reason: "agent_exempt" }
  if (snap.cancelled) return { action: "stop", reason: "cancelled" }
  if (snap.pepDeniedRequired) return { action: "stop", reason: "pep_denied" }
  if (snap.pendingQuestions > 0 || snap.pendingPermissions > 0 || snap.pendingApprovals > 0) {
    return { action: "stop", reason: "decision_required" }
  }
  if (snap.goalStatus === "unset") return { action: "stop", reason: "no_goal" }
  if (snap.goalStatus === "complete" || snap.goalStatus === "complete_unverified" || snap.goalStatus === "complete_pending_verify") {
    return { action: "stop", reason: "goal_complete" }
  }
  if (snap.goalStatus === "blocked") return { action: "stop", reason: "goal_blocked" }
  if (snap.goalStatus === "stale") return { action: "stop", reason: "goal_stale" }
  if (snap.continuationsUsed >= snap.maxContinuations) return { action: "stop", reason: "exhausted" }
  if (snap.goalStatus === "in_progress") return { action: "continue", reason: "goal_open" }
  return { action: "stop", reason: "no_goal" }
}
