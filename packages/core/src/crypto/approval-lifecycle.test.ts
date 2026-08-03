/**
 * Direct tests for the lower-level approval lifecycle processor.
 *
 * Invariant under test (ARC-REV-003): APPROVE can never fabricate the durable
 * approval record it is supposed to decide. Unknown approval ids must fail
 * with zero protected effects: no record, no execution, no outbox event.
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  InMemoryApprovalStore,
  processApprovalCommand,
  type ApprovalCommand,
  type ApprovalLifecycleStore,
  type ApprovalRecord,
  type AuthenticatedOperator,
} from "./approval-lifecycle"
import { SqliteApprovalStore } from "./approval-store-sqlite"
import { RealApprovalOperatorService } from "./approval-operator-service"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function operator(overrides: Partial<AuthenticatedOperator> = {}): AuthenticatedOperator {
  return {
    operatorId: "op-a",
    authenticatedAt: NOW.toISOString(),
    roles: ["operator"],
    workspaceScope: ["workspace-a"],
    ...overrides,
  }
}

function pendingRecord(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId: "appr_1",
    version: 1,
    sessionId: "sess-a",
    workspaceId: "workspace-a",
    requestHash: "hash-1",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    ...overrides,
  }
}

function approveCommand(approvalId = "appr_1"): ApprovalCommand {
  return {
    kind: "APPROVE",
    approvalId,
    requestHash: "hash-1",
    contractRevision: 1,
    operatorId: "op-a",
    sessionId: "sess-a",
    workspaceId: "workspace-a",
  }
}

function runApprove(store: ApprovalLifecycleStore, command: ApprovalCommand = approveCommand()) {
  return processApprovalCommand(command, store, operator(), NOW)
}

describe("processApprovalCommand existing-record invariant", () => {
  test("APPROVE of an unknown approval id creates nothing in the in-memory store", () => {
    const store = new InMemoryApprovalStore()
    const result = runApprove(store, approveCommand("appr_unknown"))

    expect(result.success).toBe(false)
    expect(result.reason).toBe("approval not found")
    expect(result.approval).toBeUndefined()
    expect(store.loadApproval("appr_unknown")).toBeNull()
    expect(store.loadExecution("appr_unknown")).toBeNull()
    expect(store.getOutboxEvents()).toHaveLength(0)
  })

  test("APPROVE of an unknown approval id creates nothing in the durable sqlite store", () => {
    const dir = mkdtempSync(join(tmpdir(), "approval-lifecycle-"))
    try {
      const store = new SqliteApprovalStore(join(dir, "approvals.db"))
      try {
        const result = runApprove(store, approveCommand("appr_unknown"))

        expect(result.success).toBe(false)
        expect(result.reason).toBe("approval not found")
        expect(store.loadApproval("appr_unknown")).toBeNull()
        expect(store.loadExecution("appr_unknown")).toBeNull()
        expect(store.getPendingOutbox()).toHaveLength(0)
      } finally {
        store.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("DENY, REVOKE, CLAIM, and CONSUME of an unknown id also fail closed", () => {
    const store = new InMemoryApprovalStore()
    const commands: ApprovalCommand[] = [
      { kind: "DENY", approvalId: "appr_unknown", operatorId: "op-a", sessionId: "sess-a", workspaceId: "workspace-a" },
      {
        kind: "REVOKE",
        approvalId: "appr_unknown",
        operatorId: "op-a",
        sessionId: "sess-a",
        workspaceId: "workspace-a",
      },
      { kind: "CLAIM", approvalId: "appr_unknown", executionId: "exec-1", requestHash: "hash-1" },
      { kind: "CONSUME", approvalId: "appr_unknown", executionId: "exec-1", effectReceiptHash: "receipt-1" },
    ]

    for (const command of commands) {
      const result = processApprovalCommand(command, store, operator(), NOW)
      expect(result.success).toBe(false)
      expect(result.reason).toBe("approval not found")
    }
    expect(store.getOutboxEvents()).toHaveLength(0)
    expect(store.loadExecution("appr_unknown")).toBeNull()
  })

  test("APPROVE of an existing PENDING record still transitions and emits exactly one outbox event", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord())

    const result = runApprove(store)

    expect(result.success).toBe(true)
    expect(result.approval?.state).toBe("APPROVED")
    expect(result.approval?.version).toBe(2)
    expect(result.approval?.approvedBy).toBe("op-a")
    const events = store.getOutboxEvents()
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe("APPROVAL_DECIDED")
    expect(events[0]!.detail).toMatchObject({ decision: "APPROVED", operatorId: "op-a", requestHash: "hash-1" })
  })

  test("APPROVE by an operator without workspace scope executes zero protected effects", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord())

    const result = processApprovalCommand(
      approveCommand(),
      store,
      operator({ operatorId: "op-b", workspaceScope: ["workspace-b"] }),
      NOW,
    )

    expect(result.success).toBe(false)
    expect(result.reason).toContain("not authorized")
    expect(store.loadApproval("appr_1")!.state).toBe("PENDING")
    expect(store.getOutboxEvents()).toHaveLength(0)
  })

  test("APPROVE of an expired record fails and records the expiry transition atomically", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord({ expiresAt: "2020-01-01T00:00:00.000Z" }))

    const result = runApprove(store)

    expect(result.success).toBe(false)
    expect(result.reason).toBe("approval expired")
    expect(store.loadApproval("appr_1")!.state).toBe("EXPIRED")
    const events = store.getOutboxEvents()
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe("APPROVAL_EXPIRED")
  })

  test("APPROVE of a non-PENDING record is refused as already decided", () => {
    const store = new InMemoryApprovalStore()
    store.saveApproval(pendingRecord({ state: "APPROVED", version: 2 }))

    const result = runApprove(store)

    expect(result.success).toBe(false)
    expect(result.reason).toContain("ALREADY_DECIDED")
    expect(store.loadApproval("appr_1")!.version).toBe(2)
    expect(store.getOutboxEvents()).toHaveLength(0)
  })

  test("RealApprovalOperatorService preserves the mounted guard for unknown ids", () => {
    const store = new InMemoryApprovalStore()
    const service = new RealApprovalOperatorService(store, operator(), "sess-a", "workspace-a")

    const response = service.submitCommand({
      approvalId: "appr_unknown",
      command: "APPROVE_ONCE",
      expectedVersion: 1,
      expectedRequestHash: "hash-1",
      expectedContractRevision: 1,
    })

    expect(response.success).toBe(false)
    if (response.success) throw new Error("expected approval not found")
    expect(response.reason).toBe("approval not found")
    expect(store.loadApproval("appr_unknown")).toBeNull()
    expect(store.getOutboxEvents()).toHaveLength(0)
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
