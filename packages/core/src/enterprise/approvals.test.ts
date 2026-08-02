/**
 * F5: central approval tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteCentralApprovalStore } from "./approvals-sqlite"
import {
  bulkDeny,
  decideApproval,
  emergencyRevokeApproval,
  expireDueApprovals,
  type CentralApprovalRecord,
} from "./approvals"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function record(overrides: Partial<CentralApprovalRecord> = {}): CentralApprovalRecord {
  return {
    tenantId: "tenant-a",
    approvalId: "appr-1",
    requestHash: "hash-1",
    requesterId: "u-requester",
    status: "PENDING",
    exactRequestJson: JSON.stringify({ requestHash: "hash-1" }),
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

describe("F5 central approvals", () => {
  it("requires exact request inspection and an approver distinct from the requester", () => {
    const store = new SqliteCentralApprovalStore(new Database(":memory:"))
    store.put(record())

    const selfApprove = decideApproval(store.get("tenant-a", "appr-1")!, {
      actorUserId: "u-requester",
      decision: { decision: "APPROVE" },
      now: NOW,
    }, store)
    expect(selfApprove).toMatchObject({ kind: "REJECTED" })

    const mismatch = decideApproval(store.get("tenant-a", "appr-1")!, {
      actorUserId: "u-admin",
      decision: { decision: "APPROVE" },
      inspectedRequestJson: JSON.stringify({ requestHash: "hash-2" }),
      now: NOW,
    }, store)
    expect(mismatch).toMatchObject({ kind: "REJECTED" })
    expect(store.get("tenant-a", "appr-1")?.status).toBe("PENDING")

    const approved = decideApproval(store.get("tenant-a", "appr-1")!, {
      actorUserId: "u-admin",
      decision: { decision: "APPROVE" },
      inspectedRequestJson: JSON.stringify({ requestHash: "hash-1" }),
      now: NOW,
    }, store)
    expect(approved.kind).toBe("DECIDED")
    if (approved.kind === "DECIDED") expect(approved.record.status).toBe("APPROVED")
  })

  it("expires pending approvals and denies bulk only", () => {
    const store = new SqliteCentralApprovalStore(new Database(":memory:"))
    store.put(record({ approvalId: "appr-1", expiresAt: new Date(NOW.getTime() - 1000).toISOString() }))
    store.put(record({ approvalId: "appr-2" }))
    store.put(record({ approvalId: "appr-3" }))

    expect(expireDueApprovals("tenant-a", store, NOW)).toBe(1)
    expect(store.get("tenant-a", "appr-1")?.status).toBe("EXPIRED")

    const bulk = bulkDeny("tenant-a", ["appr-2", "appr-3"], "u-admin", store, NOW)
    expect(bulk.denied).toBe(2)
    expect(store.get("tenant-a", "appr-2")?.status).toBe("REJECTED")
    expect(store.get("tenant-a", "appr-3")?.status).toBe("REJECTED")
  })

  it("emergency revocation blocks an approved but unconsumed approval", () => {
    const store = new SqliteCentralApprovalStore(new Database(":memory:"))
    store.put(record({ status: "APPROVED", approverId: "u-admin" }))
    const revoked = emergencyRevokeApproval("tenant-a", "appr-1", "u-owner", store, NOW)
    expect(revoked.kind).toBe("DECIDED")
    expect(store.get("tenant-a", "appr-1")?.status).toBe("REJECTED")

    store.put(record({ approvalId: "appr-2", status: "CONSUMED" }))
    expect(emergencyRevokeApproval("tenant-a", "appr-2", "u-owner", store, NOW)).toMatchObject({
      kind: "REJECTED",
    })
  })

  it("isolates queues per tenant", () => {
    const store = new SqliteCentralApprovalStore(new Database(":memory:"))
    store.put(record({ tenantId: "tenant-a" }))
    store.put(record({ tenantId: "tenant-b", approvalId: "appr-b" }))
    expect(store.list("tenant-a", "PENDING").map((r) => r.approvalId)).toEqual(["appr-1"])
    expect(store.list("tenant-b", "PENDING").map((r) => r.approvalId)).toEqual(["appr-b"])
    expect(store.all("tenant-a").map((r) => r.approvalId)).toEqual(["appr-1"])
    expect(store.all("tenant-b").map((r) => r.approvalId)).toEqual(["appr-b"])
  })
})
