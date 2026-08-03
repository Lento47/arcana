import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { describe, expect, test } from "bun:test"
import { routingGate, type ApprovalDecisionSurface } from "../../src/approval/command"

function approval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId: "approval-1",
    version: 1,
    sessionId: "session-1",
    workspaceId: "workspace-1",
    requestHash: "request-hash",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  }
}

function gate(
  record: ApprovalRecord,
  surface: ApprovalDecisionSurface,
  desktopIsOnline: boolean,
) {
  return routingGate(record, "/workspace", surface, () => desktopIsOnline)
}

describe("approval routing gate", () => {
  test("legacy and LOCAL_TUI approvals reject Desktop decisions", () => {
    expect(gate(approval(), "LOCAL_TUI", true).allowed).toBe(true)
    expect(gate(approval(), "DESKTOP", true)).toEqual({
      allowed: false,
      reason: "approval requires the local TUI",
    })
  })

  test("DESKTOP_REQUIRED cannot be decided by the TUI even when Desktop is online", () => {
    const record = approval({ route: "DESKTOP_REQUIRED" })

    expect(gate(record, "LOCAL_TUI", true)).toEqual({
      allowed: false,
      reason: "approval requires the desktop surface",
    })
    expect(gate(record, "DESKTOP", true).allowed).toBe(true)
  })

  test("DESKTOP_REQUIRED fails closed when Desktop is offline", () => {
    const record = approval({ route: "DESKTOP_REQUIRED" })

    expect(gate(record, "DESKTOP", false)).toEqual({
      allowed: false,
      reason: "desktop required and offline",
    })
  })

  test("DESKTOP_PREFERRED routes to Desktop while online", () => {
    const record = approval({ route: "DESKTOP_PREFERRED", localFallbackAllowed: true })

    expect(gate(record, "DESKTOP", true).allowed).toBe(true)
    expect(gate(record, "LOCAL_TUI", true)).toEqual({
      allowed: false,
      reason: "approval routed to desktop",
    })
  })

  test("DESKTOP_PREFERRED permits only explicit offline fallback", () => {
    const fallback = approval({ route: "DESKTOP_PREFERRED", localFallbackAllowed: true })
    const noFallback = approval({ route: "DESKTOP_PREFERRED", localFallbackAllowed: false })

    expect(gate(fallback, "LOCAL_TUI", false).allowed).toBe(true)
    expect(gate(noFallback, "LOCAL_TUI", false)).toEqual({
      allowed: false,
      reason: "desktop fallback forbidden by policy",
    })
  })

  test("CENTRAL_REQUIRED rejects local and Desktop surfaces", () => {
    const record = approval({ route: "CENTRAL_REQUIRED" })

    expect(gate(record, "LOCAL_TUI", true).allowed).toBe(false)
    expect(gate(record, "DESKTOP", true).allowed).toBe(false)
    expect(gate(record, "CENTRAL", false).allowed).toBe(true)
  })
})
