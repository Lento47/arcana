/**
 * D-7P: Distributed Authorization RunProof
 *
 * Causal chain:
 *   signed envelope hash
 *   → verified distributed authority event
 *   → derived local grant event
 *   → local PDP decision
 *   → PEP freshness recheck
 *   → filesystem effect event
 *   → effect receipt
 *   → RunProof
 *
 * Invariants:
 *   RunProof says distributed verification passed
 *     ⟺ verification event exists and is valid
 *   RunProof says local PDP allowed
 *     ⟺ Phase C allow event exists
 *   RunProof says effect occurred
 *     ⟺ effect receipt exists
 *   RunProof says trace complete
 *     ⟺ no required distributed/local event is missing
 *
 * A successful read with a missing authority event:
 *   → AuthorizationTraceHealth = DEGRADED, not COMPLETE
 */

import { createHash } from "node:crypto"

// ─── Evidence Types ─────────────────────────────────────────────────

export type WorkloadAssuranceLevel =
  | "DECLARED"
  | "OS_OBSERVED"
  | "SIGNED_BINARY"
  | "HARDWARE_ATTESTED"

export type DistributedAuthorizationEvidence = {
  version: 1

  envelopeHash: string
  envelopeSchema: "SIGNED_CAPABILITY_V1"

  issuerId: string
  issuerEpoch: number

  nodeId: string

  workloadId: string
  workloadAssurance: WorkloadAssuranceLevel
  workloadEvidenceHash: string

  principalId: string
  sessionId: string
  workspaceId: string

  policySequence: number
  policyDigest: string

  revocationSequence: number
  revocationDigest: string
  emergencyEpoch: number

  derivedLocalGrantId: string
  derivedGrantHash: string
  effectiveExpiresAt: string

  requestHash: string

  distributedVerification: "VERIFIED" | "REJECTED"
  localPdpDecision: "ALLOW" | "DENY"
  preEffectRecheck: "PASSED" | "FAILED"

  effect: {
    kind: "FILESYSTEM_READ"
    resource: string
    maximumBytes: number
    bytesRead?: number
    contentHash?: string
    receiptHash?: string
  }
}

// ─── RunProof Events ────────────────────────────────────────────────

export type RunProofEventKind =
  | "DISTRIBUTED_ENVELOPE_RECEIVED"
  | "DISTRIBUTED_VERIFICATION_PASSED"
  | "DISTRIBUTED_VERIFICATION_FAILED"
  | "LOCAL_GRANT_DERIVED"
  | "LOCAL_PDP_ALLOW"
  | "LOCAL_PDP_DENY"
  | "PEP_RECHECK_PASSED"
  | "PEP_RECHECK_FAILED"
  | "EFFECT_EXECUTED"
  | "EFFECT_RECEIPT"
  | "EFFECT_DENIED"
  | "TRACE_COMPLETE"
  | "TRACE_DEGRADED"

export type RunProofEvent = {
  eventId: string
  kind: RunProofEventKind
  timestamp: string
  causalParentId?: string
  detail: Record<string, unknown>
  integrityHash: string
}

// ─── Trace Health ───────────────────────────────────────────────────

export type AuthorizationTraceHealth =
  | "COMPLETE"     // All required events present and consistent
  | "DEGRADED"     // Some events missing but effect occurred
  | "INVALID"      // Integrity mismatch detected
  | "INCOMPLETE"   // Required events not yet recorded

// ─── RunProof State ─────────────────────────────────────────────────

export type DistributedRunProof = {
  runProofId: string
  nodeId: string
  sessionId: string

  envelopeEventId?: string
  verificationEventId?: string
  grantEventId?: string
  pdpEventId?: string
  pepEventId?: string
  effectEventId?: string
  receiptEventId?: string

  traceHealth: AuthorizationTraceHealth
  integrityStatus: "VALID" | "INVALID" | "UNKNOWN"

  events: RunProofEvent[]
  evidenceHash: string

  createdAt: string
  updatedAt: string
}

// ─── RunProof Builder ───────────────────────────────────────────────

export class RunProofBuilder {
  private proof: DistributedRunProof
  private expectedChain: RunProofEventKind[] = [
    "DISTRIBUTED_ENVELOPE_RECEIVED",
    "DISTRIBUTED_VERIFICATION_PASSED",
    "LOCAL_GRANT_DERIVED",
    "LOCAL_PDP_ALLOW",
    "PEP_RECHECK_PASSED",
    "EFFECT_EXECUTED",
    "EFFECT_RECEIPT",
  ]

