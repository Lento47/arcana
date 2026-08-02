/**
 * F4: Fleet and node operations.
 *
 * Tenant-scoped fleet inventory with health/version/revocation/policy-sync
 * status, proof backlog, and upgrade rings. Health is derived from freshness
 * + enforcement state; stale/unreachable nodes are explicit and an upgrade
 * failure can never silently disable enforcement.
 */

export type FleetNodeHealth = "UNKNOWN" | "HEALTHY" | "STALE" | "REVOKED" | "QUARANTINED"

export type FleetNodeRecord = {
  tenantId: string
  nodeId: string
  organizationId: string
  environment: string
  version: string
  upgradeRing: number
  nodeKeyEpoch: number
  enforcementMode: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
  policySequence: number
  policyDigest: string
  revocationSequence: number
  revocationDigest: string
  proofBacklog: number
  lastSeenAt?: string
  lastSyncAt?: string
  registeredAt: string
  revokedAt?: string
}

export interface FleetStore {
  putNode(record: FleetNodeRecord): void
  getNode(tenantId: string, nodeId: string): FleetNodeRecord | undefined
  listNodes(tenantId: string): FleetNodeRecord[]
  updateHeartbeat(
    tenantId: string,
    nodeId: string,
    heartbeat: Partial<Pick<FleetNodeRecord, "lastSeenAt" | "lastSyncAt" | "policySequence" | "policyDigest" | "revocationSequence" | "revocationDigest" | "proofBacklog" | "enforcementMode">>,
  ): void
  setRevoked(tenantId: string, nodeId: string, revokedAt: string): void
}

export type FleetHealthThresholds = {
  staleAfterMs: number
}

export const DEFAULT_FLEET_HEALTH_THRESHOLDS: FleetHealthThresholds = {
  staleAfterMs: 5 * 60 * 1000,
}

/**
 * Derive fleet health: UNKNOWN (never seen), REVOKED, QUARANTINED, STALE
 * (last seen older than the threshold), otherwise HEALTHY.
 */
export function deriveFleetHealth(
  node: FleetNodeRecord,
  now: Date,
  thresholds: FleetHealthThresholds = DEFAULT_FLEET_HEALTH_THRESHOLDS,
): FleetNodeHealth {
  if (node.revokedAt) return "REVOKED"
  if (node.enforcementMode === "QUARANTINED") return "QUARANTINED"
  if (!node.lastSeenAt) return "UNKNOWN"
  const lastSeen = new Date(node.lastSeenAt).getTime()
  if (now.getTime() - lastSeen > thresholds.staleAfterMs) return "STALE"
  return "HEALTHY"
}

/**
 * Fleet view: unknown nodes are never collapsed into healthy; a node whose
 * version lags but whose enforcement is online remains HEALTHY with its
 * version exposed (upgrade failure must not silently disable enforcement).
 */
export function fleetView(
  store: FleetStore,
  tenantId: string,
  now: Date,
  thresholds: FleetHealthThresholds = DEFAULT_FLEET_HEALTH_THRESHOLDS,
): Array<FleetNodeRecord & { health: FleetNodeHealth }> {
  return store.listNodes(tenantId).map((node) => ({
    ...node,
    health: deriveFleetHealth(node, now, thresholds),
  }))
}

/**
 * Remote diagnostics for a single node: the full inventory record plus the
 * derived health. Returns undefined when the node is not registered.
 */
export function nodeDiagnostics(
  store: FleetStore,
  tenantId: string,
  nodeId: string,
  now: Date,
  thresholds: FleetHealthThresholds = DEFAULT_FLEET_HEALTH_THRESHOLDS,
): (FleetNodeRecord & { health: FleetNodeHealth }) | undefined {
  const node = store.getNode(tenantId, nodeId)
  if (!node) return undefined
  return { ...node, health: deriveFleetHealth(node, now, thresholds) }
}
