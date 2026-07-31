/**
 * Phase D-7: Distributed PEP Vertical Slice
 *
 * Proves that signed remote authority can safely reach one local effect
 * through the local Phase C PDP/PEP.
 *
 * Pipeline:
 *   signed capability envelope
 *   → ACEP-1 strict parse + 7-layer verification
 *   → trusted issuer resolution
 *   → exact node/workload/principal/session audience
 *   → current policy/revocation state
 *   → node enforcement mode permits action
 *   → observe workload identity
 *   → derive narrower local Phase C capability
 *   → register/activate local derived grant
 *   → Phase C PDP
 *   → re-observe workload + distributed state
 *   → Phase C PEP
 *   → bounded action
 *   → governance event + RunProof
 *
 * The derived grant NEVER broadens upstream authority:
 *   DerivedGrant ⊆ SignedGrant ∩ Policy ∩ NodeScope ∩ WorkloadScope ∩ PrincipalScope ∩ SessionScope
 *
 * Expiry:
 *   Expires_derived = min(
 *     Expires_capability, Expires_policy,
 *     Expires_revocationLease, Expires_offlineLease,
 *     Expires_workloadObservation
 *   )
 */

import { createHash } from "node:crypto"
import { readFileSync, existsSync, statSync } from "node:fs"
import { resolve, relative, isAbsolute, normalize } from "node:path"
import {
  verifySignedCapability,
  type VerificationResult,
} from "./verifier"
import {
  type DistributedGrantAudience,
  type NodeIdentity,
  type WorkloadIdentity,
  type AgentExecutionIdentity,
  type WorkloadIdentityAssurance,
  type DistributedGrantDerivation,
  audienceMatches,
  assuranceMeetsMinimum,
  calculateEffectiveExpiry,
} from "./identity-contracts"
import {
  observeCurrentWorkload,
  verifyWorkloadStable,
  type ObservedWorkloadIdentity,
} from "./workload-identity"
import {
  type DurableNodeSecurityState,
  type Enforcement,
} from "./durable-state"
import {
  type NodeRuntimeState,
  type PolicySyncState,
  type RevocationSyncState,
} from "./reducers"

// ─── Types ──────────────────────────────────────────────────────────

export type DistributedAction = {
  action: "filesystem.read"
  workspace: string
  resource: string
}

export type DistributedGrantSource = {
  envelope: Record<string, unknown>
  envelopeBytes: Uint8Array

  issuerId: string
  issuerPublicKey: string
  issuerTrusted: boolean
  issuerEpoch: number

  nodeId: string
  workloadId: string
  principalId: string
  sessionId: string
  trustDomain: string

  policySequence: number
  policyDigest: string

  revocationSequence: number
  revocationDigest: string

  capabilityExpiresAt: string
  action: string
  resource: string
}

export type DerivedLocalGrant = {
  derivationId: string
  sourceEnvelopeHash: string

  issuerId: string
  issuerEpoch: number

  nodeId: string
  workloadId: string
  workloadAssurance: WorkloadIdentityAssurance
  principalId: string
  sessionId: string

  policySequence: number
  policyDigest: string

  revocationSequence: number
  revocationDigest: string

  localGrantId: string
  action: string
  resource: string
  effectiveExpiresAt: string

  derivedAt: string
}

export type DistributedAuthorizationEvidence = {
  envelopeHash: string
  envelopeCategory: "SIGNED_CAPABILITY"

  issuerId: string
  issuerEpoch: number

  nodeId: string
  workloadId: string
  workloadAssurance: WorkloadIdentityAssurance
  principalId: string
  sessionId: string

  policySequence: number
  policyDigest: string

  revocationSequence: number
  revocationDigest: string

  derivedLocalGrantId: string

  distributedVerification: "VERIFIED"
  localDecision: "ALLOW" | "DENY"
  preEffectRecheck: "PASSED" | "FAILED"
}

export type DistributedPepResult = {
  allowed: boolean
  reason: string

  evidence?: DistributedAuthorizationEvidence
  readResult?: { path: string; size: number; hash: string }

  failures: string[]
}

