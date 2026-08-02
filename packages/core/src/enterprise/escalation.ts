/**
 * F5: Approval escalation.
 *
 * Escalation is advisory and bounded: it can only recommend fallback
 * approvers from a tenant policy and record an auditable event. It NEVER
 * changes an approval status and never bypasses the local PEP or the central
 * queue — a fallback approver still goes through exact-inspection decide.
 */

export type EscalationPolicy = {
  tenantId: string
  policyId: string
  /** Pending approvals older than this are escalated. */
  maxWaitMs: number
  /** Bounded fallback approvers; an empty list means the owner must act. */
  fallbackApprovers: string[]
  /** When set, escalation requires a break-glass session to act. */
  requireBreakGlass: boolean
}

export type EscalationEvent = {
  tenantId: string
  eventId: string
  approvalId: string
  at: string
  reason: string
  suggestedApprovers: string[]
}

export interface EscalationStore {
  putPolicy(policy: EscalationPolicy): void
  getPolicy(tenantId: string): EscalationPolicy | undefined
  recordEvent(event: EscalationEvent): void
  events(tenantId: string): EscalationEvent[]
}

export type EscalationCheck =
  | {
      escalated: true
      reason: string
      suggestedApprovers: string[]
      requireBreakGlass: boolean
    }
  | { escalated: false; reason: string }

/**
 * Pure evaluation: a PENDING approval older than maxWaitMs is escalated.
 * Any other status is never escalated.
 */
export function evaluateEscalation(
  policy: EscalationPolicy | undefined,
  approval: { approvalId: string; status: string; createdAt: string },
  now: Date,
): EscalationCheck {
  if (!policy) return { escalated: false, reason: "no escalation policy configured" }
  if (approval.status !== "PENDING") {
    return { escalated: false, reason: `approval is ${approval.status}, not PENDING` }
  }
  const ageMs = now.getTime() - new Date(approval.createdAt).getTime()
  if (ageMs <= policy.maxWaitMs) {
    return {
      escalated: false,
      reason: `approval age ${ageMs} ms is within maxWaitMs ${policy.maxWaitMs} ms`,
    }
  }
  return {
    escalated: true,
    reason: `approval ${approval.approvalId} exceeded maxWaitMs ${policy.maxWaitMs} ms`,
    suggestedApprovers: [...policy.fallbackApprovers],
    requireBreakGlass: policy.requireBreakGlass,
  }
}

/**
 * Recorded escalation: evaluates the policy and persists an auditable event
 * when escalation fires. The approval record is deliberately untouched.
 */
export function escalateApproval(
  tenantId: string,
  approval: { approvalId: string; status: string; createdAt: string },
  policy: EscalationPolicy | undefined,
  store: EscalationStore,
  now: Date,
): EscalationCheck {
  const check = evaluateEscalation(policy, approval, now)
  if (!check.escalated) return check
  store.recordEvent({
    tenantId,
    eventId: `esc-${now.getTime()}-${approval.approvalId}`,
    approvalId: approval.approvalId,
    at: now.toISOString(),
    reason: check.reason,
    suggestedApprovers: check.suggestedApprovers,
  })
  return check
}
