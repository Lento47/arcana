/**
 * TUI-2.1B: Approval Shell Controller
 *
 * The only production UI component allowed to send approval commands.
 * Depends on: ApprovalOperatorService, session/workspace context,
 * read-only ApprovalPanelView, local shell state.
 *
 * Never depends on:
 *   GovernedApprovalExecutor
 *   SqliteApprovalStore internals
 *   effect callbacks
 *   raw SQL
 *   Phase C execution functions
 */

import type { ApprovalRecord, ApprovalState } from "@arcana/core/crypto/approval-lifecycle"

// ─── Types ───────────────────────────────────────────────────────

export type ApprovalCommandResult = {
  status: "APPROVED" | "DENIED" | "ERROR"
  approvalId: string
  newVersion?: number
  error?: string
}

export type ApprovalCommandInput = {
  approvalId: string
  expectedVersion: number
  expectedRequestHash: string
  expectedContractRevision: number
}

export type ApprovalPanelView = {
  approval: ApprovalRecord
  actionable: boolean
  terminal: boolean
  submitting: boolean
}

/** Ephemeral shell state — not durable lifecycle states. */
export type ApprovalShellState =
  | "SELECTED"
  | "INSPECTING"
  | "SUBMITTING"
  | "COMMAND_FAILED"

export interface ApprovalOperatorService {
  approveOnce(input: ApprovalCommandInput): Promise<ApprovalCommandResult>
  deny(input: ApprovalCommandInput): Promise<ApprovalCommandResult>
}

export interface SessionContext {
  sessionId: string
  workspaceId: string
  operatorId: string
}

export interface ApprovalShellController {
  select(approvalId: string): void
  inspect(approvalId: string): void

  approveOnce(input: ApprovalCommandInput): Promise<ApprovalCommandResult>
  deny(input: ApprovalCommandInput): Promise<ApprovalCommandResult>

  clearSelection(): void

  /** Current ephemeral shell state. */
  getShellState(): ApprovalShellState | undefined

  /** Currently selected approval ID. */
  getSelectedApprovalId(): string | undefined

  /** Currently inspecting approval ID. */
  getInspectingApprovalId(): string | undefined

  /** Whether a command is in flight. */
  isSubmitting(): boolean
}

// ─── Implementation ──────────────────────────────────────────────

export function createApprovalShellController(input: {
  service: ApprovalOperatorService
  session: SessionContext
  getApproval: (id: string) => ApprovalRecord | undefined
  onStateChange?: (approvalId: string, state: ApprovalShellState | undefined) => void
}): ApprovalShellController {
  let selectedId: string | undefined
  let inspectingId: string | undefined
  let shellState: ApprovalShellState | undefined
  let submitting = false

  function setState(approvalId: string, state: ApprovalShellState | undefined) {
    shellState = state
    input.onStateChange?.(approvalId, state)
  }

  function verifyActionable(approvalId: string): ApprovalRecord {
    const approval = input.getApproval(approvalId)
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`)
    }
    if (approval.state !== "PENDING") {
      throw new Error(`Approval ${approvalId} is not actionable (state: ${approval.state})`)
    }
    if (approval.sessionId !== input.session.sessionId) {
      throw new Error(`Approval ${approvalId} belongs to different session`)
    }
    if (approval.workspaceId !== input.session.workspaceId) {
      throw new Error(`Approval ${approvalId} belongs to different workspace`)
    }
    return approval
  }

  async function executeCommand(
    input_: ApprovalCommandInput,
    command: "approveOnce" | "deny",
  ): Promise<ApprovalCommandResult> {
    if (submitting) {
      return {
        status: "ERROR",
        approvalId: input_.approvalId,
        error: "Command already in flight",
      }
    }

    // Verify selected approval is actionable
    try {
      verifyActionable(input_.approvalId)
    } catch (err) {
      return {
        status: "ERROR",
        approvalId: input_.approvalId,
        error: err instanceof Error ? err.message : "Unknown error",
      }
    }

    submitting = true
    setState(input_.approvalId, "SUBMITTING")

    try {
      const result = await input.service[command](input_)

      // Clear SUBMITTING — durable event refresh handles final state
      submitting = false
      setState(input_.approvalId, undefined)

      return result
    } catch (err) {
      submitting = false
      setState(input_.approvalId, "COMMAND_FAILED")
      return {
        status: "ERROR",
        approvalId: input_.approvalId,
        error: err instanceof Error ? err.message : "Command failed",
      }
    }
  }

  return {
    select(approvalId: string) {
      selectedId = approvalId
      setState(approvalId, "SELECTED")
    },

    inspect(approvalId: string) {
      inspectingId = approvalId
      setState(approvalId, "INSPECTING")
    },

    async approveOnce(input_: ApprovalCommandInput): Promise<ApprovalCommandResult> {
      return executeCommand(input_, "approveOnce")
    },

    async deny(input_: ApprovalCommandInput): Promise<ApprovalCommandResult> {
      return executeCommand(input_, "deny")
    },

    clearSelection() {
      const prev = selectedId
      selectedId = undefined
      inspectingId = undefined
      submitting = false
      if (prev) setState(prev, undefined)
    },

    getShellState() {
      return shellState
    },

    getSelectedApprovalId() {
      return selectedId
    },

    getInspectingApprovalId() {
      return inspectingId
    },

    isSubmitting() {
      return submitting
    },
  }
}