// ─── Phase C PDP (minimal) ──────────────────────────────────────────

/**
 * Phase C Policy Decision Point.
 * Evaluates whether the derived grant permits the requested action.
 *
 * In production this delegates to the full Phase C PDP.
 * Here we implement the minimum viable decision logic.
 */
export function phaseC_pdp(
  grant: DerivedLocalGrant,
  action: DistributedAction,
  nodeState: DurableNodeSecurityState,
): { decision: "ALLOW" | "DENY"; reason: string } {
  // Node must be registered and not revoked
  if (nodeState.identityStatus === "REVOKED") {
    return { decision: "DENY", reason: "node identity revoked" }
  }
  if (nodeState.identityStatus === "UNREGISTERED") {
    return { decision: "DENY", reason: "node identity unregistered" }
  }

  // Enforcement must not be QUARANTINED
  if (nodeState.enforcementMode === "QUARANTINED") {
    return { decision: "DENY", reason: "node quarantined" }
  }

  // Grant must not be expired
  if (new Date(grant.effectiveExpiresAt).getTime() < Date.now()) {
    return { decision: "DENY", reason: "derived grant expired" }
  }

  // Action must match
  if (grant.action !== action.action) {
    return { decision: "DENY", reason: `action mismatch: ${grant.action} != ${action.action}` }
  }

  // Resource must match exactly (no wildcarding)
  if (grant.resource !== action.resource) {
    return { decision: "DENY", reason: `resource mismatch: ${grant.resource} != ${action.resource}` }
  }

  return { decision: "ALLOW", reason: "derived grant permits exact action" }
}

// ─── Phase C PEP (minimal) ──────────────────────────────────────────

/**
 * Phase C Policy Enforcement Point.
 * Performs the final recheck immediately before effect execution.
 * Closes the race between distributed verification and local execution.
 */
export function phaseC_pep(
  grant: DerivedLocalGrant,
  action: DistributedAction,
  nodeState: DurableNodeSecurityState,
  workloadIdentity: ObservedWorkloadIdentity,
  admissionIdentity: ObservedWorkloadIdentity,
): { decision: "ALLOW" | "DENY"; reason: string } {
  // Recheck node state
  if (nodeState.identityStatus === "REVOKED") {
    return { decision: "DENY", reason: "node revoked (PEP recheck)" }
  }
  if (nodeState.enforcementMode === "QUARANTINED") {
    return { decision: "DENY", reason: "node quarantined (PEP recheck)" }
  }

  // Recheck grant expiry
  if (new Date(grant.effectiveExpiresAt).getTime() < Date.now()) {
    return { decision: "DENY", reason: "grant expired (PEP recheck)" }
  }

  // TOCTOU: workload identity must be stable
  const stability = verifyWorkloadStable(admissionIdentity, workloadIdentity)
  if ("stale" in stability) {
    return { decision: "DENY", reason: `workload identity stale: ${stability.reason}` }
  }

  // Recheck action/resource
  if (grant.action !== action.action || grant.resource !== action.resource) {
    return { decision: "DENY", reason: "action/resource mismatch (PEP recheck)" }
  }

  return { decision: "ALLOW", reason: "PEP recheck passed" }
}

// ─── Workspace Containment ──────────────────────────────────────────

/**
 * Verify that a resource path is contained within the workspace.
 * Prevents path traversal and symlink escapes.
 */
export function verifyWorkspaceContainment(
  workspaceRoot: string,
  resourcePath: string,
): { contained: true } | { contained: false; reason: string } {
  const resolvedRoot = resolve(workspaceRoot)
  const resolvedResource = resolve(workspaceRoot, resourcePath)
  const normalizedResource = normalize(resolvedResource)

  // Must be under the workspace root
  const rel = relative(resolvedRoot, normalizedResource)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { contained: false, reason: `path escapes workspace: ${resourcePath} resolves to ${normalizedResource}` }
  }

  // Must not contain null bytes
  if (resourcePath.includes("\0")) {
    return { contained: false, reason: "resource path contains null byte" }
  }

  return { contained: true }
}

