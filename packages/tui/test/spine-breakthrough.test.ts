import { describe, expect, test } from "bun:test"
import { productionInputToSpineEntry, type GovernanceView } from "../src/shell/command-spine/production-spine-input"
import { applyViewFilter, isSettledGovernanceRecord } from "../src/shell/command-spine/spine-view-filter"
import { groupGovernanceEntries } from "../src/shell/command-spine/spine-governance-group"

function governance(eventType: string, payload: Record<string, unknown>): GovernanceView {
  return {
    id: `evt-${eventType}`,
    sessionId: "session-1",
    eventType,
    timestamp: Date.parse("2026-08-01T12:00:00.000Z"),
    sequence: 10,
    actor: "policy:pdp",
    payload,
  }
}

describe("PR6 security breakthrough rows", () => {
  test("revocation and stale-decision events are marked breakthrough", () => {
    expect(
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("capability.revoked", { capabilityId: "c1" }) })
        .breakthrough,
    ).toBe(true)
    expect(
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("authorization.stale", { requestId: "r1" }) })
        .breakthrough,
    ).toBe(true)
    expect(
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("authorization.allowed", { requestId: "r1" }) })
        .breakthrough,
    ).toBeUndefined()
  })

  test("breakthrough rows are never grouped into governance bursts", () => {
    const entries = [
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("authorization.allowed", { requestId: "r1" }) }),
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("capability.revoked", { capabilityId: "c1" }) }),
      productionInputToSpineEntry({ source: "GOVERNANCE", value: governance("authorization.executed", { requestId: "r1" }) }),
    ]
    const grouped = groupGovernanceEntries(entries)
    expect(grouped).toHaveLength(3)
    expect(grouped.find((entry) => entry.id === "governance:evt-capability.revoked")).toBeDefined()
  })

  test("capability revoke stays in the ledger, not default chat", () => {
    const revoked = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance("capability.revoked", { capabilityId: "c1", reason: "CONTRACT_RESOLVED" }),
    })
    expect(revoked.label).toBe("revoked")
    expect(revoked.breakthrough).toBe(true)
    expect(isSettledGovernanceRecord(revoked)).toBe(true)
    expect(applyViewFilter([revoked], "all")).toHaveLength(0)
    expect(applyViewFilter([revoked], "conversation")).toHaveLength(0)
    expect(applyViewFilter([revoked], "tools")).toHaveLength(0)
    expect(applyViewFilter([revoked], "governance").map((row) => row.id)).toEqual([revoked.id])
  })

  test("every governance event type except pending approval leaves default chat", () => {
    const eventTypes = [
      "contract.proposed",
      "contract.activated",
      "contract.amended",
      "claim.created",
      "claim.transitioned",
      "evidence.attached",
      "obligation.created",
      "obligation.resolved",
      "completion.attempted",
      "completion.resolved",
      "intent.enforcement_required",
      "intent.binding_created",
      "intent.binding_revoked",
      "intent.compatibility_mode",
      "authorization.requested",
      "authorization.allowed",
      "authorization.denied",
      "authorization.stale",
      "authorization.executed",
      "authorization.execution_failed",
      "capability.created",
      "capability.revoked",
      "capability.exhausted",
      "verification.recorded",
      "unknown.ledger_event",
    ] as const

    for (const eventType of eventTypes) {
      const entry = productionInputToSpineEntry({
        source: "GOVERNANCE",
        value: governance(eventType, { reason: "CONTRACT_RESOLVED", capabilityId: "c1" }),
      })
      expect(isSettledGovernanceRecord(entry)).toBe(true)
      expect(applyViewFilter([entry], "all").map((row) => row.id)).toEqual([])
      expect(applyViewFilter([entry], "governance").map((row) => row.id)).toEqual([entry.id])
    }
  })

  test("pending approval still breaks through every view filter", () => {
    const pending = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance("authorization.approval_required", { requestId: "r1" }),
    })
    for (const filter of ["conversation", "tools", "governance", "all"] as const) {
      expect(applyViewFilter([pending], filter)).toHaveLength(1)
    }
  })
})
