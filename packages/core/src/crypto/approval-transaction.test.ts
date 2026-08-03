/**
 * Atomic lifecycle transition tests (ARC-REV-002).
 *
 * Approval state, execution state, and the authoritative outbox event must
 * commit or roll back together. Every simulated crash boundary is followed by
 * a store restart proving the database never exposes a state transition
 * without its corresponding event.
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  processApprovalCommand,
  type ApprovalRecord,
  type ApprovalTransition,
  type AuthenticatedOperator,
} from "./approval-lifecycle"
import {
  SqliteApprovalStore,
  type ApprovalTransitionStep,
} from "./approval-store-sqlite"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function pendingRecord(): ApprovalRecord {
  return {
    approvalId: "appr_tx_1",
    version: 1,
    sessionId: "sess-a",
    workspaceId: "workspace-a",
    requestHash: "hash-1",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
  }
}

function operator(): AuthenticatedOperator {
  return {
    operatorId: "op-a",
    authenticatedAt: NOW.toISOString(),
    roles: ["operator"],
    workspaceScope: ["workspace-a"],
  }
}

function claimTransition(overrides: Partial<ApprovalTransition> = {}): ApprovalTransition {
  return {
    approval: {
      ...pendingRecord(),
      version: 2,
      state: "CLAIMED",
      executionId: "exec-1",
      updatedAt: NOW.toISOString(),
    },
    execution: {
      executionId: "exec-1",
      approvalId: "appr_tx_1",
      approvalVersion: 2,
      requestHash: "hash-1",
      state: "CLAIMED",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
    event: {
      eventId: "evt-APPROVAL_CLAIMED-appr_tx_1-v2",
      approvalId: "appr_tx_1",
      kind: "APPROVAL_CLAIMED",
      timestamp: NOW.toISOString(),
      detail: { executionId: "exec-1", requestHash: "hash-1" },
      status: "PENDING",
    },
    expected: { version: 1, state: "PENDING" },
    ...overrides,
  }
}

function freshDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "approval-tx-"))
  return { dir, path: join(dir, "approvals.db") }
}

function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Temp directory; OS cleanup is acceptable.
  }
}

describe("SqliteApprovalStore.commitTransition atomicity", () => {
  test("claim transition commits approval, execution, and event together across restart", () => {
    const { dir, path } = freshDbPath()
    try {
      const store = new SqliteApprovalStore(path)
      // In production the lifecycle always persists the PENDING record before
      // any transition (existing-record-only invariant); the CAS guard then
      // requires the row to still be at the expected version/state.
      store.saveApproval(pendingRecord())
      store.commitTransition(claimTransition())
      store.close()

      const reopened = new SqliteApprovalStore(path)
      expect(reopened.loadApproval("appr_tx_1")?.state).toBe("CLAIMED")
      expect(reopened.loadApproval("appr_tx_1")?.version).toBe(2)
      expect(reopened.loadExecution("appr_tx_1")?.state).toBe("CLAIMED")
      expect(reopened.getPendingOutbox()).toHaveLength(1)
      expect(reopened.getPendingOutbox()[0]!.kind).toBe("APPROVAL_CLAIMED")
      reopened.close()
    } finally {
      cleanup(dir)
    }
  })

  const failurePoints: Array<{ step: ApprovalTransitionStep; label: string }> = [
    { step: "begin", label: "failure before approval write" },
    { step: "approval", label: "failure after approval write" },
    { step: "execution", label: "failure before execution write" },
    { step: "outbox", label: "failure before outbox insert" },
    { step: "commit", label: "failure at commit" },
  ]

  for (const { step, label } of failurePoints) {
    test(`${label} rolls back every record and survives restart`, () => {
      const { dir, path } = freshDbPath()
      try {
        const store = new SqliteApprovalStore(path, {
          onStep: (current) => {
            if (current === step) throw new Error(`injected failure at ${step}`)
          },
        })
        // Seed the pre-transition PENDING record exactly as the lifecycle does.
        store.saveApproval(pendingRecord())
        expect(() => store.commitTransition(claimTransition())).toThrow(`injected failure at ${step}`)

        // The still-open connection must not expose the transition: the
        // approval stays PENDING at version 1, no execution, no event.
        expect(store.loadApproval("appr_tx_1")!.state).toBe("PENDING")
        expect(store.loadApproval("appr_tx_1")!.version).toBe(1)
        expect(store.loadExecution("appr_tx_1")).toBeNull()
        expect(store.getPendingOutbox()).toHaveLength(0)
        store.close()

        // Restart: a fresh store on the same file sees no trace of the transition.
        const reopened = new SqliteApprovalStore(path)
        expect(reopened.loadApproval("appr_tx_1")!.state).toBe("PENDING")
        expect(reopened.loadApproval("appr_tx_1")!.version).toBe(1)
        expect(reopened.loadExecution("appr_tx_1")).toBeNull()
        expect(reopened.getPendingOutbox()).toHaveLength(0)
        reopened.close()
      } finally {
        cleanup(dir)
      }
    })
  }

  test("a failing store write propagates out of processApprovalCommand with zero persistence", () => {
    const { dir, path } = freshDbPath()
    try {
      const store = new SqliteApprovalStore(path, {
        onStep: (current) => {
          if (current === "commit") throw new Error("injected commit failure")
        },
      })
      store.saveApproval(pendingRecord())

      expect(() =>
        processApprovalCommand(
          {
            kind: "APPROVE",
            approvalId: "appr_tx_1",
            requestHash: "hash-1",
            contractRevision: 1,
            operatorId: "op-a",
            sessionId: "sess-a",
            workspaceId: "workspace-a",
          },
          store,
          operator(),
          NOW,
        ),
      ).toThrow("injected commit failure")

      // The approval is still PENDING at version 1: the APPROVED transition
      // never became visible, and no event exists.
      expect(store.loadApproval("appr_tx_1")!.state).toBe("PENDING")
      expect(store.loadApproval("appr_tx_1")!.version).toBe(1)
      expect(store.getPendingOutbox()).toHaveLength(0)
      store.close()

      const reopened = new SqliteApprovalStore(path)
      expect(reopened.loadApproval("appr_tx_1")!.state).toBe("PENDING")
      expect(reopened.getPendingOutbox()).toHaveLength(0)
      reopened.close()
    } finally {
      cleanup(dir)
    }
  })

  test("retrying the same transition is idempotent and never duplicates the event", () => {
    const { dir, path } = freshDbPath()
    try {
      const store = new SqliteApprovalStore(path)
      store.saveApproval(pendingRecord())
      store.commitTransition(claimTransition())
      // Same logical transition, same deterministic event identity. The CAS
      // guard treats the already-durable target version+state as an
      // idempotent replay (exactly one authoritative win).
      store.commitTransition(claimTransition())

      expect(store.loadApproval("appr_tx_1")!.version).toBe(2)
      expect(store.getPendingOutbox()).toHaveLength(1)
      expect(store.getPendingOutbox()[0]!.eventId).toBe("evt-APPROVAL_CLAIMED-appr_tx_1-v2")
      store.close()
    } finally {
      cleanup(dir)
    }
  })

  test("a conflicting second transition with the same base is refused (CAS), no duplicate event", () => {
    const { dir, path } = freshDbPath()
    try {
      const store = new SqliteApprovalStore(path)
      store.saveApproval(pendingRecord())
      store.commitTransition(claimTransition())

      // The persisted row is now CLAIMED/v2. A DIFFERENT transition that still
      // claims from the same expected base (PENDING/v1) must be refused as a
      // CAS miss — it would otherwise overwrite the authoritative event.
      expect(() =>
        store.commitTransition(
          claimTransition({
            approval: { ...claimTransition().approval, version: 3 },
            event: { ...claimTransition().event, eventId: "evt-APPROVAL_CLAIMED-appr_tx_1-v3" },
          }),
        ),
      ).toThrow(/CAS miss|ALREADY_DECIDED/)

      // Only the authoritative v2 event remains — the conflicting transition
      // never became visible and no v3 event exists.
      const events = store.getPendingOutbox()
      expect(events.map((event) => event.eventId)).toEqual(["evt-APPROVAL_CLAIMED-appr_tx_1-v2"])
      expect(store.loadApproval("appr_tx_1")!.version).toBe(2)
      store.close()
    } finally {
      cleanup(dir)
    }
  })
})