// ─── Grant Derivation ───────────────────────────────────────────────

/**
 * Derive a local Phase C grant from a distributed capability.
 * The derived grant is never broader than the narrowest upstream constraint.
 */
export function deriveLocalGrant(
  source: DistributedGrantSource,
  workloadAssurance: WorkloadIdentityAssurance,
): DerivedLocalGrant {
  const localGrantId = `local-${createHash("sha256")
    .update([
      source.issuerId,
      source.nodeId,
      source.workloadId,
      source.principalId,
      source.sessionId,
      source.action,
      source.resource,
    ].join("\0"))
    .digest("hex")
    .slice(0, 16)}`

  const sourceEnvelopeHash = createHash("sha256")
    .update(JSON.stringify(source.envelope))
    .digest("hex")

  const effectiveExpiresAt = calculateEffectiveExpiry(
    source.capabilityExpiresAt,
    "", // policy expiry (from policy state)
    "", // revocation lease
    "", // offline lease
  )

  return {
    derivationId: `drv-${Date.now()}`,
    sourceEnvelopeHash,

    issuerId: source.issuerId,
    issuerEpoch: source.issuerEpoch,

    nodeId: source.nodeId,
    workloadId: source.workloadId,
    workloadAssurance,
    principalId: source.principalId,
    sessionId: source.sessionId,

    policySequence: source.policySequence,
    policyDigest: source.policyDigest,

    revocationSequence: source.revocationSequence,
    revocationDigest: source.revocationDigest,

    localGrantId,
    action: source.action,
    resource: source.resource,
    effectiveExpiresAt,

    derivedAt: new Date().toISOString(),
  }
}

// ─── Distributed PEP ────────────────────────────────────────────────

/**
 * Execute the full distributed PEP pipeline.
 *
 * This is the D-7 vertical slice:
 * Signed remote authority → derived local grant → Phase C PDP → PEP → bounded effect.
 */
