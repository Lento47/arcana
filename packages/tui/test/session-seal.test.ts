import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { sessionSeal } from "../src/routes/session/session-commands"

function approval(state: ApprovalRecord["state"]): ApprovalRecord {
  return {
    approvalId: `appr_${state}_${Math.random()}`,
    version: 1,
    sessionId: "ses_seal",
    workspaceId: "ws_seal",
    requestHash: "hash",
    contractRevision: 1,
    state,
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
  }
}

describe("session seal (the /seal receipt)", () => {
  test("tallies tools, approvals, tokens and cost in one readable block", () => {
    const seal = sessionSeal({
      title: "govern the loader",
      sessionID: "ses_abc",
      cost: 0.4242,
      toolOutcomes: ["ok", "ok", "ok", "failed", "live"],
      approvals: [approval("APPROVED"), approval("DENIED"), approval("DENIED"), approval("EXPIRED")],
      tokens: 128_400,
    })

    expect(seal).toContain("SEAL · govern the loader")
    expect(seal).toContain("tools · 3 ok · 1 failed · 1 live")
    expect(seal).toContain("approvals · 1 approved · 2 denied · 1 expired")
    expect(seal).toContain("tokens · 128.4K · cost $0.42")
    expect(seal).toContain("session · ses_abc")
  })

  test("a quiet session seals as such — no invented rows", () => {
    const seal = sessionSeal({
      sessionID: "ses_quiet",
      cost: 0,
      toolOutcomes: [],
      approvals: [],
      tokens: 0,
    })

    expect(seal).toContain("SEAL · ses_quiet")
    expect(seal).toContain("tools · 0 ok · 0 failed")
    expect(seal).toContain("approvals · none")
    expect(seal).not.toContain("live")
  })
})
