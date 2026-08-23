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
  "The session goal is still open. Pick up where you left off — do not restart from scratch.",
  "Run your verification check (typecheck, tests, build) and fix any errors you find.",
  "Use `question` only when a genuine decision or clarification is required.",
  "Call `goal_check(status=complete, checks=[...])` with the appropriate checks",
  "when the goal is truly satisfied. The checks run deterministically — no review needed.",
  "</system-reminder>",
].join("\n")

export const DRIVE_METADATA = {
  continuations: "__arcana_drive_continuations",
  exhausted: "__arcana_drive_exhausted",
  decisionRequired: "__arcana_decision_required",
  progressFingerprint: "__arcana_drive_progress_fingerprint",
  noProgress: "__arcana_drive_no_progress",
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
  /** True when the model's last response invoked at least one tool. False = pure text. */
  hadToolActivity: boolean
  /** Consecutive continuation boundaries with an identical semantic tool fingerprint. */
  noProgressContinuations: number
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
  | "no_progress"
  | "conversational"

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

export function noProgressContinuations(metadata: Record<string, unknown> | undefined): number {
  const raw = metadata?.[DRIVE_METADATA.noProgress]
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 0
}

function fingerprint(value: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function driveProgressFingerprint(input: {
  goalStatus: GoalStatus | "unset"
  tools: ReadonlyArray<{
    tool: string
    status: string
    input?: unknown
    output?: string
  }>
}): string {
  const normalized = input.tools.map((tool) => ({
    tool: tool.tool,
    status: tool.status,
    input: tool.input,
    output: tool.output?.slice(-500),
  }))
  return fingerprint(JSON.stringify({ goalStatus: input.goalStatus, tools: normalized }))
}

export function decideDrive(snap: DriveSnapshot): DriveDecision {
  // Pure-text responses (no tool invocations) are conversational — there is
  // no work to drive toward. Continuing would produce another greeting or
  // commentary without any actionable output.
  if (!snap.hadToolActivity) return { action: "stop", reason: "conversational" }
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
  if (snap.noProgressContinuations >= 2) return { action: "stop", reason: "no_progress" }
  if (snap.continuationsUsed >= snap.maxContinuations) return { action: "stop", reason: "exhausted" }
  if (snap.goalStatus === "in_progress") return { action: "continue", reason: "goal_open" }
  return { action: "stop", reason: "no_goal" }
}