  constructor(nodeId: string, sessionId: string) {
    this.proof = {
      runProofId: `rp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nodeId,
      sessionId,
      traceHealth: "INCOMPLETE",
      integrityStatus: "UNKNOWN",
      events: [],
      evidenceHash: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  appendEvent(
    kind: RunProofEventKind,
    detail: Record<string, unknown>,
    causalParentId?: string,
  ): RunProofEvent {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const timestamp = new Date().toISOString()

    const integrityHash = createHash("sha256")
      .update(JSON.stringify({ eventId, kind, timestamp, causalParentId, detail }))
      .digest("hex")

    const event: RunProofEvent = {
      eventId,
      kind,
      timestamp,
      causalParentId,
      detail,
      integrityHash,
    }

    this.proof.events.push(event)
    this.proof.updatedAt = timestamp

    // Link event to proof slots
    switch (kind) {
      case "DISTRIBUTED_ENVELOPE_RECEIVED":
        this.proof.envelopeEventId = eventId
        break
      case "DISTRIBUTED_VERIFICATION_PASSED":
      case "DISTRIBUTED_VERIFICATION_FAILED":
        this.proof.verificationEventId = eventId
        break
      case "LOCAL_GRANT_DERIVED":
        this.proof.grantEventId = eventId
        break
      case "LOCAL_PDP_ALLOW":
      case "LOCAL_PDP_DENY":
        this.proof.pdpEventId = eventId
        break
      case "PEP_RECHECK_PASSED":
      case "PEP_RECHECK_FAILED":
        this.proof.pepEventId = eventId
        break
      case "EFFECT_EXECUTED":
      case "EFFECT_DENIED":
        this.proof.effectEventId = eventId
        break
      case "EFFECT_RECEIPT":
        this.proof.receiptEventId = eventId
        break
    }

    return event
  }

  /**
   * Evaluate trace completeness and integrity.
   * Must be called after all events are appended.
   */
  evaluateTrace(): AuthorizationTraceHealth {
    const hasEnvelope = this.proof.envelopeEventId !== undefined
    const hasVerification = this.proof.verificationEventId !== undefined
    const hasGrant = this.proof.grantEventId !== undefined
    const hasPdp = this.proof.pdpEventId !== undefined
    const hasPep = this.proof.pepEventId !== undefined
    const hasEffect = this.proof.effectEventId !== undefined
    const hasReceipt = this.proof.receiptEventId !== undefined

    // Check if verification passed
    const verificationEvent = this.proof.events.find(
      e => e.kind === "DISTRIBUTED_VERIFICATION_PASSED" || e.kind === "DISTRIBUTED_VERIFICATION_FAILED"
    )
    const verificationPassed = verificationEvent?.kind === "DISTRIBUTED_VERIFICATION_PASSED"

    // Check PDP decision
    const pdpEvent = this.proof.events.find(
      e => e.kind === "LOCAL_PDP_ALLOW" || e.kind === "LOCAL_PDP_DENY"
    )
    const pdpAllowed = pdpEvent?.kind === "LOCAL_PDP_ALLOW"

    // Check PEP recheck
    const pepEvent = this.proof.events.find(
      e => e.kind === "PEP_RECHECK_PASSED" || e.kind === "PEP_RECHECK_FAILED"
    )
    const pepPassed = pepEvent?.kind === "PEP_RECHECK_PASSED"

    // Integrity check: event chain hash consistency
    const integrityValid = this.verifyEventChainIntegrity()
    this.proof.integrityStatus = integrityValid ? "VALID" : "INVALID"

    // Trace health determination
    if (!integrityValid) {
      this.proof.traceHealth = "INVALID"
      return "INVALID"
    }

    // Effect occurred but authority events missing → DEGRADED
    if (hasEffect || hasReceipt) {
      if (!hasEnvelope || !verificationPassed || !hasGrant) {
        this.proof.traceHealth = "DEGRADED"
        return "DEGRADED"
      }
      if (!pdpAllowed || !pepPassed) {
        this.proof.traceHealth = "INVALID"
        return "INVALID"
      }
      // Effect without receipt → DEGRADED
      if (hasEffect && !hasReceipt) {
        this.proof.traceHealth = "DEGRADED"
        return "DEGRADED"
      }
    }

    // All required events present
    if (hasEnvelope && hasVerification && hasGrant && hasPdp && hasPep && hasEffect && hasReceipt) {
      if (verificationPassed && pdpAllowed && pepPassed) {
        this.proof.traceHealth = "COMPLETE"
        return "COMPLETE"
      }
      this.proof.traceHealth = "INVALID"
      return "INVALID"
    }

    // Verification, PDP, or PEP denied → no effect expected → COMPLETE
    if ((hasVerification && !verificationPassed) || (hasPdp && !pdpAllowed) || (hasPep && !pepPassed)) {
      this.proof.traceHealth = "COMPLETE"
      return "COMPLETE"
    }

    this.proof.traceHealth = "INCOMPLETE"
    return "INCOMPLETE"
  }

  /**
   * Verify the event chain integrity.
   * Each event's causal parent must reference a valid prior event.
   */
  private verifyEventChainIntegrity(): boolean {
    const eventIds = new Set(this.proof.events.map(e => e.eventId))

    for (const event of this.proof.events) {
      // Verify event's own integrity hash
      const recomputed = createHash("sha256")
        .update(JSON.stringify({
          eventId: event.eventId,
          kind: event.kind,
          timestamp: event.timestamp,
          causalParentId: event.causalParentId,
          detail: event.detail,
        }))
        .digest("hex")

      if (recomputed !== event.integrityHash) {
        return false
      }

      // Verify causal parent exists (if specified)
      if (event.causalParentId && !eventIds.has(event.causalParentId)) {
        return false
      }
    }

    return true
  }

  build(): DistributedRunProof {
    this.evaluateTrace()

    // Compute overall evidence hash
    this.proof.evidenceHash = createHash("sha256")
      .update(JSON.stringify({
        runProofId: this.proof.runProofId,
        nodeId: this.proof.nodeId,
        events: this.proof.events.map(e => e.integrityHash),
        traceHealth: this.proof.traceHealth,
      }))
      .digest("hex")

    return { ...this.proof }
  }
}

// ─── Verification Helpers ───────────────────────────────────────────

/**
 * Verify that a RunProof's trace health is consistent with its events.
 * Used for independent validation after loading from storage.
 */
export function verifyRunProofConsistency(
  proof: DistributedRunProof,
): { consistent: true } | { consistent: false; reason: string } {
  // Recompute event integrity hashes
  for (const event of proof.events) {
    const recomputed = createHash("sha256")
      .update(JSON.stringify({
        eventId: event.eventId,
        kind: event.kind,
        timestamp: event.timestamp,
        causalParentId: event.causalParentId,
        detail: event.detail,
      }))
      .digest("hex")

    if (recomputed !== event.integrityHash) {
      return {
        consistent: false,
        reason: `event ${event.eventId} integrity hash mismatch`,
      }
    }
  }

  // Verify trace health claims
  const hasEffect = proof.events.some(e => e.kind === "EFFECT_EXECUTED")
  const hasVerification = proof.events.some(e => e.kind === "DISTRIBUTED_VERIFICATION_PASSED")
  const hasPdpAllow = proof.events.some(e => e.kind === "LOCAL_PDP_ALLOW")

  if (proof.traceHealth === "COMPLETE") {
    if (hasEffect) {
      // Complete with effect requires all authority events
      if (!hasVerification) {
        return { consistent: false, reason: "COMPLETE trace with effect but no verification event" }
      }
      if (!hasPdpAllow) {
        return { consistent: false, reason: "COMPLETE trace with effect but no PDP allow event" }
      }
    }
  }

  if (proof.traceHealth === "DEGRADED") {
    if (!hasEffect) {
      return { consistent: false, reason: "DEGRADED trace but no effect event" }
    }
    // DEGRADED means some authority event is missing
    if (hasVerification && hasPdpAllow) {
      // All authority events present shouldn't be DEGRADED
      const hasGrant = proof.events.some(e => e.kind === "LOCAL_GRANT_DERIVED")
      const hasPep = proof.events.some(e => e.kind === "PEP_RECHECK_PASSED")
      const hasReceipt = proof.events.some(e => e.kind === "EFFECT_RECEIPT")
      if (hasGrant && hasPep && hasReceipt) {
        return { consistent: false, reason: "DEGRADED trace but all events present" }
      }
    }
  }

  // Recompute evidence hash
  const recomputedHash = createHash("sha256")
    .update(JSON.stringify({
      runProofId: proof.runProofId,
      nodeId: proof.nodeId,
      events: proof.events.map(e => e.integrityHash),
      traceHealth: proof.traceHealth,
    }))
    .digest("hex")

  if (recomputedHash !== proof.evidenceHash) {
    return { consistent: false, reason: "evidence hash mismatch" }
  }

  return { consistent: true }
}

/**
 * Check if a RunProof indicates a trace agreement with an expected outcome.
 */
export function checkRunProofAgreement(
  proof: DistributedRunProof,
  expected: {
    verificationPassed?: boolean
    pdpAllowed?: boolean
    effectExecuted?: boolean
  },
): { agreed: true } | { agreed: false; reason: string }{
  const hasVerificationPass = proof.events.some(e => e.kind === "DISTRIBUTED_VERIFICATION_PASSED")
  const hasPdpAllow = proof.events.some(e => e.kind === "LOCAL_PDP_ALLOW")
  const hasEffect = proof.events.some(e => e.kind === "EFFECT_EXECUTED")

  if (expected.verificationPassed !== undefined && hasVerificationPass !== expected.verificationPassed) {
    return { agreed: false, reason: `verification: RunProof=${hasVerificationPass}, expected=${expected.verificationPassed}` }
  }
  if (expected.pdpAllowed !== undefined && hasPdpAllow !== expected.pdpAllowed) {
    return { agreed: false, reason: `PDP: RunProof=${hasPdpAllow}, expected=${expected.pdpAllowed}` }
  }
  if (expected.effectExecuted !== undefined && hasEffect !== expected.effectExecuted) {
    return { agreed: false, reason: `effect: RunProof=${hasEffect}, expected=${expected.effectExecuted}` }
  }

  return { agreed: true }
}
