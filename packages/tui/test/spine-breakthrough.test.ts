import { describe, expect, test } from "bun:test"
import { productionInputToSpineEntry, type GovernanceView } from "../src/shell/command-spine/production-spine-input"
import { applyViewFilter } from "../src/shell/command-spine/spine-view-filter"
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

  test("breakthrough rows stay visible under every view filter", () => {
    const breakthrough = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance("capability.revoked", { capabilityId: "c1" }),
    })
    for (const filter of ["conversation", "tools", "governance", "proof", "all"] as const) {
      expect(applyViewFilter([breakthrough], filter)).toHaveLength(1)
    }
  })
})
