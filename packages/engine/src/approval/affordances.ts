import type { ApprovalRecord, AuthenticatedOperator } from "@arcana/core/crypto/approval-lifecycle"
import {
  deriveAuthorityAffordances,
  type AuthorityAffordance,
  type AuthoritySurface,
  type ViewedApprovalRequest,
} from "@arcana/core/crypto/authority-affordance"
import { desktopOnline } from "./desktop-subscribers"

export function affordancesForApproval(input: {
  approval: ApprovalRecord
  operator: AuthenticatedOperator
  surface: AuthoritySurface
  /** Authenticated workspace scope used for workspace/session isolation. */
  workspaceId: string
  /** Workspace key used by the advisory Desktop subscriber registry. */
  routingWorkspaceKey: string
  sessionRestriction?: string
  viewed?: ViewedApprovalRequest
}): AuthorityAffordance[] {
  return deriveAuthorityAffordances({
    approval: input.approval,
    operator: input.operator,
    surface: input.surface,
    workspaceId: input.workspaceId,
    sessionRestriction: input.sessionRestriction,
    viewed: input.viewed,
    freshness: "FRESH",
    connected: true,
    protocolCompatible: true,
    resyncRequired: false,
    desktopOnline: desktopOnline(input.routingWorkspaceKey),
  })
}
