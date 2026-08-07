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

import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"

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
  getAffordances?: (approvalId: string) => readonly AuthorityAffordance[] | undefined
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
    return approval
  }

  function verifyRuntimeAffordance(
    approvalId: string,
    action: "approve" | "deny",
  ): void {
    const affordances = input.getAffordances?.(approvalId)
    if (!affordances || affordances.length === 0) {
      throw new Error(`Approval ${approvalId} has no runtime authority affordances`)
    }
    const item = affordances.find((candidate) => candidate.action === action)
    if (!item || item.state !== "available") {
      const reason = item?.reasonCode ?? "unavailable"
      throw new Error(`Approval ${approvalId} ${action} is not available (${reason})`)
    }
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
      verifyRuntimeAffordance(input_.approvalId, command === "approveOnce" ? "approve" : "deny")
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

      // Keep SUBMITTING shell state — don't clear to undefined here.
      // The durable event refresh will deliver the terminal state
      // (APPROVED/DENIED/CLAIMED/CONSUMED), which replaces the shell state.
      // Clearing to undefined here would flash the base state before the
      // terminal state arrives (UI flicker).
      submitting = false

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
    // Shell interaction (TUI-2 §9): SELECTED ↔ INSPECTING are ephemeral only.
    select(approvalId: string) {
      selectedId = approvalId
      inspectingId = undefined
      setState(approvalId, "SELECTED")
    },

    inspect(approvalId: string) {
      selectedId = approvalId
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
      // Do NOT reset `submitting` here — only the command completion in
      // executeCommand should clear it. Otherwise pressing Escape during an
      // in-flight command would allow a duplicate submission.
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
