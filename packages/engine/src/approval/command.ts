/**
 * RB-01 (Cluster B): operator command surface for the durable approval pipeline.
 *
 * Pure transport logic. Given a session id, an approval id and an operator
 * command body, build a RealApprovalOperatorService over the durable
 * SqliteApprovalStore (<workspace>/.arcana/approvals.db — workspace cwd is
 * derived by the caller from the session record and falls back to
 * process.cwd()), submit the command, and on success resolve the parked tool
 * call via notifyApprovalDecision so the PEP re-evaluates and executes
 * (APPROVE_ONCE) or the parked call fails closed with zero execution (DENY).
 *
 * The store, workspace scope, operator identity and the notify function are
 * injectable seams for unit tests; the HTTP layer (handlers/approval.ts)
 * supplies the production defaults.
 */

import {
  RealApprovalOperatorService,
  type OperatorCommandResponse,
} from "@arcana/core/crypto/approval-operator-service"
import { SqliteApprovalStore } from "@arcana/core/crypto/approval-store-sqlite"
import type {
  ApprovalLifecycleStore,
  ApprovalRecord,
  AuthenticatedOperator,
} from "@arcana/core/crypto/approval-lifecycle"
import { notifyApprovalDecision } from "@/session/tools"

// ─── Command body (matches the HTTP transport contract) ───────────────

export type ApprovalCommandKind = "APPROVE_ONCE" | "DENY"

export type ApprovalCommandBody = {
  command: ApprovalCommandKind
  expectedVersion: number
  expectedRequestHash: string
  expectedContractRevision: number
}

// ─── Store access ─────────────────────────────────────────────────────

const approvalStores = new Map<string, SqliteApprovalStore>()

export function approvalDbPath(workspaceCwd: string): string {
  return `${workspaceCwd}/.arcana/approvals.db`
}

export function approvalStoreForWorkspace(workspaceCwd: string): SqliteApprovalStore {
  const path = approvalDbPath(workspaceCwd)
  let store = approvalStores.get(path)
  if (!store) {
    store = new SqliteApprovalStore(path)
    approvalStores.set(path, store)
  }
  return store
}

/** Resolve the workspace cwd; falls back to process.cwd() when unavailable. */
export function resolveApprovalWorkspaceCwd(workspaceCwd?: string): string {
  return workspaceCwd ?? process.cwd()
}

// ─── Sync read: session approvals map ─────────────────────────────────

/**
 * Load every approval record belonging to a session as a
 * Record<approvalId, ApprovalRecord> — the snapshot shape the session sync
 * channel pushes to the TUI. Reads go through the durable
 * SqliteApprovalStore (load-by-session query over loadAllApprovals).
 */
export function loadSessionApprovals(sessionId: string, workspaceCwd?: string): Record<string, ApprovalRecord> {
  const store = approvalStoreForWorkspace(resolveApprovalWorkspaceCwd(workspaceCwd))
  const approvals: Record<string, ApprovalRecord> = {}
  for (const record of store.loadAllApprovals()) {
    if (record.sessionId === sessionId) approvals[record.approvalId] = record
  }
  return approvals
}

// ─── Command submission ───────────────────────────────────────────────

export type SubmitApprovalCommandInput = {
  sessionId: string
  approvalId: string
  command: ApprovalCommandBody
  /**
   * Workspace cwd used to derive the approvals db path. The HTTP layer
   * derives it from the session record; falls back to process.cwd().
   */
  workspaceCwd?: string
  /**
   * Workspace scope verified against the record. Engine-created records are
   * session-scoped (scoped-approval-adapter writes workspace_id = session_id),
   * so this defaults to the session id.
   */
  workspaceId?: string
  /** Authenticated operator identity; defaults to a minimal "operator" identity. */
  operator?: AuthenticatedOperator
  /** Test seam: the lifecycle store backing the operator service. */
  store?: ApprovalLifecycleStore
  /**
   * Test seam: parked-call resolver. Defaults to the real
   * notifyApprovalDecision from session/tools.ts (resolves the parked gate so
   * the PEP resumes execution, or fails the call closed on DENY).
   */
  notify?: (approvalId: string, approved: boolean) => boolean
}

export function submitApprovalCommand(input: SubmitApprovalCommandInput): OperatorCommandResponse {
  const { sessionId, approvalId, command } = input
  const store = input.store ?? approvalStoreForWorkspace(resolveApprovalWorkspaceCwd(input.workspaceCwd))
  const workspaceId = input.workspaceId ?? sessionId
  const operator: AuthenticatedOperator = input.operator ?? {
    operatorId: "operator",
    authenticatedAt: new Date().toISOString(),
    roles: ["operator"],
    workspaceScope: [workspaceId],
  }

  const service = new RealApprovalOperatorService(store, operator, sessionId, workspaceId)
  const response: OperatorCommandResponse = service.submitCommand({
    approvalId,
    command: command.command,
    expectedVersion: command.expectedVersion,
    expectedRequestHash: command.expectedRequestHash,
    expectedContractRevision: command.expectedContractRevision,
  })

  if (response.success) {
    const notify = input.notify ?? notifyApprovalDecision
    notify(approvalId, command.command === "APPROVE_ONCE")
  }

  return response
}
