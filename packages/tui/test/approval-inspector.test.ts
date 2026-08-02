import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { approvalInspectorRows } from "../src/routes/session/approval-inspector"

const approval: ApprovalRecord = {
  approvalId: "appr_abcdef0123456789",
  version: 3,
  sessionId: "ses_0123456789abcdef0123456789abcdef",
  workspaceId: "ws_0123456789abcdef",
  requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  contractRevision: 2,
  principalId: "agent-default",
  state: "CLAIMED",
  approvedBy: "operator-test",
  executionId: "exe_0000000001",
  expiresAt: "2026-08-02T12:00:00.000Z",
  updatedAt: "2026-08-02T12:00:01.000Z",
  createdAt: "2026-08-02T11:59:00.000Z",
}

describe("approval inspector rows", () => {
  test("exposes every lifecycle field untruncated", () => {
    const rows = approvalInspectorRows(approval)
    const byLabel = new Map(rows)
    expect(byLabel.get("Approval ID")).toBe(approval.approvalId)
    expect(byLabel.get("Version")).toBe("3")
    expect(byLabel.get("State")).toBe("CLAIMED")
    expect(byLabel.get("Session ID")).toBe(approval.sessionId)
    expect(byLabel.get("Workspace ID")).toBe(approval.workspaceId)
    // Full 64-char hash — never Locale.truncate()d.
    expect(byLabel.get("Request hash")).toBe(approval.requestHash)
    expect(byLabel.get("Request hash")?.length).toBe(64)
    expect(byLabel.get("Contract revision")).toBe("2")
    expect(byLabel.get("Expires")).toBe(approval.expiresAt)
    expect(byLabel.get("Principal")).toBe("agent-default")
    expect(byLabel.get("Operator")).toBe("operator-test")
    expect(byLabel.get("Execution ID")).toBe("exe_0000000001")
    expect(byLabel.get("Created")).toBe(approval.createdAt)
    expect(byLabel.get("Updated")).toBe(approval.updatedAt)
  })

  test("omits optional rows that are absent", () => {
    const rows = approvalInspectorRows({ ...approval, principalId: undefined, approvedBy: undefined, executionId: undefined })
    const labels = rows.map(([label]) => label)
    expect(labels).not.toContain("Principal")
    expect(labels).not.toContain("Operator")
    expect(labels).not.toContain("Execution ID")
  })
})
