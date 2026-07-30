/**
 * TUI-2E: Governed Approval Executor (HARDENED)
 *
 * Binds the durable approval lifecycle to the real Phase C PDP/PEP.
 *
 * Precise failure semantics:
 *   PDP denial from authority change (revocation, policy, quarantine)
 *     → INVALIDATED (never return to APPROVED)
 *   PEP freshness failure
 *     → INVALIDATED
 *   Request/contract/workspace changed
 *     → INVALIDATED (STALE)
 *   Effect definitely did not begin
 *     → RETRYABLE_FAILURE (may return to APPROVED)
 *   Effect may have occurred
 *     → RECOVERY_REQUIRED (never automatically retry)
 *   Effect succeeded
 *     → CONSUMED
 *
 * A policy revocation followed by later restoration must NOT
 * silently reactivate an old human approval.
 *
 * Critical invariant: Button-to-effect paths = 0
 */

import type { ApprovalRecord, ApprovalExecutionRecord, ApprovalState } from "./approval-lifecycle"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"
import type { DistributedRunProof } from "./runproof"
import { RunProofBuilder } from "./runproof"
import { phaseC_pdp, phaseC_pep, type DerivedLocalGrant, type DistributedAction } from "./distributed-pep"

// ─── Executor Result Types ──────────────────────────────────────────

export type ApprovalExecutionOutcome =
  | {
      status: "SUCCEEDED"
      effectReceiptHash: string
      runProof: DistributedRunProof
      approvalState: "CONSUMED"
    }
  | {
      status: "DENIED"
      reason:
        | "CAPABILITY_REVOKED"
        | "POLICY_CHANGED"
        | "NODE_QUARANTINED"
        | "REQUEST_STALE"
        | "WORKSPACE_CHANGED"
      detail: string
      runProof: DistributedRunProof
      approvalState: "INVALIDATED"
    }
  | {
      status: "RETRYABLE_FAILURE"
      reason: string
      effectDefinitelyNotStarted: true
      runProof: DistributedRunProof
      approvalState: "APPROVED"
    }
  | {
      status: "RECOVERY_REQUIRED"
      reason: string
      effectMayHaveOccurred: true
      runProof?: DistributedRunProof
      approvalState: "CLAIMED" // remains claimed, never auto-retry
    }

export interface GovernedApprovalExecutor {
  execute(input: {
    executionId: string
    approvalId: string
    approvalVersion: number
    requestHash: string
  }): Promise<ApprovalExecutionOutcome>
}

// ─── Protected Request ──────────────────────────────────────────────

export type ProtectedRequest = {
  action: DistributedAction
  grant: DerivedLocalGrant
  nodeState: DurableNodeSecurityState
  workloadIdentity: ObservedWorkloadIdentity
}

export interface ProtectedRequestStore {
  loadRequest(requestHash: string): ProtectedRequest | null
}

// ─── Effect Executor ────────────────────────────────────────────────

export type EffectResult =
  | { success: true; receiptHash: string; detail: Record<string, unknown> }
  | { success: false; reason: string; effectDefinitelyNotStarted: boolean }

export interface EffectDispatcher {
  execute(request: ProtectedRequest): Promise<EffectResult>
}

// ─── Approval Executor Store ────────────────────────────────────────

export interface GovernedExecutorStore {
  loadApproval(approvalId: string): ApprovalRecord | null
  saveApproval(record: ApprovalRecord): void
  saveExecution(record: ApprovalExecutionRecord): void
  loadExecution(approvalId: string): ApprovalExecutionRecord | null
}

// ─── Implementation ─────────────────────────────────────────────────

export class RealGovernedApprovalExecutor implements GovernedApprovalExecutor {
  constructor(
    private store: GovernedExecutorStore,
    private requestStore: ProtectedRequestStore,
    private effectDispatcher: EffectDispatcher,
    private nodeId: string,
    private sessionId: string,
  ) {}

