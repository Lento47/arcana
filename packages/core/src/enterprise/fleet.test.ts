/**
 * F4: fleet operations tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteFleetStore } from "./fleet-sqlite"
import {
  deriveFleetHealth,
  fleetView,
  type FleetNodeRecord,
} from "./fleet"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function node(overrides: Partial<FleetNodeRecord> = {}): FleetNodeRecord {
  return {
    tenantId: "tenant-a",
    nodeId: "node-1",
    organizationId: "org-a",
    environment: "prod",
    version: "1.0.0",
    upgradeRing: 0,
    nodeKeyEpoch: 2,
    enforcementMode: "ONLINE",
    policySequence: 1,
    policyDigest: "policy-1",
    revocationSequence: 1,
    revocationDigest: "revocation-1",
    proofBacklog: 0,
    lastSeenAt: NOW.toISOString(),
    lastSyncAt: NOW.toISOString(),
    registeredAt: NOW.toISOString(),
    ...overrides,
  }
}

describe("F4 fleet operations", () => {
  it("classifies healthy, stale, unknown, revoked, and quarantined nodes", () => {
    const store = new SqliteFleetStore(new Database(":memory:"))
    store.putNode(node({ nodeId: "healthy" }))
    store.putNode(node({ nodeId: "stale", lastSeenAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString() }))
    store.putNode(node({ nodeId: "unknown", lastSeenAt: undefined }))
    store.putNode(node({ nodeId: "revoked", revokedAt: NOW.toISOString() }))
    store.putNode(node({ nodeId: "quarantined", enforcementMode: "QUARANTINED" }))

    const view = fleetView(store, "tenant-a", NOW)
    const byId = new Map(view.map((n) => [n.nodeId, n.health]))
    expect(byId.get("healthy")).toBe("HEALTHY")
    expect(byId.get("stale")).toBe("STALE")
    expect(byId.get("unknown")).toBe("UNKNOWN")
    expect(byId.get("revoked")).toBe("REVOKED")
    expect(byId.get("quarantined")).toBe("QUARANTINED")
  })

  it("isolates fleet views per tenant", () => {
    const store = new SqliteFleetStore(new Database(":memory:"))
    store.putNode(node({ tenantId: "tenant-a", nodeId: "node-a" }))
    store.putNode(node({ tenantId: "tenant-b", nodeId: "node-b" }))
    expect(store.listNodes("tenant-a").map((n) => n.nodeId)).toEqual(["node-a"])
    expect(store.listNodes("tenant-b").map((n) => n.nodeId)).toEqual(["node-b"])
  })

  it("heartbeats update state and revocation is explicit", () => {
    const store = new SqliteFleetStore(new Database(":memory:"))
    store.putNode(node())
    store.updateHeartbeat("tenant-a", "node-1", {
      lastSeenAt: new Date(NOW.getTime() + 60_000).toISOString(),
      policySequence: 2,
      policyDigest: "policy-2",
      proofBacklog: 3,
    })
    const updated = store.getNode("tenant-a", "node-1")!
    expect(updated.policySequence).toBe(2)
    expect(updated.proofBacklog).toBe(3)
    expect(deriveFleetHealth(updated, NOW)).toBe("HEALTHY")

    store.setRevoked("tenant-a", "node-1", NOW.toISOString())
    expect(deriveFleetHealth(store.getNode("tenant-a", "node-1")!, NOW)).toBe("REVOKED")
  })
})
