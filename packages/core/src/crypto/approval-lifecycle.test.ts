import { describe, expect, test } from "bun:test"
import {
  InMemoryApprovalStore,
  processApprovalCommand,
  type ApprovalCommand,
  type AuthenticatedOperator,
} from "./approval-lifecycle"

const operator: AuthenticatedOperator = {
  operatorId: "operator-a",
  authenticatedAt: "2026-08-02T00:00:00.000Z",
  roles: ["operator"],
  workspaceScope: ["ws-a"],
}

const now = new Date("2026-08-02T12:00:00.000Z")

function approveCommand(approvalId: string): ApprovalCommand {
  return {
    kind: "APPROVE",
    approvalId,
    requestHash: "req-hash-1",
    contractRevision: 1,
    operatorId: operator.operatorId,
    sessionId: "sess-a",
    workspaceId: "ws-a",
  }
}

function denyCommand(approvalId: string): ApprovalCommand {
  return {
    kind: "DENY",
    approvalId,
    operatorId: operator.operatorId,
    sessionId: "sess-a",
    workspaceId: "ws-a",
  }
}

function revokeCommand(approvalId: string): ApprovalCommand {
  return {
    kind: "REVOKE",
    approvalId,
    operatorId: operator.operatorId,
    sessionId: "sess-a",
    workspaceId: "ws-a",
  }
}

function claimCommand(approvalId: string, executionId = "exec-1", requestHash = "req-hash-1"): ApprovalCommand {
  return {
    kind: "CLAIM",
    approvalId,
    executionId,
    requestHash,
  }
}

function consumeCommand(approvalId: string, executionId = "exec-1"): ApprovalCommand {
  return {
    kind: "CONSUME",
    approvalId,
    executionId,
    effectReceiptHash: "receipt-1",
  }
}

describe("durable approval lifecycle (PENDING → APPROVED → CLAIMED → CONSUMED)", () => {
  test("approve requires PENDING and records the authenticated operator", () => {
    const store = new InMemoryApprovalStore()
    const created = processApprovalCommand(approveCommand("a1"), store, operator, now)
    expect(created.success).toBe(true)

    const approved = processApprovalCommand(approveCommand("a1"), store, operator, now)
    expect(approved.success).toBe(false)
    expect(approved.reason).toContain("ALREADY_DECIDED")
    expect(store.loadApproval("a1")!.approvedBy).toBe("operator-a")
  })

  test("full lifecycle: approve → claim → consume, then duplicate consume fails", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)

    const claim = processApprovalCommand(claimCommand("a1"), store, operator, now)
    expect(claim.success).toBe(true)
    expect(claim.execution?.state).toBe("CLAIMED")
    expect(store.loadApproval("a1")!.state).toBe("CLAIMED")

    const consume = processApprovalCommand(consumeCommand("a1"), store, operator, now)
    expect(consume.success).toBe(true)
    expect(store.loadApproval("a1")!.state).toBe("CONSUMED")
    expect(store.loadExecution("a1")!.state).toBe("SUCCEEDED")

    const duplicateConsume = processApprovalCommand(consumeCommand("a1"), store, operator, now)
    expect(duplicateConsume.success).toBe(false)
    expect(duplicateConsume.reason).toContain("not CLAIMED")
  })

  test("claim fails when the request hash changed after approval", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)

    const claim = processApprovalCommand(claimCommand("a1", "exec-1", "CHANGED-HASH"), store, operator, now)
    expect(claim.success).toBe(false)
    expect(claim.reason).toBe("request changed after approval — STALE")
    expect(store.loadApproval("a1")!.state).toBe("APPROVED")
  })

  test("claim fails when the approval expired before claim", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
    const later = new Date(now.getTime() + 10 * 60 * 1000)
    const claim = processApprovalCommand(claimCommand("a1"), store, operator, later)
    expect(claim.success).toBe(false)
    expect(store.loadApproval("a1")!.state).toBe("EXPIRED")
  })

  test("deny fails the approval closed", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
    const pending = store.loadApproval("a1")!
    store.saveApproval({ ...pending, state: "PENDING", version: 1, approvedBy: undefined })
    const denied = processApprovalCommand(denyCommand("a1"), store, operator, now)
    expect(denied.success).toBe(true)
    expect(store.loadApproval("a1")!.state).toBe("DENIED")
    // A denied approval can never be claimed.
    expect(processApprovalCommand(claimCommand("a1"), store, operator, now).success).toBe(false)
  })

  test("REVOKE invalidates PENDING and APPROVED approvals with zero execution path", () => {
    for (const state of ["PENDING", "APPROVED"] as const) {
      const store = new InMemoryApprovalStore()
      if (state === "PENDING") {
        // Create the record via an initial approve so the store has it.
        expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
        // Put it back to PENDING to test the PENDING path.
        const pending = store.loadApproval("a1")!
        store.saveApproval({ ...pending, state: "PENDING", version: 1, approvedBy: undefined })
      } else {
        expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
      }

      const revoked = processApprovalCommand(revokeCommand("a1"), store, operator, now)
      expect(revoked.success).toBe(true)
      const record = store.loadApproval("a1")!
      expect(record.state).toBe("INVALIDATED")
      expect(record.revokedBy).toBe("operator-a")
      // Zero execution path: a revoked approval cannot be claimed.
      expect(processApprovalCommand(claimCommand("a1"), store, operator, now).success).toBe(false)
    }
  })

  test("REVOKE refuses claimed, consumed, and denied approvals", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
    expect(processApprovalCommand(claimCommand("a1"), store, operator, now).success).toBe(true)
    const revoked = processApprovalCommand(revokeCommand("a1"), store, operator, now)
    expect(revoked.success).toBe(false)
    expect(revoked.reason).toContain("not PENDING or APPROVED")
    expect(store.loadApproval("a1")!.state).toBe("CLAIMED")
  })

  test("operator workspace scope is enforced for every decision", () => {
    const store = new InMemoryApprovalStore()
    const foreignOperator: AuthenticatedOperator = {
      operatorId: "operator-b",
      authenticatedAt: now.toISOString(),
      roles: ["operator"],
      workspaceScope: ["ws-other"],
    }
    expect(processApprovalCommand(approveCommand("a1"), store, foreignOperator, now).success).toBe(false)
    expect(processApprovalCommand(denyCommand("a1"), store, foreignOperator, now).success).toBe(false)
    expect(processApprovalCommand(revokeCommand("a1"), store, foreignOperator, now).success).toBe(false)
  })

  test("approve on an expired PENDING record transitions to EXPIRED", () => {
    const store = new InMemoryApprovalStore()
    expect(processApprovalCommand(approveCommand("a1"), store, operator, now).success).toBe(true)
    const pending = store.loadApproval("a1")!
    store.saveApproval({ ...pending, state: "PENDING", version: 1, expiresAt: new Date(now.getTime() - 1000).toISOString() })

    const result = processApprovalCommand(approveCommand("a1"), store, operator, now)
    expect(result.success).toBe(false)
    expect(store.loadApproval("a1")!.state).toBe("EXPIRED")
  })
})

