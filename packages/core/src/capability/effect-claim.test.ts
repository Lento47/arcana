// packages/core/src/capability/effect-claim.test.ts
// Authority Kernel K4 — durability kill-test matrix.
//
// Uses FILE-backed databases and MULTIPLE store instances to simulate real
// restarts: a claim written by instance A must be visible, transitionable,
// and reconcilable by instance B.

import { describe, expect, it, afterAll } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  SqliteEffectClaimStore,
  runProtectedRemoteEffect,
  reconcileClaim,
  listUnresolvedClaims,
  deriveIdempotencyKey,
  makeEffectId,
} from "./effect-claim"

const dir = join(import.meta.dir, ".tmp-effect-claim")
const DB = join(dir, "main.db")
function dbPath(n: string): string {
  mkdirSync(dir, { recursive: true })
  return join(dir, n)
}

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows file-lock lag — tmp dir is gitignored */
  }
})

describe("effect-claim (Authority Kernel K4)", () => {
  it("T1 settle happy path: CLAIMED → DISPATCHED → SETTLED with receipt", async () => {
    const effectId = makeEffectId()
    let dispatches = 0
    const outcome = await runProtectedRemoteEffect(DB, {
      toolName: "web_fetch",
      destination: "api.example.com",
      requestHash: "hash-t1",
      sessionId: "s-k4",
      existingEffectId: effectId,
      dispatch: async () => {
        dispatches++
        return { settled: true, receipt: "rcpt-t1" }
      },
    })
    expect(outcome.status).toBe("SETTLED")
    if (outcome.status === "SETTLED") expect(outcome.receipt).toBe("rcpt-t1")
    expect(dispatches).toBe(1)
  })

  it("T2 restart: settled claim survives; retry is DUPLICATE with zero re-dispatch", async () => {
    const effectId = makeEffectId()
    let dispatches = 0
    const first = await runProtectedRemoteEffect(DB, {
      toolName: "git_push",
      destination: "origin/main",
      requestHash: "hash-t2",
      sessionId: "s-k4",
      existingEffectId: effectId,
      dispatch: async () => {
        dispatches++
        return { settled: true, receipt: "pushed@abc123" }
      },
    })
    expect(first.status).toBe("SETTLED")

    // Fresh store instance — simulated process restart.
    const retry = await runProtectedRemoteEffect(DB, {
      toolName: "git_push",
      destination: "origin/main",
      requestHash: "hash-t2",
      sessionId: "s-k4",
      existingEffectId: effectId,
      dispatch: async () => {
        dispatches++
        return { settled: true, receipt: "again" }
      },
    })
    expect(retry.status).toBe("DUPLICATE")
    expect(dispatches).toBe(1)
  })

  it("T3 pre-dispatch failure lands FAILED (proven no effect)", async () => {
    const { PreDispatchError } = await import("./effect-claim")
    const outcome = await runProtectedRemoteEffect(DB, {
      toolName: "env_install",
      destination: "~/.arcana/sandbox",
      requestHash: "hash-t3",
      sessionId: "s-k4",
      dispatch: async () => {
        throw new PreDispatchError("package manager missing")
      },
    })
    expect(outcome.status).toBe("FAILED")
    if (outcome.status === "FAILED") expect(outcome.detail).toContain("package manager missing")
  })

  it("T4 post-send throw lands AMBIGUOUS — never silently retried", async () => {
    const outcome = await runProtectedRemoteEffect(DB, {
      toolName: "web_fetch",
      destination: "slow-host.example.com",
      requestHash: "hash-t4",
      sessionId: "s-k4",
      dispatch: async () => {
        throw new Error("connection reset after send")
      },
    })
    expect(outcome.status).toBe("AMBIGUOUS")
    if (outcome.status === "AMBIGUOUS") expect(outcome.effectId).toBeTruthy()
  })

  it("T5 reconciliation: downstream NOT_FOUND proves no effect → FAILED", async () => {
    const effectId = makeEffectId()
    await runProtectedRemoteEffect(DB, {
      toolName: "web_fetch",
      destination: "reconcile.example.com",
      requestHash: "hash-t5",
      sessionId: "s-k4",
      existingEffectId: effectId,
      dispatch: async () => {
        throw new Error("timeout after send") // ambiguous on purpose
      },
    })
    const reconciled = await reconcileClaim(DB, effectId, async () => ({ verdict: "NOT_FOUND" as const }))
    expect(reconciled.status).toBe("FAILED")
  })

  it("T6 reconciliation: downstream confirms SETTLED via idempotency key", async () => {
    const outcome = await runProtectedRemoteEffect(DB, {
      toolName: "speak",
      destination: "api.elevenlabs.io",
      requestHash: "hash-t6",
      sessionId: "s-k4",
      dispatch: async () => {
        throw new Error("response lost") // sent but unconfirmed
      },
    })
    expect(outcome.status).toBe("AMBIGUOUS")
    if (outcome.status !== "AMBIGUOUS") return
    // Reconciliation keys off the CLAIM's own idempotency key.
    const reconciled = await reconcileClaim(DB, outcome.effectId, async (k) =>
      k === outcome.idempotencyKey
        ? { verdict: "SETTLED" as const, receipt: "downstream-rcpt-777" }
        : { verdict: "UNKNOWN" as const },
    )
    expect(reconciled.status).toBe("SETTLED")
  })

  it("T7 unresolved queue surfaces AMBIGUOUS claims for operators", async () => {
    const outcome = await runProtectedRemoteEffect(DB, {
      toolName: "deploy",
      destination: "prod",
      requestHash: "hash-t7",
      sessionId: "s-k4",
      dispatch: async () => {
        throw new Error("blackhole")
      },
    })
    const queue = listUnresolvedClaims(DB)
    expect(queue.some((c) => c.effectId === outcome.effectId)).toBe(true)
  })

  it("T8 illegal transitions are rejected by the machine", () => {
    const store = new SqliteEffectClaimStore(dbPath("t8.db"))
    const effectId = makeEffectId()
    store.insertClaim({
      effectId,
      idempotencyKey: deriveIdempotencyKey(effectId, "t8"),
      requestHash: "t8",
      toolName: "shell",
      destination: null,
      principalId: "p",
      sessionId: "s",
      state: "SETTLED",
      receipt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    let rejected = false
    try {
      store.transition(effectId, "DISPATCHED")
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
  })

  it("T9 idempotency derivation is deterministic per logical operation", () => {
    const id = makeEffectId()
    expect(deriveIdempotencyKey(id, "h")).toBe(deriveIdempotencyKey(id, "h"))
    expect(deriveIdempotencyKey(id, "h")).not.toBe(deriveIdempotencyKey(makeEffectId(), "h"))
  })

  it("T10 file persistence: claim written by one instance is visible to another", () => {
    const p = dbPath("visibility.db")
    const a = new SqliteEffectClaimStore(p)
    const effectId = makeEffectId()
    a.insertClaim({
      effectId,
      idempotencyKey: deriveIdempotencyKey(effectId, "vis"),
      requestHash: "vis",
      toolName: "t",
      destination: null,
      principalId: "p",
      sessionId: "s",
      state: "CLAIMED",
      receipt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const b = new SqliteEffectClaimStore(p)
    expect(b.getClaim(effectId)?.state).toBe("CLAIMED")
  })
})
