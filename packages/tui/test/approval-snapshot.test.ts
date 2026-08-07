import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { resolveApprovalSnapshot, shortHash } from "../src/shell/command-spine/approval-snapshot"

const approval: ApprovalRecord = {
  approvalId: "appr_1",
  version: 1,
  sessionId: "sess_1",
  workspaceId: "ws_1",
  requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  contractRevision: 3,
  principalId: "codex/session-7",
  state: "PENDING",
  riskClass: "HIGH",
  route: "LOCAL_TUI",
  expiresAt: "2099-01-01T00:04:48.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  createdAt: "2026-08-02T00:00:00.000Z",
}

function event(id: string, type: string, requestHash: string, payload: Record<string, unknown>) {
  return {
    id,
    sequence: 1,
    sessionId: "sess_1",
    timestamp: "2026-08-02T00:00:00.000Z",
    previousHash: "p",
    hash: "h",
    actor: { kind: "policy" as const, id: "pep" },
    type,
    payload: { requestHash, ...payload },
  }
}

describe("approval snapshot resolution (PR6)", () => {
  test("correlates requested + approval_required events by requestHash", () => {
    const events = [
      event("req-1", "authorization.requested", approval.requestHash, {
        tool: "write_file",
        action: "filesystem.write",
        principalId: "codex/session-7",
      }),
      event("req-2", "authorization.approval_required", approval.requestHash, {
        decision: {
          policyVersion: "dev-secure@18",
          capabilityIds: ["workspace.write"],
          riskClass: "HIGH",
        },
      }),
    ]
    const snapshot = resolveApprovalSnapshot(approval, events as never)

    expect(snapshot.available).toBe(true)
    expect(snapshot.tool).toBe("write_file")
    expect(snapshot.action).toBe("filesystem.write")
    expect(snapshot.capability).toBe("workspace.write")
    expect(snapshot.principal).toBe("codex/session-7")
    expect(snapshot.policy).toBe("dev-secure@18")
    expect(snapshot.route).toBe("LOCAL_TUI")
    expect(snapshot.risk).toBe("HIGH")
  })

  test("fails closed when no governance event carries the request", () => {
    const snapshot = resolveApprovalSnapshot(approval, [])
    expect(snapshot.available).toBe(false)
    expect(snapshot.tool).toBeUndefined()
    expect(snapshot.capability).toBeUndefined()
    expect(snapshot.principal).toBe("codex/session-7") // durable record field
    expect(snapshot.change).toBeUndefined()
  })

  test("change summary derives only from real executed arguments", () => {
    const withArgs = resolveApprovalSnapshot(
      { ...approval, state: "CONSUMED", executionId: "exec-1" },
      [
        event("exec-1", "authorization.executed", approval.requestHash, {
          tool: "write_file",
          executionId: "exec-1",
          arguments: ["src/security/authorization.ts", "line1\nline2\nline3"],
        }),
      ] as never,
    )
    expect(withArgs.change).toContain("+3")
    expect(withArgs.executionId).toBe("exec-1")

    // PENDING approvals have no arguments yet — no invented change line.
    const pending = resolveApprovalSnapshot(approval, [])
    expect(pending.change).toBeUndefined()
  })

  test("shortHash keeps tails readable", () => {
    expect(shortHash("0123456789abcdef")).toBe("0123…cdef")
    expect(shortHash("short")).toBe("short")
    expect(shortHash(undefined)).toBe("unavailable")
  })
})
