/**
 * F9: security operations tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteSecurityOpsStore } from "./security-ops-sqlite"
import {
  forensicExport,
  runRevocationCampaign,
  type SecurityAlert,
} from "./security-ops"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function alert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    tenantId: "tenant-a",
    alertId: "alert-1",
    severity: "HIGH",
    kind: "unusual_network",
    subjectId: "node-1",
    detail: "unexpected egress",
    at: NOW.toISOString(),
    ...overrides,
  }
}

describe("F9 security operations", () => {
  it("stores and filters alerts per tenant and severity", () => {
    const store = new SqliteSecurityOpsStore(new Database(":memory:"))
    store.putAlert(alert())
    store.putAlert(alert({ alertId: "alert-2", severity: "CRITICAL" }))
    store.putAlert(alert({ tenantId: "tenant-b", alertId: "alert-b" }))

    expect(store.alerts("tenant-a")).toHaveLength(2)
    expect(store.alerts("tenant-a", "CRITICAL")).toHaveLength(1)
    expect(store.alerts("tenant-b")).toHaveLength(1)
  })

  it("runs audited revocation campaigns", () => {
    const revoked: string[] = []
    const result = runRevocationCampaign(
      "tenant-a",
      [{ nodeId: "node-1" }, { nodeId: "node-2" }, { nodeId: "node-3" }],
      "compromise",
      (nodeId) => {
        if (nodeId === "node-3") return { ok: false, reason: "already revoked" }
        revoked.push(nodeId)
        return { ok: true }
      },
      NOW,
    )
    expect(result.revokedNodes).toEqual(["node-1", "node-2"])
    expect(result.auditEvents).toHaveLength(2)
    expect(result.auditEvents[0].reason).toBe("compromise")
  })

  it("builds tenant-scoped forensic exports with incident timelines", () => {
    const store = new SqliteSecurityOpsStore(new Database(":memory:"))
    store.putAlert(alert())
    store.appendTimeline({ tenantId: "tenant-a", incidentId: "inc-1", at: NOW.toISOString(), actor: "soc", event: "opened" })
    store.appendTimeline({ tenantId: "tenant-a", incidentId: "inc-1", at: NOW.toISOString(), actor: "soc", event: "contained" })

    const exportData = forensicExport("tenant-a", store, NOW)
    expect(exportData.alerts).toHaveLength(1)
    expect(exportData.timeline).toHaveLength(2)
    expect(exportData.tenantId).toBe("tenant-a")
  })
})
