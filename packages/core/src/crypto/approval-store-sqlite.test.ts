import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { SqliteApprovalStore } from "./approval-store-sqlite"
import { SqliteScopedApprovalStore } from "./scoped-approval-adapter"
import type { ApprovalRecord } from "./approval-lifecycle"

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
