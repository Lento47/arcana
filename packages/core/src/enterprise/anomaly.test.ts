/**
 * F9: anomaly detection tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteSecurityOpsStore } from "./security-ops-sqlite"
import { detectAnomalies, recordAnomalySignals } from "./anomaly"

describe("F9 anomaly detection", () => {
  it("fires on alert bursts, revocation velocity, backlog growth, and stale ratios", () => {
    const signals = detectAnomalies({
      tenantId: "tenant-a",
      alertsLastHour: 12,
      revocationsLastHour: 6,
      maxProofBacklog: 150,
      staleNodeCount: 3,
      totalNodeCount: 10,
      now: new Date("2026-08-02T12:00:00.000Z"),
    })
    expect(signals.map((s) => s.kind).sort()).toEqual([
      "alert_burst",
      "proof_backlog_growth",
      "revocation_velocity",
      "stale_node_count",
    ])
    expect(signals.find((s) => s.kind === "alert_burst")?.severity).toBe("HIGH")
  })

  it("escalates extreme bursts to CRITICAL and stays quiet under thresholds", () => {
    const critical = detectAnomalies({
      tenantId: "tenant-a",
      alertsLastHour: 25,
      revocationsLastHour: 0,
      maxProofBacklog: 0,
      staleNodeCount: 0,
      totalNodeCount: 0,
    })
    expect(critical.find((s) => s.kind === "alert_burst")?.severity).toBe("CRITICAL")

    const quiet = detectAnomalies({
      tenantId: "tenant-a",
      alertsLastHour: 1,
      revocationsLastHour: 0,
      maxProofBacklog: 10,
      staleNodeCount: 1,
      totalNodeCount: 10,
    })
    expect(quiet).toEqual([])
  })

  it("records signals through the security-ops alert pipeline", () => {
    const store = new SqliteSecurityOpsStore(new Database(":memory:"))
    const alerts = recordAnomalySignals(
      {
        tenantId: "tenant-a",
        alertsLastHour: 10,
        revocationsLastHour: 0,
        maxProofBacklog: 0,
        staleNodeCount: 0,
        totalNodeCount: 0,
      },
      store,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.kind).toBe("anomaly.alert_burst")
    expect(store.alerts("tenant-a")).toHaveLength(1)
  })
})
