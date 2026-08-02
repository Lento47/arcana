/**
 * F8: cross-org approval routing tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteFederationStore } from "./federation-sqlite"
import { SqliteCrossOrgApprovalStore } from "./federation-approvals-sqlite"
import {
  delegatedAuthorityBound,
  routeCrossOrgApproval,
  type CrossOrgApprovalRule,
} from "./federation-approvals"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function rule(overrides: Partial<CrossOrgApprovalRule> = {}): CrossOrgApprovalRule {
  return {
    ruleId: "rule-1",
    orgA: "org-a",
    orgB: "org-b",
    agreementId: "agree-1",
    actionPatterns: ["execute", "file.write"],
    maxPerDay: 3,
    ...overrides,
  }
}

describe("F8 cross-org approval routing", () => {
  it("routes only under an active agreement with an exact action grant", () => {
    const agreements = new SqliteFederationStore(new Database(":memory:"))
    const store = new SqliteCrossOrgApprovalStore(new Database(":memory:"))
    agreements.putAgreement({
      agreementId: "agree-1",
      version: 1,
      orgA: "org-a",
      orgB: "org-b",
      audienceRestrictions: ["audience-x"],
      validFrom: new Date(NOW.getTime() - 60_000).toISOString(),
      validTo: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    })
    store.putRule(rule())

    const routed = routeCrossOrgApproval(
      {
        orgA: "org-a",
        orgB: "org-b",
        agreementId: "agree-1",
        approvalId: "appr-1",
        action: "file.write",
        now: NOW,
      },
      agreements,
      store,
    )
    expect(routed.kind).toBe("ROUTED")
    if (routed.kind === "ROUTED") {
      expect(routed.record.approvalId).toBe("appr-1")
      expect(routed.rule.maxPerDay).toBe(3)
    }

    const unlisted = routeCrossOrgApproval(
      {
        orgA: "org-a",
        orgB: "org-b",
        agreementId: "agree-1",
        approvalId: "appr-2",
        action: "delete",
        now: NOW,
      },
      agreements,
      store,
    )
    expect(unlisted).toMatchObject({ kind: "REJECTED" })
  })

  it("fails closed on unknown/expired agreements, zero bounds, and daily caps", () => {
    const agreements = new SqliteFederationStore(new Database(":memory:"))
    const store = new SqliteCrossOrgApprovalStore(new Database(":memory:"))
    agreements.putAgreement({
      agreementId: "agree-1",
      version: 1,
      orgA: "org-a",
      orgB: "org-b",
      audienceRestrictions: [],
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-08-03T00:00:00.000Z",
      status: "ACTIVE",
    })
    agreements.putAgreement({
      agreementId: "agree-expired",
      version: 1,
      orgA: "org-a",
      orgB: "org-b",
      audienceRestrictions: [],
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-08-01T23:59:59.000Z",
      status: "ACTIVE",
    })
    store.putRule(rule({ maxPerDay: 1 }))
    store.putRule(rule({ ruleId: "rule-zero", maxPerDay: 0 }))

    expect(
      routeCrossOrgApproval(
        {
          orgA: "org-a",
          orgB: "org-b",
          agreementId: "agree-unknown",
          approvalId: "appr-1",
          action: "execute",
          now: NOW,
        },
        agreements,
        store,
      ),
    ).toMatchObject({ kind: "REJECTED" })

    expect(
      routeCrossOrgApproval(
        {
          orgA: "org-a",
          orgB: "org-b",
          agreementId: "agree-expired",
          approvalId: "appr-2",
          action: "execute",
          now: NOW,
        },
        agreements,
        store,
      ),
    ).toMatchObject({ kind: "REJECTED" })

    const first = routeCrossOrgApproval(
      {
        orgA: "org-a",
        orgB: "org-b",
        agreementId: "agree-1",
        approvalId: "appr-3",
        action: "execute",
        now: NOW,
      },
      agreements,
      store,
    )
    // rule-1 (max 1) is the matching rule for agree-1; the zero-bound rule is a different rule.
    expect(first.kind).toBe("ROUTED")

    const capped = routeCrossOrgApproval(
      {
        orgA: "org-a",
        orgB: "org-b",
        agreementId: "agree-1",
        approvalId: "appr-4",
        action: "execute",
        now: NOW,
      },
      agreements,
      store,
    )
    expect(capped).toMatchObject({ kind: "REJECTED" })
  })

  it("reports bounded delegated authority", () => {
    expect(delegatedAuthorityBound(rule({ maxPerDay: 5 }), 2)).toEqual({
      bounded: true,
      remaining: 3,
    })
    expect(delegatedAuthorityBound(rule({ maxPerDay: 0 }), 0)).toMatchObject({
      bounded: false,
    })
  })
})
