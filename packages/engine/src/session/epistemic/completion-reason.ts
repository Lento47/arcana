/**
 * Session completion reasons — why a session ended.
 *
 * Used in session.completed events to distinguish between different
 * termination modes. Critical for accurate false-completion measurement.
 *
 * IMPORTANT: "normal" and "step_limit" are the existing reasons.
 * New reasons must be backward-compatible.
 */

export type SessionCompletionReason =
  /** Session completed normally — agent finished its work. */
  | "normal"
  /** Session hit the max-steps limit for the configured agent. */
  | "step_limit"
  /** Session was explicitly cancelled by the user or system. */
  | "cancelled"
  /** Session exhausted its token/compute budget. */
  | "budget_exhausted"
  /** Session stopped because it needed a decision it could not make. */
  | "decision_required"
  /** Session completed but with acknowledged failures — partial success. */
  | "graceful_failure"

/**
 * Derive the completion reason from session metadata flags.
 *
 * Metadata flags (set during session execution):
 * - __arcana_max_steps_hit: true → step_limit
 * - __arcana_cancelled: true → cancelled
 * - __arcana_budget_exhausted: true → budget_exhausted
 * - __arcana_decision_required: true → decision_required
 * - __arcana_graceful_failure: true → graceful_failure
 * - none set → normal
 *
 * Priority: cancelled > budget_exhausted > step_limit > decision_required > graceful_failure > normal
 */
export function deriveCompletionReason(
  metadata: Record<string, unknown> | undefined,
): SessionCompletionReason {
  if (!metadata) return "normal"

  if (metadata.__arcana_cancelled === true) return "cancelled"
  if (metadata.__arcana_budget_exhausted === true) return "budget_exhausted"
  if (metadata.__arcana_max_steps_hit === true) return "step_limit"
  if (metadata.__arcana_decision_required === true) return "decision_required"
  if (metadata.__arcana_graceful_failure === true) return "graceful_failure"

  return "normal"
}

/**
 * Check if a completion reason represents a successful completion.
 * Used to distinguish genuine completion from forced termination.
 */
export function isSuccessfulCompletion(reason: SessionCompletionReason): boolean {
  return reason === "normal" || reason === "graceful_failure"
}

/**
 * Check if a completion reason represents an interruption.
 * Used to flag sessions that did not complete their intended work.
 */
export function isInterruption(reason: SessionCompletionReason): boolean {
  return reason === "cancelled" || reason === "budget_exhausted" || reason === "step_limit"
}
