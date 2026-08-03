import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { SqliteApprovalStore } from "./approval-store-sqlite"
import { SqliteScopedApprovalStore } from "./scoped-approval-adapter"
import { processApprovalCommand, type ApprovalRecord } from "./approval-lifecycle"

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcana-approval-store-"))
  return path.join(dir, ".arcana", "approvals.db")
}

function pending(approvalId: string, overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId,
    version: 1,
    sessionId: "sess-a",
    workspaceId: "ws-a",
    requestHash: "hash-a",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  }
}

describe("SqliteApprovalStore durability", () => {
  test("a PENDING approval survives a store close/reopen (daemon restart)", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    const first = new SqliteApprovalStore(dbPath)
    first.saveApproval(pending("appr_restart", { route: "DESKTOP_REQUIRED", routingPolicyVersion: "p1", riskClass: "CRITICAL" }))
    first.close()

    // Simulate the daemon restarting: a fresh store over the same file.
    const second = new SqliteApprovalStore(dbPath)
    const record = second.loadApproval("appr_restart")!
    expect(record.state).toBe("PENDING")
    expect(record.requestHash).toBe("hash-a")
    expect(record.route).toBe("DESKTOP_REQUIRED")
    expect(record.routingPolicyVersion).toBe("p1")
    expect(record.riskClass).toBe("CRITICAL")
    second.close()

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("the scoped PEP store and the lifecycle store converge on the same table", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    // Lifecycle store writes first, PEP store reads the same row (and vice
    // versa) — one approval implementation, one durable table.
    const lifecycle = new SqliteApprovalStore(dbPath)
    lifecycle.saveApproval(pending("appr_shared"))
    const scoped = new SqliteScopedApprovalStore(dbPath)
    const scopedRecord = Effect.runSync(scoped.getApprovalRecord("appr_shared"))
    expect(scopedRecord).toBeDefined()

    const viaScoped = Effect.runSync(scoped.getApproval("appr_shared"))
    expect(viaScoped).toBeDefined()
    expect(viaScoped!.decision).toBe("PENDING")

    // A record written through the PEP store is visible to the lifecycle store.
    Effect.runSync(
      scoped.putApproval({
        id: "appr_scoped",
        requestId: "appr_scoped",
        requestHash: "hash-b",
        principalId: "agent:main",
        sessionId: "sess-b",
        decision: "PENDING",
        actions: ["git.push"],
        resource: { kind: "git", path: "origin" },
        maxUses: 1,
        usesConsumed: 0,
        expiresAt: "2099-01-01T00:00:00.000Z",
        createdEventId: "evt-create",
      }),
    )
    expect(lifecycle.loadApproval("appr_scoped")!.state).toBe("PENDING")

    scoped.close()
    lifecycle.close()
    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })
})

