/**
 * F4: Upgrade rings and rollout automation.
 *
 * Ring-based staged rollout. Rollout is gated per node: paused rings deny,
 * revoked/quarantined nodes are never targeted, and a node that is already on
 * the target version is a no-op. An upgrade failure can never silently
 * disable enforcement (health derivation stays authoritative).
 */

export type UpgradeRing = {
  tenantId: string
  ringId: string
  name: string
  targetVersion: string
  paused: boolean
  createdAt: string
}

export type RingNodeAssignment = {
  tenantId: string
  nodeId: string
  ringId: string
  assignedAt: string
}

export interface UpgradeRingStore {
  putRing(ring: UpgradeRing): void
  getRing(tenantId: string, ringId: string): UpgradeRing | undefined
  listRings(tenantId: string): UpgradeRing[]
  assignNode(assignment: RingNodeAssignment): void
  nodeRing(tenantId: string, nodeId: string): RingNodeAssignment | undefined
}

export type RolloutDecision = {
  allowed: boolean
  reason: string
}

export function canRolloutNode(
  node: {
    nodeId: string
    version: string
    enforcementMode: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
    health: "UNKNOWN" | "HEALTHY" | "STALE" | "REVOKED" | "QUARANTINED"
  },
  ring: UpgradeRing | undefined,
): RolloutDecision {
  if (!ring) return { allowed: false, reason: "ring not found" }
  if (ring.paused) return { allowed: false, reason: `ring ${ring.ringId} is paused` }
  if (node.enforcementMode === "QUARANTINED" || node.health === "REVOKED" || node.health === "QUARANTINED") {
    return { allowed: false, reason: `node ${node.nodeId} is revoked or quarantined` }
  }
  if (node.version === ring.targetVersion) {
    return { allowed: true, reason: `node ${node.nodeId} is already on ${ring.targetVersion}` }
  }
  return { allowed: true, reason: `node ${node.nodeId} may roll to ${ring.targetVersion}` }
}

export function planRingRollout(
  ring: UpgradeRing,
  nodes: Array<{
    nodeId: string
    version: string
    enforcementMode: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
    health: "UNKNOWN" | "HEALTHY" | "STALE" | "REVOKED" | "QUARANTINED"
  }>,
): Array<RolloutDecision & { nodeId: string }> {
  return nodes.map((node) => ({
    nodeId: node.nodeId,
    ...canRolloutNode(node, ring),
  }))
}
