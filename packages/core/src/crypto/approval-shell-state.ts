/**
 * TUI-2S: Approval Shell State Machine
 *
 * Ephemeral UI interaction state — NOT durable approval state.
 * After command submission, the shell reloads from the durable
 * event stream, never inferring the next lifecycle state locally.
 *
 * States:
 *   IDLE → SELECTED → INSPECTING → SUBMITTING → IDLE
 *                    → COMMAND_FAILED → IDLE
 */

// ─── Shell State ────────────────────────────────────────────────────

export type ApprovalShellState =
  | { kind: "IDLE" }
  | {
      kind: "SELECTED"
      approvalId: string
      expectedVersion: number
    }
  | {
      kind: "INSPECTING"
      approvalId: string
      expectedVersion: number
    }
  | {
      kind: "SUBMITTING"
      approvalId: string
      command: "APPROVE_ONCE" | "DENY"
    }
  | {
      kind: "COMMAND_FAILED"
      approvalId: string
      reason: string
    }

// ─── Shell Events ───────────────────────────────────────────────────

export type ApprovalShellEvent =
  | { kind: "SELECT"; approvalId: string; expectedVersion: number }
  | { kind: "OPEN_INSPECTOR" }
  | { kind: "CLOSE_INSPECTOR" }
  | { kind: "SUBMIT_APPROVE" }
  | { kind: "SUBMIT_DENY" }
  | { kind: "COMMAND_SUCCESS" }
  | { kind: "COMMAND_FAILED"; reason: string }
  | { kind: "DESELECT" }
  | { kind: "SESSION_CHANGED" }
  | { kind: "APPROVAL_DISAPPEARED" }

// ─── State Machine ──────────────────────────────────────────────────

export function reduceApprovalShellState(
  state: ApprovalShellState,
  event: ApprovalShellEvent,
): ApprovalShellState {
  switch (event.kind) {
    case "SELECT":
      return {
        kind: "SELECTED",
        approvalId: event.approvalId,
        expectedVersion: event.expectedVersion,
      }

    case "OPEN_INSPECTOR":
      if (state.kind === "SELECTED") {
        return {
          kind: "INSPECTING",
          approvalId: state.approvalId,
          expectedVersion: state.expectedVersion,
        }
      }
      return state

    case "CLOSE_INSPECTOR":
      if (state.kind === "INSPECTING") {
        return {
          kind: "SELECTED",
          approvalId: state.approvalId,
          expectedVersion: state.expectedVersion,
        }
      }
      return state

    case "SUBMIT_APPROVE":
      if (state.kind === "INSPECTING") {
        return {
          kind: "SUBMITTING",
          approvalId: state.approvalId,
          command: "APPROVE_ONCE",
        }
      }
      return state

    case "SUBMIT_DENY":
      if (state.kind === "INSPECTING") {
        return {
          kind: "SUBMITTING",
          approvalId: state.approvalId,
          command: "DENY",
        }
      }
      return state

    case "COMMAND_SUCCESS":
      // After success, return to IDLE. The shell should reload
      // from the durable event stream, not infer the next state.
      return { kind: "IDLE" }

    case "COMMAND_FAILED":
      if (state.kind === "SUBMITTING") {
        return {
          kind: "COMMAND_FAILED",
          approvalId: state.approvalId,
          reason: event.reason,
        }
      }
      return state

    case "DESELECT":
      if (state.kind === "SELECTED" || state.kind === "INSPECTING" || state.kind === "COMMAND_FAILED") {
        return { kind: "IDLE" }
      }
      return state

    case "SESSION_CHANGED":
      // Session change clears selection
      return { kind: "IDLE" }

    case "APPROVAL_DISAPPEARED":
      if (state.kind === "SELECTED" || state.kind === "INSPECTING" || state.kind === "COMMAND_FAILED") {
        return { kind: "IDLE" }
      }
      return state
  }
}

// ─── Actionability Check ────────────────────────────────────────────

/**
 * Check if the current shell state allows command submission.
 * Keys must be active only when:
 *   - The selected entry is an actionable pending approval
 *   - The current session owns the approval
 *   - No command is already submitting
 *   - The approval version shown is still current
 *   - The approval is not terminal
 */
export function canSubmitCommand(state: ApprovalShellState): boolean {
  return state.kind === "INSPECTING"
}

/**
 * Check if the inspector can be opened.
 */
export function canOpenInspector(state: ApprovalShellState): boolean {
  return state.kind === "SELECTED"
}

/**
 * Check if the selection can be cleared.
 */
export function canDeselect(state: ApprovalShellState): boolean {
  return state.kind === "SELECTED" || state.kind === "INSPECTING" || state.kind === "COMMAND_FAILED"
}
