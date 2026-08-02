/**
 * D-6: distributed replay resistance / exactly-once coordination tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { SqliteExecutionLedger } from "./execution-ledger-sqlite"
import {
  claimExecution,
  completeExecution,
  markUnknownAfterNetwork,
  type DistributedExecutionKey,
  type ExecutionLedger,
} from "./execution-ledger"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function key(overrides: Partial<DistributedExecutionKey> = {}): DistributedExecutionKey {
  return {
    executionId: "exec-1",
    nodeId: "node-alpha",
    sessionId: "ses-1",
    requestHash: "hash-1",
    grantId: "grant-1",
    nonce: "nonce-1",
    ...overrides,
  }
}

function ledger(): ExecutionLedger {
  return new SqliteExecutionLedger(new Database(":memory:"))
}

describe("D-6 exactly-once coordination", () => {
  it("claims once and reports later attempts as DUPLICATE on the same node", () => {
    const l = ledger()
    const first = claimExecution(key(), l, NOW)
    expect(first.kind).toBe("CLAIMED")
    completeExecution("exec-1", l, JSON.stringify({ ok: true }), NOW)

    const retry = claimExecution(key(), l, NOW)
    expect(retry.kind).toBe("DUPLICATE")
    if (retry.kind !== "DUPLICATE") return
    expect(retry.record.status).toBe("COMPLETED")
    expect(retry.record.effectOutcomeJson).toBe(JSON.stringify({ ok: true }))
  })

  it("prevents a second node from executing the same execution (cross-node matrix)", () => {
    const shared = ledger()
    const nodeA = claimExecution(key({ nodeId: "node-alpha" }), shared, NOW)
    expect(nodeA.kind).toBe("CLAIMED")

    const nodeB = claimExecution(key({ nodeId: "node-beta" }), shared, NOW)
    expect(nodeB.kind).toBe("DUPLICATE")
    if (nodeB.kind !== "DUPLICATE") return
    expect(nodeB.detail).toContain("already claimed")
    expect(shared.get("exec-1")?.key.nodeId).toBe("node-alpha")
  })

  it("rejects the same executionId with a different requestHash (CONFLICT)", () => {
    const l = ledger()
    expect(claimExecution(key(), l, NOW).kind).toBe("CLAIMED")
    const conflict = claimExecution(key({ requestHash: "hash-2" }), l, NOW)
    expect(conflict.kind).toBe("CONFLICT")
  })

  it("rejects the same executionId with a different grant (CONFLICT)", () => {
    const l = ledger()
    expect(claimExecution(key(), l, NOW).kind).toBe("CLAIMED")
    const conflict = claimExecution(key({ grantId: "grant-2" }), l, NOW)
    expect(conflict.kind).toBe("CONFLICT")
  })

  it("network retry cannot bypass usage limits", () => {
    const l = ledger()
    let grantUsesRemaining = 1

    const first = claimExecution(key(), l, NOW)
    expect(first.kind).toBe("CLAIMED")
    grantUsesRemaining -= 1 // atomic use claim consumes the grant use once
    completeExecution("exec-1", l, JSON.stringify({ ok: true }), NOW)

    // Retry arrives after a network ambiguity; the ledger already recorded a
    // terminal outcome, so no second execution and no second use.
    const retry = claimExecution(key(), l, NOW)
    expect(retry.kind).toBe("DUPLICATE")
    expect(grantUsesRemaining).toBe(0)
  })

  it("forbids automatic replay of irreversible effects after network ambiguity", () => {
    const l = ledger()
    expect(claimExecution(key(), l, NOW).kind).toBe("CLAIMED")
    markUnknownAfterNetwork("exec-1", l, NOW)

    const replay = claimExecution(key(), l, NOW, { irreversible: true })
    expect(replay.kind).toBe("REPLAY_FORBIDDEN")
  })

  it("persists across restart and stays exactly-once", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-exec-ledger-"))
    try {
      const dbPath = join(dir, "exec.db")
      const db1 = new Database(dbPath)
      const l1 = new SqliteExecutionLedger(db1)
      expect(claimExecution(key(), l1, NOW).kind).toBe("CLAIMED")
      completeExecution("exec-1", l1, JSON.stringify({ ok: true }), NOW)
      db1.close()

      const db2 = new Database(dbPath)
      const l2 = new SqliteExecutionLedger(db2)
      expect(l2.get("exec-1")?.status).toBe("COMPLETED")
      const replay = claimExecution(key(), l2, NOW)
      expect(replay.kind).toBe("DUPLICATE")
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
