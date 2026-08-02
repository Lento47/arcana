/**
 * F4: upgrade-ring rollout tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteUpgradeRingStore } from "./upgrade-rings-sqlite"
import { canRolloutNode, planRingRollout, type UpgradeRing } from "./upgrade-rings"

const NOW = "2026-08-02T12:00:00.000Z"

function ring(overrides: Partial<UpgradeRing> = {}): UpgradeRing {
  return {
    tenantId: "tenant-a",
    ringId: "ring-1",
    name: "canary",
    targetVersion: "2.0.0",
    paused: false,
    createdAt: NOW,
    ...overrides,
  }
}

describe("F4 upgrade rings", () => {
  it("gates rollout on ring existence, pause state, and node health", () => {
    const healthy = {
      nodeId: "node-1",
      version: "1.0.0",
      enforcementMode: "ONLINE" as const,
      health: "HEALTHY" as const,
    }
    expect(canRolloutNode(healthy, undefined)).toMatchObject({ allowed: false })
    expect(canRolloutNode(healthy, ring({ paused: true }))).toMatchObject({ allowed: false })
    expect(canRolloutNode(healthy, ring())).toMatchObject({ allowed: true })
    expect(
      canRolloutNode(
        { ...healthy, enforcementMode: "QUARANTINED", health: "QUARANTINED" },
        ring(),
      ),
    ).toMatchObject({ allowed: false })
    expect(
      canRolloutNode({ ...healthy, health: "REVOKED" }, ring()),
    ).toMatchObject({ allowed: false })
    expect(
      canRolloutNode({ ...healthy, version: "2.0.0" }, ring()),
    ).toMatchObject({ allowed: true })
  })

  it("plans ring rollouts without mutating fleet state", () => {
    const plan = planRingRollout(ring(), [
      { nodeId: "node-1", version: "1.0.0", enforcementMode: "ONLINE", health: "HEALTHY" },
      { nodeId: "node-2", version: "1.0.0", enforcementMode: "ONLINE", health: "REVOKED" },
      { nodeId: "node-3", version: "1.0.0", enforcementMode: "ONLINE", health: "STALE" },
    ])
    expect(plan.find((p) => p.nodeId === "node-1")?.allowed).toBe(true)
    expect(plan.find((p) => p.nodeId === "node-2")?.allowed).toBe(false)
    expect(plan.find((p) => p.nodeId === "node-3")?.allowed).toBe(true)
  })

  it("stores rings and node assignments per tenant", () => {
    const store = new SqliteUpgradeRingStore(new Database(":memory:"))
    store.putRing(ring())
    store.putRing(ring({ ringId: "ring-2", tenantId: "tenant-b" }))
    store.assignNode({ tenantId: "tenant-a", nodeId: "node-1", ringId: "ring-1", assignedAt: NOW })

    expect(store.listRings("tenant-a")).toHaveLength(1)
    expect(store.getRing("tenant-a", "ring-1")?.targetVersion).toBe("2.0.0")
    expect(store.nodeRing("tenant-a", "node-1")?.ringId).toBe("ring-1")
    expect(store.nodeRing("tenant-b", "node-1")).toBeUndefined()
  })
})
