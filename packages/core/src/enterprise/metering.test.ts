/**
 * F12: metering tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { meteringNeverAffectsDecision } from "./commercial-readiness"
import { quotaStatus, type UsageEvent } from "./metering"
import { SqliteMeteringStore } from "./metering-sqlite"

const NOW = "2026-08-02T12:00:00.000Z"

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    tenantId: "tenant-a",
    eventId: "usage-1",
    feature: "shared_approvals",
    units: 1,
    at: NOW,
    ...overrides,
  }
}

describe("F12 usage metering", () => {
  it("aggregates usage per tenant, feature, and time window", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    store.putUsage(event({ eventId: "u1", units: 3, at: "2026-08-02T10:00:00.000Z" }))
    store.putUsage(event({ eventId: "u2", units: 4, at: "2026-08-02T11:00:00.000Z" }))
    store.putUsage(event({ eventId: "u3", feature: "fleet_control", units: 2 }))
    store.putUsage(event({ eventId: "u4", tenantId: "tenant-b", units: 100 }))

    expect(store.usage("tenant-a", "shared_approvals", "2026-08-02T10:30:00.000Z")).toBe(4)
    expect(store.usage("tenant-a", "shared_approvals", "2026-08-02T00:00:00.000Z")).toBe(7)
    expect(store.usage("tenant-a", "fleet_control", "2026-08-02T00:00:00.000Z")).toBe(2)
    expect(store.usage("tenant-b", "shared_approvals", "2026-08-02T00:00:00.000Z")).toBe(100)
  })

  it("reports quota overage as informational only", () => {
    expect(quotaStatus(10, 9)).toEqual({ ok: true, used: 9, limit: 10, overQuota: false })
    expect(quotaStatus(10, 11)).toEqual({ ok: false, used: 11, limit: 10, overQuota: true })
  })

  it("metering overage or failure never changes a security decision", () => {
    expect(meteringNeverAffectsDecision("DENY", { ok: false, overQuota: true })).toBe("DENY")
    expect(meteringNeverAffectsDecision("ALLOW", { ok: false, overQuota: true })).toBe("ALLOW")
    expect(meteringNeverAffectsDecision("REQUIRE_APPROVAL", { ok: true })).toBe("REQUIRE_APPROVAL")
  })
})