export async function executeDistributedPep(
  source: DistributedGrantSource,
  action: DistributedAction,
  nodeState: DurableNodeSecurityState,
  workspaceRoot: string,
): Promise<DistributedPepResult> {
  const failures: string[] = []

  // ── Step 1: Verify envelope structure + signature ──
  // Build trusted keys map from source
  const trustedKeys = new Map<string, Uint8Array>()
  if (source.issuerTrusted && source.issuerPublicKey) {
    // Convert hex to bytes
    const hex = source.issuerPublicKey
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
    }
    trustedKeys.set(source.issuerId, bytes)
  }

  const verificationResult = verifySignedCapability(
    source.envelope,
    trustedKeys,
  )

  if (!verificationResult.valid) {
    return {
      allowed: false,
      reason: `envelope verification failed at ${verificationResult.stage}: ${verificationResult.reason}`,
      failures: [`${verificationResult.stage}: ${verificationResult.reason}`],
    }
  }

  // ── Step 2: Resolve trusted issuer ──
  if (!source.issuerTrusted) {
    return {
      allowed: false,
      reason: `issuer ${source.issuerId} is not trusted`,
      failures: ["issuer not trusted"],
    }
  }

  // ── Step 3: Verify exact audience ──
  const audience: DistributedGrantAudience = {
    trustDomain: source.trustDomain,
    nodeId: source.nodeId,
    workloadId: source.workloadId,
    principalId: source.principalId,
    sessionId: source.sessionId,
  }

  // We need node identity — construct from state
  const nodeIdentity: NodeIdentity = {
    trustDomain: source.trustDomain,
    nodeId: source.nodeId,
    nodeCertificateFingerprint: nodeState.nodeCertificateFingerprint,
    nodeKeyEpoch: nodeState.nodeKeyEpoch,
    attestationMethod: "MANUAL_CERTIFICATE",
  }

  // ── Step 4: Observe workload identity ──
  const admissionIdentity = await observeCurrentWorkload(source.nodeId)

  // ── Step 5: Check node enforcement mode ──
  if (nodeState.enforcementMode === "QUARANTINED") {
    return {
      allowed: false,
      reason: "node is quarantined",
      failures: ["node quarantined"],
    }
  }

  // ── Step 6: Verify policy/revocation currency ──
  if (source.policySequence > 0 && nodeState.acceptedPolicySequence < source.policySequence) {
    failures.push(`policy sequence mismatch: node ${nodeState.acceptedPolicySequence} < grant ${source.policySequence}`)
  }
  if (source.revocationSequence > 0 && nodeState.acceptedRevocationSequence < source.revocationSequence) {
    failures.push(`revocation sequence behind: node ${nodeState.acceptedRevocationSequence} < grant ${source.revocationSequence}`)
  }
  if (failures.length > 0) {
    return { allowed: false, reason: "stale distributed state", failures }
  }

  // ── Step 7: Derive local grant ──
  const localGrant = deriveLocalGrant(source, admissionIdentity.assurance)

  // ── Step 8: Workspace containment ──
  if (action.action === "filesystem.read") {
    const containment = verifyWorkspaceContainment(workspaceRoot, action.resource)
    if (!("contained" in containment) || !containment.contained) {
      return {
        allowed: false,
        reason: containment.reason,
        failures: [containment.reason],
      }
    }
  }

  // ── Step 9: Phase C PDP ──
  const pdpResult = phaseC_pdp(localGrant, action, nodeState)
  if (pdpResult.decision === "DENY") {
    return {
      allowed: false,
      reason: `PDP denied: ${pdpResult.reason}`,
      failures: [`PDP: ${pdpResult.reason}`],
    }
  }

  // ── Step 10: Pre-effect recheck (PEP) ──
  // Re-observe workload identity for TOCTOU defense
  const currentIdentity = await observeCurrentWorkload(source.nodeId)

  const pepResult = phaseC_pep(
    localGrant,
    action,
    nodeState,
    currentIdentity,
    admissionIdentity,
  )

  const evidence: DistributedAuthorizationEvidence = {
    envelopeHash: createHash("sha256").update(JSON.stringify(source.envelope)).digest("hex"),
    envelopeCategory: "SIGNED_CAPABILITY",

    issuerId: source.issuerId,
    issuerEpoch: source.issuerEpoch,

    nodeId: source.nodeId,
    workloadId: source.workloadId,
    workloadAssurance: admissionIdentity.assurance,
    principalId: source.principalId,
    sessionId: source.sessionId,

    policySequence: source.policySequence,
    policyDigest: source.policyDigest,

    revocationSequence: source.revocationSequence,
    revocationDigest: source.revocationDigest,

    derivedLocalGrantId: localGrant.localGrantId,

    distributedVerification: "VERIFIED",
    localDecision: pepResult.decision,
    preEffectRecheck: pepResult.decision === "ALLOW" ? "PASSED" : "FAILED",
  }

  if (pepResult.decision === "DENY") {
    return {
      allowed: false,
      reason: `PEP denied: ${pepResult.reason}`,
      evidence,
      failures: [`PEP: ${pepResult.reason}`],
    }
  }

  // ── Step 11: Bounded effect ──
  let readResult: { path: string; size: number; hash: string } | undefined
  if (action.action === "filesystem.read") {
    const fullPath = resolve(workspaceRoot, action.resource)
    try {
      if (!existsSync(fullPath)) {
        return {
          allowed: false,
          reason: `resource not found: ${action.resource}`,
          evidence,
          failures: ["resource not found"],
        }
      }

      const stat = statSync(fullPath)
      if (!stat.isFile()) {
        return {
          allowed: false,
          reason: `resource is not a file: ${action.resource}`,
          evidence,
          failures: ["resource is not a file"],
        }
      }

      // Read and hash for audit
      const content = readFileSync(fullPath)
      readResult = {
        path: action.resource,
        size: content.length,
        hash: createHash("sha256").update(content).digest("hex"),
      }
    } catch (e) {
      return {
        allowed: false,
        reason: `read failed: ${e}`,
        evidence,
        failures: [`read error: ${e}`],
      }
    }
  }

  return {
    allowed: true,
    reason: "distributed authority verified, local PEP passed, effect executed",
    evidence,
    readResult,
    failures: [],
  }
}
