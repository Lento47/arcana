/**
 * F5: escalation console view-mapping and truncation tests.
 */

import { describe, expect, it } from "bun:test"

function truncate(str: string, len: number) {
  if (!str) return ""
  return str.length > len ? str.slice(0, len) + "..." : str
}

function formatDate(iso: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function mapApprovalView(a: {
  approvalId: string
  status: string
  requesterId: string
  requestHash: string
  createdAt: string
  expiresAt: string
  decidedAt?: string
}) {
  return {
    id: a.approvalId,
    status: a.status,
    requester: a.requesterId,
    requestHash: truncate(a.requestHash, 20),
    createdAt: formatDate(a.createdAt),
    expiresAt: formatDate(a.expiresAt),
    decidedAt: a.decidedAt ? formatDate(a.decidedAt) : undefined,
  }
}

function filterApprovals(
  approvals: { status: string }[],
  status: string,
) {
  if (!status) return approvals
  return approvals.filter((a) => a.status === status)
}

describe("F5 escalation console view mapping", () => {
  it("maps an approval record to its view fields", () => {
    const a = {
      approvalId: "appr-1",
      status: "PENDING",
      requesterId: "u-requester",
      requestHash: "abc123def456ghi789jkl012mno345pqr678stu901",
      createdAt: "2026-08-02T10:00:00.000Z",
      expiresAt: "2026-08-02T12:00:00.000Z",
    }
    const view = mapApprovalView(a)
    expect(view.id).toBe("appr-1")
    expect(view.status).toBe("PENDING")
    expect(view.requester).toBe("u-requester")
    expect(view.requestHash).toBe("abc123def456ghi789jk...")
    expect(view.decidedAt).toBeUndefined()
  })

  it("truncates long hashes with an ellipsis", () => {
    expect(truncate("short", 20)).toBe("short")
    expect(truncate("abc123def456ghi789jkl012mno345pqr678stu901", 20)).toBe(
      "abc123def456ghi789jk...",
    )
    expect(truncate("", 20)).toBe("")
  })

  it("formats dates from ISO strings", () => {
    const d = formatDate("2026-08-02T10:00:00.000Z")
    expect(typeof d).toBe("string")
    expect(d.length).toBeGreaterThan(0)
  })

  it("returns empty string for missing dates", () => {
    expect(formatDate("")).toBe("")
    expect(formatDate(undefined as unknown as string)).toBe("")
  })

  it("filters approvals by status", () => {
    const list = [
      { status: "PENDING" },
      { status: "APPROVED" },
      { status: "PENDING" },
      { status: "DENIED" },
    ]
    expect(filterApprovals(list, "PENDING")).toHaveLength(2)
    expect(filterApprovals(list, "APPROVED")).toHaveLength(1)
    expect(filterApprovals(list, "DENIED")).toHaveLength(1)
  })

  it("returns all approvals when no status filter is given", () => {
    const list = [
      { status: "PENDING" },
      { status: "APPROVED" },
    ]
    expect(filterApprovals(list, "")).toHaveLength(2)
  })
})