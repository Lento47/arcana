/**
 * TUI-2S: Approval Operator Service
 *
 * The shell's command surface. Keyboard input reaches this service,
 * NEVER the GovernedApprovalExecutor directly.
 *
 * Path:
 *   keyboard → ApprovalOperatorService → durable approval transition
 *
 * Never:
 *   keyboard → GovernedApprovalExecutor
 */

import {
  processApprovalCommand,
  type ApprovalCommand,
  type ApprovalCommandResult,
  type AuthenticatedOperator,
  type ApprovalRecord,
  type ApprovalLifecycleStore,
} from "./approval-lifecycle"

// ─── Service Types ──────────────────────────────────────────────────

export type ApprovalCommandKind = "APPROVE_ONCE" | "DENY"

export type OperatorCommandRequest = {
  approvalId: string
  command: ApprovalCommandKind
  expectedVersion: number
  expectedRequestHash: string
  expectedContractRevision: number
}

export type OperatorCommandResponse =
  | { success: true; approval: ApprovalRecord }
  | { success: false; reason: string; stale?: boolean }

export interface ApprovalOperatorService {
  submitCommand(request: OperatorCommandRequest): OperatorCommandResponse
  loadApproval(approvalId: string): ApprovalRecord | null
  loadPendingApprovals(): ApprovalRecord[]
}

// ─── Implementation ─────────────────────────────────────────────────

export class RealApprovalOperatorService implements ApprovalOperatorService {
  constructor(
    private store: ApprovalLifecycleStore,
    private authenticatedOperator: AuthenticatedOperator,
    private sessionId: string,
    private workspaceId: string,
  ) {}

  submitCommand(request: OperatorCommandRequest): OperatorCommandResponse {
    const { approvalId, command, expectedVersion, expectedRequestHash, expectedContractRevision } = request
    const now = new Date()

    // Load the approval to verify version and state
    const approval = this.store.loadApproval(approvalId)
    if (!approval) {
      return { success: false, reason: "approval not found" }
    }

    // Verify it's actionable
    if (approval.state !== "PENDING") {
      return { success: false, reason: `approval is ${approval.state}, not PENDING` }
    }

    // Verify version (optimistic concurrency)
    if (approval.version !== expectedVersion) {
      return { success: false, reason: "approval version changed — STALE", stale: true }
    }

    // Verify session ownership
    if (approval.sessionId !== this.sessionId) {
      return { success: false, reason: "approval belongs to another session" }
    }

    // Verify workspace
    if (approval.workspaceId !== this.workspaceId) {
      return { success: false, reason: "approval belongs to another workspace" }
    }

    // Build the approval command
    let cmdResult: ApprovalCommandResult
    if (command === "APPROVE_ONCE") {
      // Verify request hash and contract revision haven't changed
      if (approval.requestHash !== expectedRequestHash) {
        return { success: false, reason: "request hash changed — STALE", stale: true }
      }
      if (approval.contractRevision !== expectedContractRevision) {
        return { success: false, reason: "contract revision changed — STALE", stale: true }
      }

      cmdResult = processApprovalCommand(
        {
          kind: "APPROVE",
          approvalId,
          requestHash: expectedRequestHash,
          contractRevision: expectedContractRevision,
          operatorId: this.authenticatedOperator.operatorId,
          sessionId: this.sessionId,
          workspaceId: this.workspaceId,
        },
        this.store,
        this.authenticatedOperator,
        now,
      )
    } else {
      cmdResult = processApprovalCommand(
        {
          kind: "DENY",
          approvalId,
          operatorId: this.authenticatedOperator.operatorId,
          sessionId: this.sessionId,
          workspaceId: this.workspaceId,
        },
        this.store,
        this.authenticatedOperator,
        now,
      )
    }

    if (!cmdResult.success) {
      return { success: false, reason: cmdResult.reason }
    }

    return { success: true, approval: cmdResult.approval! }
  }

  loadApproval(approvalId: string): ApprovalRecord | null {
    return this.store.loadApproval(approvalId)
  }

  loadPendingApprovals(): ApprovalRecord[] {
    return this.store.loadPendingApprovals(this.sessionId)
  }
}
