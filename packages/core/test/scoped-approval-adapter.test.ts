import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { Effect } from "effect"
import { SqliteScopedApprovalStore } from "../src/crypto/scoped-approval-adapter"
import type { ScopedApproval } from "../src/capability/scoped-approval"

function makeApproval(overrides: Partial<ScopedApproval> = {}): ScopedApproval {
  return {
    id: "appr_test_1",
    requestId: "appr_test_1",
    requestHash: "hash-abc-123",
    principalId: "agent:default",
    sessionId: "sess-1",
    decision: "PENDING",
    actions: [{ type: "shell", pattern: "echo *" }] as unknown as ScopedApproval["actions"],
    resource: { kind: "file", path: "/tmp/x" },
    maxUses: 1,
    usesConsumed: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdEventId: "evt-1",
    ...overrides,
  }
}

function run<T>(effect: Effect.Effect<T, unknown, never>): T {
  return Effect.runSync(effect) as T
}

describe("SqliteScopedApprovalStore (RB-01 adapter)", () => {
  const dirs: string[] = []
  const stores: SqliteScopedApprovalStore[] = []

  function freshStore(): SqliteScopedApprovalStore {
    const dir = mkdtempSync(join(tmpdir(), "scoped-approval-"))
    dirs.push(dir)
    const store = new SqliteScopedApprovalStore(join(dir, "approvals.db"))
    stores.push(store)
    return store
  }

  afterAll(() => {
    for (const s of stores) s.close()
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        // WAL/-shm handles can linger briefly on Windows; temp dir, OS cleans up.
      }
    }
  })

  test("put + get round-trips a PENDING approval", () => {
    const store = freshStore()
    const approval = makeApproval()
    run(store.putApproval(approval))
    const loaded = run(store.getApproval(approval.id))
    expect(loaded).toBeDefined()
    expect(loaded!.id).toBe("appr_test_1")
    expect(loaded!.requestHash).toBe("hash-abc-123")
    expect(loaded!.decision).toBe("PENDING")
    expect(loaded!.principalId).toBe("agent:default")
    expect(loaded!.sessionId).toBe("sess-1")
    expect(loaded!.maxUses).toBe(1)
    expect(loaded!.usesConsumed).toBe(0)
  })

  test("getApprovalForRequest finds by request hash", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval()))
    const loaded = run(store.getApprovalForRequest("hash-abc-123"))
    expect(loaded?.id).toBe("appr_test_1")
    expect(run(store.getApprovalForRequest("missing"))).toBeUndefined()
  })

  test("allApprovals feeds the PDP snapshot with only valid states", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval({ id: "a1", decision: "PENDING" })))
    run(store.putApproval(makeApproval({ id: "a2", requestHash: "h2", decision: "APPROVED" })))
    run(store.putApproval(makeApproval({ id: "a3", requestHash: "h3", decision: "CONSUMED", usesConsumed: 1 })))
    const all = run(store.allApprovals())
    expect(all).toHaveLength(3)
    // The snapshot filter (grant-store.ts) keeps only APPROVED + unused + unexpired.
    const valid = all.filter((a) => a.decision === "APPROVED" && a.usesConsumed < 1)
    expect(valid.map((a) => a.id)).toEqual(["a2"])
  })

  test("atomicClaim succeeds exactly once for an APPROVED approval", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval({ decision: "APPROVED" })))
    const first = run(store.atomicClaim("appr_test_1", "exec-1", "evt-claim", new Date().toISOString()))
    expect(first?.decision).toBe("CLAIMED")
    expect(first?.claimExecutionId).toBe("exec-1")
    const second = run(store.atomicClaim("appr_test_1", "exec-2", "evt-claim-2", new Date().toISOString()))
    expect(second).toBeNull()
  })

  test("atomicClaim refuses PENDING, DENIED, and CONSUMED approvals", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval({ id: "p1", decision: "PENDING" })))
    run(store.putApproval(makeApproval({ id: "d1", requestHash: "hd", decision: "REJECTED" })))
    run(store.putApproval(makeApproval({ id: "c1", requestHash: "hc", decision: "CONSUMED", usesConsumed: 1 })))
    expect(run(store.atomicClaim("p1", "e", "evt", new Date().toISOString()))).toBeNull()
    expect(run(store.atomicClaim("d1", "e", "evt", new Date().toISOString()))).toBeNull()
    expect(run(store.atomicClaim("c1", "e", "evt", new Date().toISOString()))).toBeNull()
  })

  test("updateApproval consumes a claimed approval (PEP consume path)", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval({ decision: "APPROVED" })))
    const claimed = run(store.atomicClaim("appr_test_1", "exec-1", "evt", new Date().toISOString()))
    expect(claimed?.decision).toBe("CLAIMED")
    run(
      store.updateApproval("appr_test_1", {
        decision: "CONSUMED",
        usesConsumed: 1,
        consumedEventId: "evt-consume",
      }),
    )
    const consumed = run(store.getApproval("appr_test_1"))
    expect(consumed?.decision).toBe("CONSUMED")
    expect(consumed?.usesConsumed).toBe(1)
  })

  test("state mapping: DENIED -> REJECTED, INVALIDATED -> RECOVERY_REQUIRED", () => {
    const store = freshStore()
    run(store.putApproval(makeApproval({ id: "r1", requestHash: "hr", decision: "REJECTED" })))
    run(store.putApproval(makeApproval({ id: "r2", requestHash: "hr2", decision: "RECOVERY_REQUIRED" })))
    expect(run(store.getApproval("r1"))?.decision).toBe("REJECTED")
    expect(run(store.getApproval("r2"))?.decision).toBe("RECOVERY_REQUIRED")
  })

  test("durable across store instances (same file, WAL)", () => {
    const dir = mkdtempSync(join(tmpdir(), "scoped-approval-durable-"))
    dirs.push(dir)
    const path = join(dir, "approvals.db")
    const store1 = new SqliteScopedApprovalStore(path)
    run(store1.putApproval(makeApproval({ decision: "APPROVED" })))
    store1.close()
    const store2 = new SqliteScopedApprovalStore(path)
    const loaded = run(store2.getApproval("appr_test_1"))
    store2.close()
    expect(loaded?.decision).toBe("APPROVED")
  })
})
