/**
 * F5: Central approval operations.
 *
 * Tenant-scoped approval queue with exact request inspection, separation of
 * requester/approver, expiry, bulk denial (never bulk approval), and
 * emergency revocation of an approved-but-unconsumed approval. The central
 * queue can never bypass the local PEP: it only records decisions; local
 * enforcement consumes approvals by exact request hash.
 */

export type CentralApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "CLAIMED"
  | "CONSUMED"
  | "EXPIRED"
  | "REJECTED"

export type CentralApprovalRecord = {
  tenantId: string
  approvalId: string
  requestHash: string
  requesterId: string
  approverId?: string
  status: CentralApprovalStatus
  exactRequestJson: string
  createdAt: string
  expiresAt: string
  decidedAt?: string
}

export interface CentralApprovalStore {
  put(record: CentralApprovalRecord): void
  get(tenantId: string, approvalId: string): CentralApprovalRecord | undefined
  list(tenantId: string, status: CentralApprovalStatus): CentralApprovalRecord[]
  all(tenantId: string): CentralApprovalRecord[]
  updateStatus(tenantId: string, approvalId: string, status: CentralApprovalStatus, decidedAt: string): void
}

export type ApprovalDecision =
  | { decision: "APPROVE" }
  | { decision: "DENY" }

export type ApprovalDecisionResult =
  | { kind: "DECIDED"; record: CentralApprovalRecord }
  | { kind: "REJECTED"; reason: string }

export function decideApproval(
  record: CentralApprovalRecord,
  input: {
    actorUserId: string
    decision: ApprovalDecision
    inspectedRequestJson?: string
    now: Date
  },
  store: CentralApprovalStore,
): ApprovalDecisionResult {
  if (record.requesterId === input.actorUserId) {
    return { kind: "REJECTED", reason: "separation of duties: requester cannot decide their own approval" }
  }
  if (record.status !== "PENDING") {
    return { kind: "REJECTED", reason: `approval is ${record.status}, not PENDING` }
  }
  if (new Date(record.expiresAt).getTime() <= input.now.getTime()) {
    store.updateStatus(record.tenantId, record.approvalId, "EXPIRED", input.now.toISOString())
    return { kind: "REJECTED", reason: "approval expired before decision" }
  }
  if (input.inspectedRequestJson !== undefined && input.inspectedRequestJson !== record.exactRequestJson) {
    return { kind: "REJECTED", reason: "inspected request does not match the exact request hash" }
  }

  const status: CentralApprovalStatus = input.decision.decision === "APPROVE" ? "APPROVED" : "REJECTED"
  store.updateStatus(record.tenantId, record.approvalId, status, input.now.toISOString())
  const updated = store.get(record.tenantId, record.approvalId)!
  return { kind: "DECIDED", record: updated }
}

export function expireDueApprovals(tenantId: string, store: CentralApprovalStore, now: Date): number {
  let expired = 0
  for (const record of store.list(tenantId, "PENDING")) {
    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      store.updateStatus(tenantId, record.approvalId, "EXPIRED", now.toISOString())
      expired++
    }
  }
  return expired
}

/**
 * Bulk operations: denial only. There is deliberately NO bulk-approve API.
 */
export function bulkDeny(
  tenantId: string,
  approvalIds: readonly string[],
  actorUserId: string,
  store: CentralApprovalStore,
  now: Date,
): { denied: number; skipped: number } {
  let denied = 0
  let skipped = 0
  for (const approvalId of approvalIds) {
    const record = store.get(tenantId, approvalId)
    if (!record || record.status !== "PENDING" || record.requesterId === actorUserId) {
      skipped++
      continue
    }
    store.updateStatus(tenantId, approvalId, "REJECTED", now.toISOString())
    denied++
  }
  return { denied, skipped }
}

/**
 * Emergency revocation: an APPROVED (not yet consumed) approval is revoked
 * so the local PEP can never claim it.
 */
export function emergencyRevokeApproval(
  tenantId: string,
  approvalId: string,
  actorUserId: string,
  store: CentralApprovalStore,
  now: Date,
): ApprovalDecisionResult {
  const record = store.get(tenantId, approvalId)
  if (!record) return { kind: "REJECTED", reason: "approval not found" }
  if (record.status === "CONSUMED") {
    return { kind: "REJECTED", reason: "approval already consumed; effect cannot be un-executed" }
  }
  if (record.status !== "APPROVED" && record.status !== "PENDING" && record.status !== "CLAIMED") {
    return { kind: "REJECTED", reason: `approval is ${record.status}` }
  }
  store.updateStatus(tenantId, approvalId, "REJECTED", now.toISOString())
  const updated = store.get(tenantId, approvalId)!
  return { kind: "DECIDED", record: updated }
}