describe("SqliteApprovalStore compare-and-swap (two connections, one file)", () => {
  const operator = {
    operatorId: "operator-a",
    authenticatedAt: "2026-08-02T12:00:00.000Z",
    roles: ["operator"] as const,
    workspaceScope: ["ws-a"],
  }
  const now = new Date("2026-08-02T12:00:00.000Z")

  function dbPathPair() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcana-approval-cas-"))
    const dbPath = path.join(dir, ".arcana", "approvals.db")
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    return { dir, dbPath }
  }

  function seedPending(store: SqliteApprovalStore, approvalId = "appr_cas") {
    store.saveApproval({
      approvalId,
      version: 1,
      sessionId: "sess-a",
      workspaceId: "ws-a",
      requestHash: "hash-a",
      contractRevision: 1,
      state: "PENDING",
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      createdAt: "2026-08-02T00:00:00.000Z",
    })
  }

  test("approve and deny racing from the same PENDING v1: exactly one wins, the other gets a deterministic CAS refusal", () => {
    const { dir, dbPath } = dbPathPair()
    try {
      const storeA = new SqliteApprovalStore(dbPath)
      const storeB = new SqliteApprovalStore(dbPath)
      seedPending(storeA)

      // Both connections read PENDING v1 before either transitions.
      const readA = storeA.loadApproval("appr_cas")!
      const readB = storeB.loadApproval("appr_cas")!
      expect(readA.state).toBe("PENDING")
      expect(readA.version).toBe(1)
      expect(readB.state).toBe("PENDING")
      expect(readB.version).toBe(1)

      // A approves (v1 PENDING -> v2 APPROVED).
      storeA.commitTransition({
        approval: {
          ...readA,
          version: 2,
          state: "APPROVED",
          approvedBy: operator.operatorId,
          updatedAt: now.toISOString(),
        },
        event: {
          eventId: "evt-APPROVAL_DECIDED-appr_cas-v2",
          approvalId: "appr_cas",
          kind: "APPROVAL_DECIDED",
          timestamp: now.toISOString(),
          detail: { decision: "APPROVED", operatorId: operator.operatorId },
          status: "PENDING",
        },
        expected: { version: 1, state: "PENDING" },
      })

      // B tries to deny from its stale PENDING v1 read: CAS must refuse
      // deterministically — the persisted row is no longer at v1/PENDING.
      expect(() =>
        storeB.commitTransition({
          approval: {
            ...readB,
            version: 2,
            state: "DENIED",
            approvedBy: operator.operatorId,
            updatedAt: now.toISOString(),
          },
          event: {
            eventId: "evt-APPROVAL_DECIDED-appr_cas-v2",
            approvalId: "appr_cas",
            kind: "APPROVAL_DECIDED",
            timestamp: now.toISOString(),
            detail: { decision: "DENIED", operatorId: operator.operatorId },
            status: "PENDING",
          },
          expected: { version: 1, state: "PENDING" },
        }),
      ).toThrow(/CAS miss|ALREADY_DECIDED/)

      // Final persisted state matches the single authoritative event: APPROVED.
      const final = storeA.loadApproval("appr_cas")!
      expect(final.state).toBe("APPROVED")
      expect(final.version).toBe(2)
      const outbox = storeA.getPendingOutbox()
      expect(outbox).toHaveLength(1)
      expect(outbox[0]!.kind).toBe("APPROVAL_DECIDED")
      expect(outbox[0]!.detail.decision).toBe("APPROVED")

      storeA.close()
      storeB.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test("an identical replay from a second connection is idempotent, not a conflict", () => {
    const { dir, dbPath } = dbPathPair()
    try {
      const storeA = new SqliteApprovalStore(dbPath)
      const storeB = new SqliteApprovalStore(dbPath)
      seedPending(storeA)

      const readA = storeA.loadApproval("appr_cas")!
      const readB = storeB.loadApproval("appr_cas")!

      const transition = {
        approval: { ...readA, version: 2, state: "APPROVED", approvedBy: operator.operatorId, updatedAt: now.toISOString() },
        event: {
          eventId: "evt-APPROVAL_DECIDED-appr_cas-v2",
          approvalId: "appr_cas",
          kind: "APPROVAL_DECIDED",
          timestamp: now.toISOString(),
          detail: { decision: "APPROVED", operatorId: operator.operatorId },
          status: "PENDING",
        },
        expected: { version: 1, state: "PENDING" },
      } as const

      // A wins; B replays the SAME logical transition (same target version and
      // state) — this is an idempotent retry, exactly one authoritative event.
      storeA.commitTransition(transition)
      expect(() => storeB.commitTransition(transition)).not.toThrow()

      expect(storeA.loadApproval("appr_cas")!.state).toBe("APPROVED")
      expect(storeA.getPendingOutbox()).toHaveLength(1)
      expect(storeA.getPendingOutbox()[0]!.detail.decision).toBe("APPROVED")

      storeA.close()
      storeB.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test("processApprovalCommand surfaces the deterministic refusal to the caller", () => {
    const { dir, dbPath } = dbPathPair()
    try {
      const storeA = new SqliteApprovalStore(dbPath)
      const storeB = new SqliteApprovalStore(dbPath)
      seedPending(storeA)

      const approve = {
        kind: "APPROVE" as const,
        approvalId: "appr_cas",
        requestHash: "hash-a",
        contractRevision: 1,
        operatorId: operator.operatorId,
        sessionId: "sess-a",
        workspaceId: "ws-a",
      }
      const deny = {
        kind: "DENY" as const,
        approvalId: "appr_cas",
        operatorId: operator.operatorId,
        sessionId: "sess-a",
        workspaceId: "ws-a",
      }

      // A approves successfully.
      expect(processApprovalCommand(approve, storeA, operator, now).success).toBe(true)

      // B's deny on the now-APPROVED record is refused deterministically and
      // persists nothing: state stays APPROVED, no second event.
      const result = processApprovalCommand(deny, storeB, operator, now)
      expect(result.success).toBe(false)
      expect(result.reason).toContain("ALREADY_DECIDED")
      expect(storeB.loadApproval("appr_cas")!.state).toBe("APPROVED")
      expect(storeB.loadApproval("appr_cas")!.version).toBe(2)
      expect(storeA.getPendingOutbox()).toHaveLength(1)

      storeA.close()
      storeB.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
