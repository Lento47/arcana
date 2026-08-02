/**
 * F8: Cross-org approval routing.
 *
 * Bounded delegation of approval visibility between organizations under an
 * active federation agreement. A route only exists when an explicit rule
 * grants the exact action, and daily routing is capped per rule. Routing is
 * advisory: it never decides an approval and never bypasses the local PEP or
 * the central queue.
 */

import type { FederationAgreement, FederationStore } from "./federation"
import { agreementValid } from "./federation"

export type CrossOrgApprovalRule = {
  ruleId: string
  /** Delegating organization (owns the approval). */
  orgA: string
  /** Delegated organization (may act as approver). */
  orgB: string
  agreementId: string
  /** Exact action patterns that may be routed; empty = fail closed. */
  actionPatterns: string[]
  /** Daily routing cap; <= 0 fails closed. */
  maxPerDay: number
}

export type RoutedApproval = {
  routingId: string
  ruleId: string
  orgA: string
  orgB: string
  agreementId: string
  approvalId: string
  action: string
  routedAt: string
}

export interface CrossOrgApprovalStore {
  putRule(rule: CrossOrgApprovalRule): void
  getRule(ruleId: string): CrossOrgApprovalRule | undefined
  listRules(orgId: string): CrossOrgApprovalRule[]
  putRouted(record: RoutedApproval): void
  routedSince(orgId: string, since: string): RoutedApproval[]
}

export type CrossOrgRoutingResult =
  | { kind: "ROUTED"; record: RoutedApproval; rule: CrossOrgApprovalRule }
  | { kind: "REJECTED"; reason: string }

export function routeCrossOrgApproval(
  input: {
    orgA: string
    orgB: string
    agreementId: string
    approvalId: string
    action: string
    now: Date
  },
  agreements: FederationStore,
  store: CrossOrgApprovalStore,
): CrossOrgRoutingResult {
  const agreement = agreements.getAgreement(input.agreementId)
  const validity = agreementValid(agreement, input.now)
  if (!validity.valid) return { kind: "REJECTED", reason: validity.reason }

  const rule = store
    .listRules(input.orgA)
    .find(
      (candidate) =>
        candidate.orgB === input.orgB &&
        candidate.agreementId === input.agreementId &&
        candidate.actionPatterns.includes(input.action),
    )
  if (!rule) {
    return {
      kind: "REJECTED",
      reason: `no cross-org approval rule grants ${input.action} from ${input.orgA} to ${input.orgB}`,
    }
  }
  if (rule.maxPerDay <= 0) {
    return { kind: "REJECTED", reason: `rule ${rule.ruleId} has a zero daily bound` }
  }

  const startOfDay = new Date(input.now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const routedToday = store
    .routedSince(input.orgB, startOfDay.toISOString())
    .filter((record) => record.ruleId === rule.ruleId).length
  if (routedToday >= rule.maxPerDay) {
    return {
      kind: "REJECTED",
      reason: `rule ${rule.ruleId} daily routing bound (${rule.maxPerDay}) reached`,
    }
  }

  const record: RoutedApproval = {
    routingId: `route-${input.now.getTime()}-${input.approvalId}`,
    ruleId: rule.ruleId,
    orgA: input.orgA,
    orgB: input.orgB,
    agreementId: input.agreementId,
    approvalId: input.approvalId,
    action: input.action,
    routedAt: input.now.toISOString(),
  }
  store.putRouted(record)
  return { kind: "ROUTED", record, rule }
}

export function delegatedAuthorityBound(
  rule: CrossOrgApprovalRule,
  routedToday: number,
): { bounded: true; remaining: number } | { bounded: false; reason: string } {
  if (rule.maxPerDay <= 0) return { bounded: false, reason: "rule bound is zero (fail closed)" }
  const remaining = Math.max(0, rule.maxPerDay - routedToday)
  return { bounded: true, remaining }
}