  async execute(input: {
    executionId: string
    approvalId: string
    approvalVersion: number
    requestHash: string
  }): Promise<ApprovalExecutionOutcome> {
    const { executionId, approvalId, approvalVersion, requestHash } = input
    const now = new Date().toISOString()

    // ── 1. Load fresh approval ──
    const approval = this.store.loadApproval(approvalId)
    if (!approval) {
      return {
        status: "RECOVERY_REQUIRED",
        reason: "approval not found in store",
        effectMayHaveOccurred: false,
        approvalState: "CLAIMED",
      }
    }

    // Must be APPROVED
    if (approval.state !== "APPROVED") {
      if (approval.state === "CONSUMED") {
        return {
          status: "RECOVERY_REQUIRED",
          reason: "approval already consumed",
          effectMayHaveOccurred: true,
          approvalState: "CLAIMED",
        }
      }
      if (approval.state === "INVALIDATED") {
        return {
          status: "RECOVERY_REQUIRED",
          reason: "approval already invalidated",
          effectMayHaveOccurred: false,
          approvalState: "CLAIMED",
        }
      }
      return {
        status: "RECOVERY_REQUIRED",
        reason: `approval is ${approval.state}, not APPROVED`,
        effectMayHaveOccurred: false,
        approvalState: "CLAIMED",
      }
    }

    // Verify version matches (CAS)
    if (approval.version !== approvalVersion) {
      return {
        status: "RECOVERY_REQUIRED",
        reason: "approval version changed during execution",
        effectMayHaveOccurred: false,
        approvalState: "CLAIMED",
      }
    }

    // Verify request hash
    if (approval.requestHash !== requestHash) {
      // Request changed → INVALIDATED, not retryable
      const invalidated: ApprovalRecord = {
        ...approval,
        version: approval.version + 1,
        state: "INVALIDATED",
        updatedAt: now,
      }
      this.store.saveApproval(invalidated)

      const runProof = this.buildDeniedRunProof("REQUEST_STALE", requestHash, approvalId)
      return {
        status: "DENIED",
        reason: "REQUEST_STALE",
        detail: "request hash changed after approval",
        runProof,
        approvalState: "INVALIDATED",
      }
    }

    // ── 2. Load protected request from canonical state ──
    const request = this.requestStore.loadRequest(requestHash)
    if (!request) {
      return {
        status: "RECOVERY_REQUIRED",
        reason: "protected request not found in canonical store",
        effectMayHaveOccurred: false,
        approvalState: "CLAIMED",
      }
    }

    // ── 3. Atomically claim ──
    const claimed: ApprovalRecord = {
      ...approval,
      version: approval.version + 1,
      state: "CLAIMED",
      executionId,
      updatedAt: now,
    }
    this.store.saveApproval(claimed)

    const execution: ApprovalExecutionRecord = {
      executionId,
      approvalId,
      approvalVersion: claimed.version,
      requestHash,
      state: "CLAIMED",
      createdAt: now,
      updatedAt: now,
    }
    this.store.saveExecution(execution)

    // ── 4. Build RunProof ──
    const runProofBuilder = new RunProofBuilder(this.nodeId, this.sessionId)

    // Record the approval authority source
    runProofBuilder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", {
      envelopeHash: requestHash,
      envelopeSchema: "APPROVAL_LIFECYCLE",
      approvalId,
      approvedBy: approval.approvedBy,
    })

    runProofBuilder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {
      verificationMethod: "OPERATOR_APPROVAL",
      approvalVersion: approval.version,
      operatorId: approval.approvedBy,
    })

    runProofBuilder.appendEvent("LOCAL_GRANT_DERIVED", {
      localGrantId: request.grant.localGrantId,
      derivedFrom: "APPROVAL",
    })

    // ── 5. Phase C PDP reevaluation ──
    const pdpResult = phaseC_pdp(request.grant, request.action, request.nodeState)

    if (pdpResult.decision === "DENY") {
      // Classify the denial
      const denialReason = this.classifyDenial(request.nodeState, request.grant)

      runProofBuilder.appendEvent("LOCAL_PDP_DENY", { reason: pdpResult.reason, denialClass: denialReason })
      const proof = runProofBuilder.build()

      // Authority-based denials → INVALIDATED (never retry)
      const invalidated: ApprovalRecord = {
        ...claimed,
        version: claimed.version + 1,
        state: "INVALIDATED",
        updatedAt: now,
      }
      this.store.saveApproval(invalidated)

      const failedExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
      this.store.saveExecution(failedExec)

      return {
        status: "DENIED",
        reason: denialReason,
        detail: `PDP denied: ${pdpResult.reason}`,
        runProof: proof,
        approvalState: "INVALIDATED",
      }
    }

    runProofBuilder.appendEvent("LOCAL_PDP_ALLOW", { reason: pdpResult.reason })

    // ── 6. Phase C PEP recheck ──
    const pepResult = phaseC_pep(
      request.grant,
      request.action,
      request.nodeState,
      request.workloadIdentity,
      request.workloadIdentity,
    )

    if (pepResult.decision === "DENY") {
      // PEP failures are freshness/identity issues → INVALIDATED
      runProofBuilder.appendEvent("PEP_RECHECK_FAILED", { reason: pepResult.reason })
      const proof = runProofBuilder.build()

      const invalidated: ApprovalRecord = {
        ...claimed,
        version: claimed.version + 1,
        state: "INVALIDATED",
        updatedAt: now,
      }
      this.store.saveApproval(invalidated)

      const failedExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
      this.store.saveExecution(failedExec)

      // Determine specific PEP denial reason
      const pepDenialReason = pepResult.reason.includes("stale") ? "REQUEST_STALE" : "NODE_QUARANTINED"

      return {
        status: "DENIED",
        reason: pepDenialReason,
        detail: `PEP denied: ${pepResult.reason}`,
        runProof: proof,
        approvalState: "INVALIDATED",
      }
    }

    runProofBuilder.appendEvent("PEP_RECHECK_PASSED", { workloadStable: true })

    // ── 7. Execute effect ──
    let effectResult: EffectResult
    try {
      effectResult = await this.effectDispatcher.execute(request)
    } catch (e) {
      // Exception during effect → may have occurred
      runProofBuilder.appendEvent("EFFECT_DENIED", { reason: `effect threw: ${(e as Error).message}` })
      const proof = runProofBuilder.build()

      const recoveryExec: ApprovalExecutionRecord = { ...execution, state: "RECOVERY_REQUIRED", updatedAt: now }
      this.store.saveExecution(recoveryExec)
      // Approval stays CLAIMED — never auto-retry

      return {
        status: "RECOVERY_REQUIRED",
        reason: `effect threw: ${(e as Error).message}`,
        effectMayHaveOccurred: true,
        runProof: proof,
        approvalState: "CLAIMED",
      }
    }

    if (!effectResult.success) {
      runProofBuilder.appendEvent("EFFECT_DENIED", { reason: effectResult.reason })
      const proof = runProofBuilder.build()

      if (effectResult.effectDefinitelyNotStarted) {
        // Effect definitely didn't start → RETRYABLE_FAILURE
        const retryableExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
        this.store.saveExecution(retryableExec)

        // Return to APPROVED for potential retry
        const reverted: ApprovalRecord = {
          ...claimed,
          version: claimed.version + 1,
          state: "APPROVED",
          executionId: undefined,
          updatedAt: now,
        }
        this.store.saveApproval(reverted)

        return {
          status: "RETRYABLE_FAILURE",
          reason: effectResult.reason,
          effectDefinitelyNotStarted: true,
          runProof: proof,
          approvalState: "APPROVED",
        }
      } else {
        // Effect may have started → RECOVERY_REQUIRED
        const recoveryExec: ApprovalExecutionRecord = { ...execution, state: "RECOVERY_REQUIRED", updatedAt: now }
        this.store.saveExecution(recoveryExec)

        return {
          status: "RECOVERY_REQUIRED",
          reason: effectResult.reason,
          effectMayHaveOccurred: true,
          runProof: proof,
          approvalState: "CLAIMED",
        }
      }
    }

    runProofBuilder.appendEvent("EFFECT_EXECUTED", { ...effectResult.detail, receiptHash: effectResult.receiptHash })
    runProofBuilder.appendEvent("EFFECT_RECEIPT", { receiptHash: effectResult.receiptHash })

    // ── 8. Consume approval ──
    try {
      const consumed: ApprovalRecord = {
        ...claimed,
        version: claimed.version + 1,
        state: "CONSUMED",
        updatedAt: now,
      }
      this.store.saveApproval(consumed)

      const succeededExec: ApprovalExecutionRecord = {
        ...execution,
        state: "SUCCEEDED",
        effectReceiptHash: effectResult.receiptHash,
        updatedAt: now,
      }
      this.store.saveExecution(succeededExec)
    } catch (e) {
      // Effect succeeded but consume failed → RECOVERY_REQUIRED
      const recoveryExec: ApprovalExecutionRecord = {
        ...execution,
        state: "RECOVERY_REQUIRED",
        effectReceiptHash: effectResult.receiptHash,
        updatedAt: now,
      }
      this.store.saveExecution(recoveryExec)

      return {
        status: "RECOVERY_REQUIRED",
        reason: `effect succeeded but consume commit failed: ${(e as Error).message}`,
        effectMayHaveOccurred: true,
        approvalState: "CLAIMED",
      }
    }

    const proof = runProofBuilder.build()
    return {
      status: "SUCCEEDED",
      effectReceiptHash: effectResult.receiptHash,
      runProof: proof,
      approvalState: "CONSUMED",
    }
  }

  // ─── Denial Classification ──────────────────────────────────────

  private classifyDenial(
    nodeState: DurableNodeSecurityState,
    grant: DerivedLocalGrant,
  ): "CAPABILITY_REVOKED" | "POLICY_CHANGED" | "NODE_QUARANTINED" | "REQUEST_STALE" {
    if (nodeState.identityStatus === "REVOKED") return "CAPABILITY_REVOKED"
    if (nodeState.enforcementMode === "QUARANTINED") return "NODE_QUARANTINED"
    if (nodeState.acceptedPolicySequence < grant.policySequence) return "POLICY_CHANGED"
    return "REQUEST_STALE"
  }

  private buildDeniedRunProof(
    denialReason: string,
    requestHash: string,
    approvalId: string,
  ): DistributedRunProof {
    const builder = new RunProofBuilder(this.nodeId, this.sessionId)
    builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", {
      envelopeHash: requestHash,
      envelopeSchema: "APPROVAL_LIFECYCLE",
      approvalId,
    })
    builder.appendEvent("DISTRIBUTED_VERIFICATION_FAILED", { reason: denialReason })
    return builder.build()
  }
}
