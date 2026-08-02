/**
 * F5: escalation tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteEscalationStore } from "./escalation-sqlite"
import {
  escalateApproval,
  evaluateEscalation,
  type EscalationPolicy,
} from "./escalation"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function policy(overrides: Partial<EscalationPolicy> = {}): EscalationPolicy {
  return {
    tenantId: "tenant-a",
    policyId: "policy-esc-1",
    maxWaitMs: 60_000,
    fallbackApprovers: ["u-owner", "u-admin"],
    requireBreakGlass: false,
    ...overrides,
  }
}

describe("F5 approval escalation", () => {
  it("does not escalate without a policy, while within the wait window, or for decided approvals", () => {
    const approval = {
      approvalId: "appr-1",
      status: "PENDING",
      createdAt: new Date(NOW.getTime() - 30_000).toISOString(),
    }
    expect(evaluateEscalation(undefined, approval, NOW)).toMatchObject({ escalated: false })
    expect(evaluateEscalation(policy(), approval, NOW)).toMatchObject({ escalated: false })
    expect(
      evaluateEscalation(policy(), { ...approval, status: "APPROVED" }, NOW),
    ).toMatchObject({ escalated: false })
  })

  it("escalates stale pending approvals with bounded fallback approvers", () => {
    const approval = {
      approvalId: "appr-1",
      status: "PENDING",
      createdAt: new Date(NOW.getTime() - 120_000).toISOString(),
    }
    const check = evaluateEscalation(policy({ requireBreakGlass: true }), approval, NOW)
    expect(check).toMatchObject({
      escalated: true,
      suggestedApprovers: ["u-owner", "u-admin"],
      requireBreakGlass: true,
    })
  })

  it("records escalation events without changing the approval status", () => {
    const store = new SqliteEscalationStore(new Database(":memory:"))
    store.putPolicy(policy())
    const approval = {
      approvalId: "appr-1",
      status: "PENDING",
      createdAt: new Date(NOW.getTime() - 120_000).toISOString(),
    }
    const check = escalateApproval("tenant-a", approval, store.getPolicy("tenant-a"), store, NOW)
    expect(check.escalated).toBe(true)
    // The approval record is deliberately untouched by escalation.
    expect(approval.status).toBe("PENDING")
    const events = store.events("tenant-a")
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ approvalId: "appr-1", suggestedApprovers: ["u-owner", "u-admin"] })
  })

  it("isolates policies and events per tenant", () => {
    const store = new SqliteEscalationStore(new Database(":memory:"))
    store.putPolicy(policy())
    store.putPolicy(policy({ tenantId: "tenant-b", policyId: "policy-esc-2" }))
    expect(store.getPolicy("tenant-a")?.policyId).toBe("policy-esc-1")
    expect(store.getPolicy("tenant-b")?.policyId).toBe("policy-esc-2")
    expect(store.getPolicy("tenant-c")).toBeUndefined()
  })
})
