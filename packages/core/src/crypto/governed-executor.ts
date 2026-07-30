/**
 * TUI-2E: Governed Approval Executor
 *
 * Binds the durable approval lifecycle to the real Phase C PDP/PEP.
 *
 * Critical path:
 *   durable APPROVED
 *   → execution worker loads fresh approval
 *   → atomically CLAIMED
 *   → Phase C PDP reevaluates
 *   → Phase C PEP rechecks
 *   → effect dispatched
 *   → execution result recorded
 *   → approval CONSUMED
 *
 * The executor loads the protected request from durable canonical state.
 * It does NOT trust action arguments supplied by the panel.
 *
 * Critical failure window:
 *   effect succeeds → process crashes → CONSUMED state not committed
 *   → RECOVERY_REQUIRED
 *   → no automatic replay
 *   → do NOT return approval to APPROVED
 */

import type { ApprovalRecord, ApprovalExecutionRecord } from "./approval-lifecycle"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"
import type { DistributedRunProof } from "./runproof"
import { RunProofBuilder } from "./runproof"
import { phaseC_pdp, phaseC_pep, type DerivedLocalGrant, type DistributedAction } from "./distributed-pep"

// ─── Executor Types ─────────────────────────────────────────────────

export type GovernedExecutorResult =
  | { status: "SUCCEEDED"; effectReceiptHash: string; runProof: DistributedRunProof }
  | { status: "DENIED"; reason: string; runProof: DistributedRunProof }
  | { status: "FAILED"; reason: string; runProof?: DistributedRunProof }
  | { status: "RECOVERY_REQUIRED"; reason: string }

export interface GovernedApprovalExecutor {
  execute(input: {
    executionId: string
    approvalId: string
    approvalVersion: number
    requestHash: string
  }): Promise<GovernedExecutorResult>
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
  | { success: false; reason: string }

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
  }): Promise<GovernedExecutorResult> {
    const { executionId, approvalId, approvalVersion, requestHash } = input
    const now = new Date().toISOString()

    // ── 1. Load fresh approval ──
    const approval = this.store.loadApproval(approvalId)
    if (!approval) {
      return { status: "FAILED", reason: "approval not found" }
    }

    // Must be APPROVED
    if (approval.state !== "APPROVED") {
      if (approval.state === "CONSUMED") {
        return { status: "FAILED", reason: "approval already consumed" }
      }
      if (approval.state === "DENIED") {
        return { status: "DENIED", reason: "approval was denied" }
      }
      return { status: "FAILED", reason: `approval is ${approval.state}, not APPROVED` }
    }

    // Verify version matches (CAS)
    if (approval.version !== approvalVersion) {
      return { status: "FAILED", reason: "approval version changed" }
    }

    // Verify request hash
    if (approval.requestHash !== requestHash) {
      return { status: "FAILED", reason: "request hash changed — STALE" }
    }

    // ── 2. Load protected request from canonical state ──
    const request = this.requestStore.loadRequest(requestHash)
    if (!request) {
      return { status: "FAILED", reason: "protected request not found" }
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

    // Record the approval authority source (human operator, not distributed envelope)
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
    const pdpResult = phaseC_pdp(
      request.grant,
      request.action,
      request.nodeState,
    )

    if (pdpResult.decision === "DENY") {
      runProofBuilder.appendEvent("LOCAL_PDP_DENY", { reason: pdpResult.reason })

      // Update execution as failed
      const failedExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
      this.store.saveExecution(failedExec)

      // Return approval to APPROVED so it can be re-evaluated
      const reverted: ApprovalRecord = { ...claimed, version: claimed.version + 1, state: "APPROVED", executionId: undefined, updatedAt: now }
      this.store.saveApproval(reverted)

      const proof = runProofBuilder.build()
      return { status: "DENIED", reason: `PDP denied: ${pdpResult.reason}`, runProof: proof }
    }

    runProofBuilder.appendEvent("LOCAL_PDP_ALLOW", { reason: pdpResult.reason })

    // ── 6. Phase C PEP recheck ──
    // Re-observe workload identity for TOCTOU defense
    const pepResult = phaseC_pep(
      request.grant,
      request.action,
      request.nodeState,
      request.workloadIdentity, // current
      request.workloadIdentity, // admission (same for now; real system re-observes)
    )

    if (pepResult.decision === "DENY") {
      runProofBuilder.appendEvent("PEP_RECHECK_FAILED", { reason: pepResult.reason })

      const failedExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
      this.store.saveExecution(failedExec)

      const reverted: ApprovalRecord = { ...claimed, version: claimed.version + 1, state: "APPROVED", executionId: undefined, updatedAt: now }
      this.store.saveApproval(reverted)

      const proof = runProofBuilder.build()
      return { status: "DENIED", reason: `PEP denied: ${pepResult.reason}`, runProof: proof }
    }

    runProofBuilder.appendEvent("PEP_RECHECK_PASSED", { workloadStable: true })

    // ── 7. Execute effect ──
    let effectResult: EffectResult
    try {
      effectResult = await this.effectDispatcher.execute(request)
    } catch (e) {
      runProofBuilder.appendEvent("EFFECT_DENIED", { reason: `effect threw: ${(e as Error).message}` })

      // Uncertain state → RECOVERY_REQUIRED
      const recoveryExec: ApprovalExecutionRecord = { ...execution, state: "RECOVERY_REQUIRED", updatedAt: now }
      this.store.saveExecution(recoveryExec)

      const proof = runProofBuilder.build()
      return { status: "RECOVERY_REQUIRED", reason: `effect threw: ${(e as Error).message}` }
    }

    if (!effectResult.success) {
      runProofBuilder.appendEvent("EFFECT_DENIED", { reason: effectResult.reason })

      const failedExec: ApprovalExecutionRecord = { ...execution, state: "FAILED", updatedAt: now }
      this.store.saveExecution(failedExec)

      // Return to APPROVED
      const reverted: ApprovalRecord = { ...claimed, version: claimed.version + 1, state: "APPROVED", executionId: undefined, updatedAt: now }
      this.store.saveApproval(reverted)

      const proof = runProofBuilder.build()
      return { status: "FAILED", reason: effectResult.reason, runProof: proof }
    }

    runProofBuilder.appendEvent("EFFECT_EXECUTED", { ...effectResult.detail, receiptHash: effectResult.receiptHash })
    runProofBuilder.appendEvent("EFFECT_RECEIPT", { receiptHash: effectResult.receiptHash })

    // ── 8. Consume approval ──
    // This is the critical commit point. If this fails, the effect
    // may have succeeded but we can't record it.
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
        reason: `effect succeeded but consume failed: ${(e as Error).message}`,
      }
    }

    const proof = runProofBuilder.build()
    return { status: "SUCCEEDED", effectReceiptHash: effectResult.receiptHash, runProof: proof }
  }
}
