/**
 * F11: SIEM export and admin-event store tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import type { AdminEvent } from "./admin-events"
import { SqliteAdminEventStore } from "./admin-events-sqlite"
import { siemCef, siemJsonLines, toCef } from "./siem-export"

function events(): AdminEvent[] {
  return [
    {
      kind: "approval.pending",
      tenantId: "tenant-a",
      approvalId: "appr-1",
      requestHash: "hash-1",
      at: "2026-08-02T12:00:00.000Z",
    },
    {
      kind: "node.revoked",
      tenantId: "tenant-a",
      nodeId: "node-1",
      reason: "compromised|urgent",
      at: "2026-08-02T12:05:00.000Z",
    },
    {
      kind: "policy.promoted",
      tenantId: "tenant-a",
      policyId: "policy-root",
      sequence: 2,
      at: "2026-08-02T12:10:00.000Z",
    },
    {
      kind: "alert.critical",
      tenantId: "tenant-a",
      alertId: "alert-1",
      at: "2026-08-02T12:15:00.000Z",
    },
  ]
}

describe("F11 SIEM export", () => {
  it("emits deterministic JSON lines", () => {
    const lines = siemJsonLines(events()).trim().split("\n")
    expect(lines).toHaveLength(4)
    expect(JSON.parse(lines[0])).toMatchObject({ kind: "approval.pending", approvalId: "appr-1" })
  })

  it("emits CEF headers and escapes pipe characters", () => {
    const cef = toCef(events()[1])
    expect(cef.startsWith("CEF:0|Arcana|Arcana|1.0|arcana/node/revoked|Node revoked|10|")).toBe(true)
    expect(cef).toContain("cs2=compromised\\|urgent")
    expect(cef).toContain("dtenant=tenant-a")
  })

  it("maps every canonical event kind to a CEF signature", () => {
    const exported = siemCef(events())
    expect(exported).toContain("arcana/approval/pending")
    expect(exported).toContain("arcana/policy/promoted")
    expect(exported).toContain("arcana/alert/critical")
  })
})

describe("F11 admin event store", () => {
  it("stores and lists events by kind and time window with tenant isolation", () => {
    const store = new SqliteAdminEventStore(new Database(":memory:"))
    for (const event of events()) {
      store.put({ ...event, recordedAt: event.at })
    }
    store.put({
      kind: "alert.critical",
      tenantId: "tenant-b",
      alertId: "alert-b",
      at: "2026-08-02T13:00:00.000Z",
      recordedAt: "2026-08-02T13:00:00.000Z",
    })

    expect(store.list("tenant-a", {})).toHaveLength(4)
    expect(store.list("tenant-a", { kind: "node.revoked" })).toHaveLength(1)
    expect(store.list("tenant-a", { since: "2026-08-02T12:10:00.000Z" })).toHaveLength(2)
    expect(store.list("tenant-b", {})).toHaveLength(1)
    const critical = store.list("tenant-a", { kind: "alert.critical" })[0]
    expect(critical?.kind).toBe("alert.critical")
    if (critical?.kind === "alert.critical") expect(critical.alertId).toBe("alert-1")
  })
})