describe("deterministic outbox event identity", () => {
  test("identical replays produce identical event ids without wall-clock randomness", () => {
    const storeA = new InMemoryApprovalStore()
    storeA.saveApproval(pendingRecord())
    const storeB = new InMemoryApprovalStore()
    storeB.saveApproval(pendingRecord())

    const resultA = processApprovalCommand(approveCommand(), storeA, operator(), NOW)
    const resultB = processApprovalCommand(approveCommand(), storeB, operator(), NOW)
    expect(resultA.success).toBe(true)
    expect(resultB.success).toBe(true)

    const eventA = storeA.getOutboxEvents()[0]!
    const eventB = storeB.getOutboxEvents()[0]!
    expect(eventA.eventId).toBe(eventB.eventId)
    expect(eventA.eventId).toBe("evt-APPROVAL_DECIDED-appr_1-v2")
    expect(eventA.eventId).toMatch(/^evt-[A-Z_]+-[a-z0-9_-]+-v\d+$/)
    expect(eventA.eventId).not.toMatch(/\d{13}/)
  })

  test("a retried APPROVE transition cannot duplicate the event", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord())

    expect(runApprove(store).success).toBe(true)
    const second = runApprove(store)
    expect(second.success).toBe(false)
    expect(store.getOutboxEvents()).toHaveLength(1)
  })

  test("different transition kinds produce distinct identities at the same version", () => {
    const approveStore = new InMemoryApprovalStore()
    approveStore.saveApproval(pendingRecord())
    runApprove(approveStore)

    const revokeStore = new InMemoryApprovalStore()
    revokeStore.saveApproval(pendingRecord())
    processApprovalCommand(
      {
        kind: "REVOKE",
        approvalId: "appr_1",
        operatorId: "op-a",
        sessionId: "sess-a",
        workspaceId: "workspace-a",
      },
      revokeStore,
      operator(),
      NOW,
    )

    expect(approveStore.getOutboxEvents()[0]!.eventId).toBe("evt-APPROVAL_DECIDED-appr_1-v2")
    expect(revokeStore.getOutboxEvents()[0]!.eventId).toBe("evt-APPROVAL_REVOKED-appr_1-v2")
    expect(approveStore.getOutboxEvents()[0]!.eventId).not.toBe(revokeStore.getOutboxEvents()[0]!.eventId)
  })

  test("expiry bumps the version so the expired transition has a unique identity", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord({ expiresAt: "2020-01-01T00:00:00.000Z" }))

    const result = runApprove(store)
    expect(result.success).toBe(false)
    expect(store.loadApproval("appr_1")!.version).toBe(2)
    expect(store.getOutboxEvents()[0]!.eventId).toBe("evt-APPROVAL_EXPIRED-appr_1-v2")
  })
})
