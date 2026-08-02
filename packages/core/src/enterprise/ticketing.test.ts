/**
 * F11: ticketing payload tests.
 */

import { describe, expect, it } from "bun:test"
import type { AdminEvent } from "./admin-events"
import { toTicketPayload } from "./ticketing"

const events: AdminEvent[] = [
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
    reason: "compromised",
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

describe("F11 ticketing payloads", () => {
  it("maps every admin event kind to a deterministic ticket payload", () => {
    const tickets = events.map(toTicketPayload)
    expect(tickets[0]).toMatchObject({ title: "Approval pending: appr-1", priority: "medium" })
    expect(tickets[1]).toMatchObject({ title: "Node revoked: node-1", priority: "urgent" })
    expect(tickets[2]).toMatchObject({ title: "Policy promoted: policy-root #2", priority: "low" })
    expect(tickets[3]).toMatchObject({ title: "Critical alert: alert-1", priority: "urgent" })
    expect(tickets[1]?.labels).toContain("incident")
  })
})
