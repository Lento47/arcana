/**
 * Phase D-6A: Node and Workload Identity Contracts
 *
 * Three-layer identity model:
 * 1. Node identity — which machine/agent is this?
 * 2. Workload identity — which process is running?
 * 3. Agent execution identity — which session/principal?
 *
 * Separation inspired by SPIRE's node vs workload attestation.
 */

// ─── Node Identity ────────────────────────────────────────────────────

export type NodeAttestationMethod =
  | "TPM"
  | "CLOUD_INSTANCE"
  | "KUBERNETES"
  | "JOIN_TOKEN"
  | "MANUAL_CERTIFICATE"
  | "DECLARED"

export type NodeIdentity = {
  trustDomain: string
  nodeId: string
  nodeCertificateFingerprint: string
  nodeKeyEpoch: number
  attestationMethod: NodeAttestationMethod
}

// ─── Workload Identity ────────────────────────────────────────────────

export type HarnessType =
  | "ARCANA"
  | "CODEX"
  | "CLAUDE"
  | "GEMINI"
  | "OPENCODE"
  | "CUSTOM"

export type WorkloadIdentityAssurance =
  | "DECLARED"          // Self-reported, no verification
  | "OS_OBSERVED"       // Verified via OS process inspection
  | "SIGNED_BINARY"     // Binary signature verified
  | "HARDWARE_ATTESTED" // TPM/secure enclave attestation

export type WorkloadIdentity = {
  nodeId: string
  workloadId: string
  harness: HarnessType

  executableDigest?: string
  operatingSystemPrincipal?: string
  containerImageDigest?: string
  processParentDigest?: string

  assurance: WorkloadIdentityAssurance
}

// ─── Agent Execution Identity ─────────────────────────────────────────

export type AgentExecutionIdentity = {
  workloadId: string
  principalId: string
  sessionId: string
}

// ─── Distributed Grant Audience ───────────────────────────────────────

/**
 * A distributed capability audience binds ALL relevant identity dimensions.
 * A grant for Codex session A must not be reusable by Claude, by another
 * Codex process, or by session B on the same node.
 */
export type DistributedGrantAudience = {
  trustDomain: string
  nodeId: string
  workloadId: string
  principalId: string
  sessionId: string
}

// ─── Distributed Grant Derivation ─────────────────────────────────────

/**
 * When a distributed grant is accepted, it is derived into a bounded
 * local Phase C grant. The local expiry is the minimum of all
 * relevant expiry sources.
 */
export type DistributedGrantDerivation = {
  sourceEnvelopeHash: string

  issuerId: string
  issuerEpoch: number

  nodeId: string
  workloadId: string
  principalId: string
  sessionId: string

  policySequence: number
  revocationSequence: number

  localGrantId: string
  effectiveExpiresAt: string

  workloadAssurance: WorkloadIdentityAssurance
}

/**
 * Calculate effective local expiry as the minimum of all expiry sources.
 */
export function calculateEffectiveExpiry(
  capabilityExpiresAt: string,
  policyExpiresAt: string,
  revocationLeaseExpiresAt: string,
  offlineLeaseExpiresAt: string,
): string {
  const timestamps = [
    capabilityExpiresAt,
    policyExpiresAt,
    revocationLeaseExpiresAt,
    offlineLeaseExpiresAt,
  ].filter(t => t && t.length > 0).map(t => new Date(t).getTime())

  if (timestamps.length === 0) {
    // No expiry info — use a conservative default
    return new Date(Date.now() + 60_000).toISOString()
  }

  return new Date(Math.min(...timestamps)).toISOString()
}

// ─── Audience Binding ─────────────────────────────────────────────────

/**
 * Check if a workload identity matches a distributed grant audience.
 * All dimensions must match exactly.
 */
export function audienceMatches(
  audience: DistributedGrantAudience,
  node: NodeIdentity,
  workload: WorkloadIdentity,
  agent: AgentExecutionIdentity,
): { match: true } | { match: false; reason: string } {
  if (audience.trustDomain !== node.trustDomain) {
    return { match: false, reason: `trustDomain: ${audience.trustDomain} != ${node.trustDomain}` }
  }
  if (audience.nodeId !== node.nodeId) {
    return { match: false, reason: `nodeId: ${audience.nodeId} != ${node.nodeId}` }
  }
  if (audience.workloadId !== workload.workloadId) {
    return { match: false, reason: `workloadId: ${audience.workloadId} != ${workload.workloadId}` }
  }
  if (audience.principalId !== agent.principalId) {
    return { match: false, reason: `principalId: ${audience.principalId} != ${agent.principalId}` }
  }
  if (audience.sessionId !== agent.sessionId) {
    return { match: false, reason: `sessionId: ${audience.sessionId} != ${agent.sessionId}` }
  }
  return { match: true }
}

/**
 * Check if the workload assurance level meets the minimum required.
 */
export function assuranceMeetsMinimum(
  actual: WorkloadIdentityAssurance,
  required: WorkloadIdentityAssurance,
): boolean {
  const levels: WorkloadIdentityAssurance[] = [
    "DECLARED",
    "OS_OBSERVED",
    "SIGNED_BINARY",
    "HARDWARE_ATTESTED",
  ]
  return levels.indexOf(actual) >= levels.indexOf(required)
}
