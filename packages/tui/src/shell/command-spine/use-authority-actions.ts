import { createEffect, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { PermissionRequest } from "@arcana/sdk/v2"
import {
  approvalActionBindingsEnabled as approvalActionBindingsEnabledPolicy,
  approvalEscapeEnabled as approvalEscapeEnabledPolicy,
  approvalInspectionAllowed,
  isApprovalActionable,
  isApprovalTerminal,
} from "./approval-spine-adapter"
import type { ApprovalShellController } from "./approval-shell-controller"

/**
 * Authority actions for the spine: approval commands (approve/deny/revoke/
 * inspect) + submission state + the focused gate request + bindings-enabled
 * policies. Semantics are identical to the prior inline shell logic — this is
 * a pure extraction, no behavior change.
 */
export function useAuthorityActions(input: {
  focusedEntryID: Accessor<string | undefined>
  focusedApproval: Accessor<ApprovalRecord | undefined>
  approvals: Accessor<readonly ApprovalRecord[]>
  permissions: Accessor<readonly unknown[]>
  controller: Accessor<ApprovalShellController | undefined>
  activeSessionId: Accessor<string>
  activeWorkspaceId: Accessor<string>
  composerFocused: () => boolean
  gatesOpen: () => boolean
  /** Called to blur the composer before inspection. */
  onBlurComposer?: () => void
  /** Called with the live approval accessor when opening the inspector dialog. */
  onOpenInspector?: (liveApproval: Accessor<ApprovalRecord>) => void
  /** Called to clear the focused entry (Esc clears selection). */
  onClearFocus?: () => void
  setInspectorApprovalId: (id: string | undefined) => void
  inspectorApprovalId: Accessor<string | undefined>
}) {
  const [approvalSubmitting, setApprovalSubmitting] = createSignal(false)

  const activeSessionId = input.activeSessionId
  const activeWorkspaceId = input.activeWorkspaceId
  const controller = input.controller
  const approvals = input.approvals
  const focusedApproval = input.focusedApproval

  // M10: permission-gate rows open the read-only permission inspector.
  const focusedGateRequest = createMemo(() => {
    const fid = input.focusedEntryID()
    if (!fid || !fid.startsWith("permission:")) return undefined
    const requestID = fid.slice("permission:".length)
    return (input.permissions() as PermissionRequest[]).find((p) => p?.id === requestID)
  })

  const canApprove = createMemo(() => {
    const approval = focusedApproval()
    if (!approval) return false
    if (!isApprovalActionable(approval)) return false
    if (approval.sessionId !== activeSessionId()) return false
    if (approvalSubmitting()) return false
    return true
  })

  const canDeny = createMemo(() => canApprove())

  const canInspectApproval = createMemo(() => focusedApproval() !== undefined)

  const approvalActionBindingsEnabled = () =>
    approvalActionBindingsEnabledPolicy({
      composerFocused: input.composerFocused(),
      gatesOpen: input.gatesOpen(),
      submitting: approvalSubmitting(),
      focusedApproval: focusedApproval(),
    })

  const approvalInspectBindingsEnabled = () =>
    approvalInspectionAllowed({
      hasFocusedApproval: focusedApproval() !== undefined,
      composerFocused: input.composerFocused(),
      submitting: approvalSubmitting(),
    })

  const approvalEscapeEnabled = () =>
    approvalEscapeEnabledPolicy({
      gatesOpen: input.gatesOpen(),
      submitting: approvalSubmitting(),
      inspectorOpen: input.inspectorApprovalId() !== undefined,
      composerFocused: input.composerFocused(),
      focusedApproval: focusedApproval(),
    })

  const approveFocused = async () => {
    const approval = focusedApproval()
    const ctrl = controller()
    if (!approval || !ctrl || !canApprove()) return
    setApprovalSubmitting(true)
    try {
      await ctrl.approveOnce({
        approvalId: approval.approvalId,
        expectedVersion: approval.version,
        expectedRequestHash: approval.requestHash,
        expectedContractRevision: approval.contractRevision,
      })
    } finally {
      setApprovalSubmitting(false)
    }
  }

  const denyFocused = async () => {
    const approval = focusedApproval()
    const ctrl = controller()
    if (!approval || !ctrl || !canDeny()) return
    setApprovalSubmitting(true)
    try {
      await ctrl.deny({
        approvalId: approval.approvalId,
        expectedVersion: approval.version,
        expectedRequestHash: approval.requestHash,
        expectedContractRevision: approval.contractRevision,
      })
    } finally {
      setApprovalSubmitting(false)
    }
  }

  const inspectFocused = () => {
    const approval = focusedApproval()
    const ctrl = controller()
    if (!approval || !canInspectApproval()) return
    input.onBlurComposer?.()
    input.setInspectorApprovalId(approval.approvalId)
    ctrl?.inspect(approval.approvalId)
    // Render from the live approvals store so the inspector stays truthful.
    const liveApproval = () =>
      approvals().find((x) => x.approvalId === approval.approvalId) ?? approval
    input.onOpenInspector?.(liveApproval)
  }

  const closeInspectorOrClearSelection = () => {
    if (input.inspectorApprovalId()) {
      input.setInspectorApprovalId(undefined)
      const approval = focusedApproval()
      if (approval) controller()?.select(approval.approvalId)
      return
    }
    if (focusedApproval()) {
      input.onClearFocus?.()
      controller()?.clearSelection()
    }
  }

  // ─── Selection reconciliation ────────────────────────────────────
  // Clear selection when session/workspace changes.
  createEffect(() => {
    const sid = activeSessionId()
    const wid = activeWorkspaceId()
    const approval = focusedApproval()
    if (approval) {
      if (approval.sessionId !== sid || approval.workspaceId !== wid) {
        input.onClearFocus?.()
        input.setInspectorApprovalId(undefined)
      }
    }
  })

  // Clear inspector when approval becomes terminal (kept open read-only).
  createEffect(() => {
    const inspectorId = input.inspectorApprovalId()
    if (!inspectorId) return
    const approval = approvals().find(a => a.approvalId === inspectorId)
    if (!approval) {
      input.setInspectorApprovalId(undefined)
      return
    }
    if (isApprovalTerminal(approval)) {
      // Keep inspector open read-only; terminal state visible in inspector.
    }
  })

  // A parked durable approval keeps the turn BUSY while it waits.
  const hasPendingApproval = createMemo(() =>
    approvals().some(
      (a) => a.state === "PENDING" && a.sessionId === activeSessionId(),
    ),
  )

  return {
    approvalSubmitting,
    setApprovalSubmitting,
    focusedGateRequest,
    canApprove,
    canDeny,
    canInspectApproval,
    approvalActionBindingsEnabled,
    approvalInspectBindingsEnabled,
    approvalEscapeEnabled,
    approveFocused,
    denyFocused,
    inspectFocused,
    closeInspectorOrClearSelection,
    hasPendingApproval,
  }
}
