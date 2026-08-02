import { describe, expect, it } from "bun:test"
import { parseAdminEvent, serializeAdminEvent, type AdminEvent } from "./admin-events"

describe("F11 admin events", () => {
  it("round-trips canonical admin events", () => {
    const event: AdminEvent = {
      kind: "approval.pending",
      tenantId: "tenant-a",
      approvalId: "appr-1",
      requestHash: "hash-1",
      at: "2026-08-02T12:00:00.000Z",
    }
    expect(parseAdminEvent(serializeAdminEvent(event))).toEqual(event)
  })

  it("rejects malformed events", () => {
    expect(() => parseAdminEvent(JSON.stringify({ hello: 1 }))).toThrow()
    expect(() => parseAdminEvent("not json")).toThrow()
  })
})
