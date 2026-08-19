import { describe, expect, test } from "bun:test"
import { HttpApprovalOperatorService } from "../src/shell/command-spine/approval-http-bridge"

type FetchHandler = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function makeBridge(handler: FetchHandler, approvals: unknown[] = []) {
  const fetchImpl = ((url: RequestInfo | URL, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch
  return new HttpApprovalOperatorService({
    baseUrl: "http://runtime.test",
    fetch: fetchImpl,
    getSessionId: () => "sess-a",
    getWorkspaceId: () => "sess-a",
    getApprovals: () => approvals as never,
  })
}

describe("TUI approval HTTP bridge (same runtime service as the CLI/HTTP surface)", () => {
  test("approve posts to the engine session command endpoint with the exact-request revalidation fields", async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const bridge = makeBridge(async (url, init) => {
      captured = { url: String(url), init: init ?? {} }
      return new Response(
        JSON.stringify({
          success: true,
          approval: {
            approvalId: "appr_1",
            version: 2,
            sessionId: "sess-a",
            workspaceId: "sess-a",
            requestHash: "hash-1",
            contractRevision: 1,
            state: "APPROVED",
            approvedBy: "local-operator",
            expiresAt: "2099-01-01T00:00:00.000Z",
            updatedAt: "2026-08-02T00:00:00.000Z",
            createdAt: "2026-08-02T00:00:00.000Z",
          },
        }),
        { status: 200 },
      )
    })

    const result = await bridge.approveOnce({
      approvalId: "appr_1",
      expectedVersion: 1,
      expectedRequestHash: "hash-1",
      expectedContractRevision: 1,
    })

    expect(result.status).toBe("APPROVED")
    expect(captured!.url).toBe("http://runtime.test/api/session/sess-a/approval/appr_1/command")
    const body = JSON.parse(String(captured!.init.body)) as Record<string, unknown>
    expect(body).toEqual({
      command: "APPROVE_ONCE",
      expectedVersion: 1,
      expectedRequestHash: "hash-1",
      expectedContractRevision: 1,
    })
  })

  test("deny posts the DENY command to the same endpoint", async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const bridge = makeBridge(async (url, init) => {
      captured = { url: String(url), init: init ?? {} }
      return new Response(
        JSON.stringify({
          success: true,
          approval: {
            approvalId: "appr_1",
            version: 2,
            sessionId: "sess-a",
            workspaceId: "sess-a",
            requestHash: "hash-1",
            contractRevision: 1,
            state: "DENIED",
            expiresAt: "2099-01-01T00:00:00.000Z",
            updatedAt: "2026-08-02T00:00:00.000Z",
            createdAt: "2026-08-02T00:00:00.000Z",
          },
        }),
        { status: 200 },
      )
    })

    const result = await bridge.deny({
      approvalId: "appr_1",
      expectedVersion: 1,
      expectedRequestHash: "hash-1",
      expectedContractRevision: 1,
    })

    expect(result.status).toBe("DENIED")
    expect(JSON.parse(String(captured!.init.body))).toMatchObject({ command: "DENY" })
  })

  test("REVOKE is refused at the TUI surface (workspace-operator/Desktop command)", async () => {
    const bridge = makeBridge(async () => {
      throw new Error("fetch must not be called for REVOKE from the TUI")
    })

    const result = await bridge.submitCommand({
      approvalId: "appr_1",
      command: "REVOKE",
      expectedVersion: 1,
      expectedRequestHash: "hash-1",
      expectedContractRevision: 1,
    })

    expect(result.success).toBe(false)
    expect((result as { success: false; reason: string }).reason).toContain("not available from the TUI surface")
  })

  test("stale responses surface the reason without inventing success", async () => {
    const bridge = makeBridge(async () =>
      new Response(
        JSON.stringify({ success: false, reason: "request hash changed - STALE", stale: true }),
        { status: 200 },
      ),
    )

    const result = await bridge.approveOnce({
      approvalId: "appr_1",
      expectedVersion: 1,
      expectedRequestHash: "OLD-HASH",
      expectedContractRevision: 1,
    })
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("STALE")
  })

  test("a subagent approval is decided through its OWN session, never the active one", async () => {
    let captured: string | undefined
    const childRecord = {
      approvalId: "appr_child",
      version: 1,
      sessionId: "sess-child",
      parentSessionId: "sess-a",
      workspaceId: "sess-child",
      requestHash: "hash-child",
      contractRevision: 1,
      state: "PENDING",
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      createdAt: "2026-08-02T00:00:00.000Z",
    }
    const bridge = makeBridge(
      async (url) => {
        captured = String(url)
        return new Response(
          JSON.stringify({ success: true, approval: { ...childRecord, state: "APPROVED" } }),
          { status: 200 },
        )
      },
      [childRecord],
    )

    const result = await bridge.approveOnce({
      approvalId: "appr_child",
      expectedVersion: 1,
      expectedRequestHash: "hash-child",
      expectedContractRevision: 1,
    })

    expect(result.status).toBe("APPROVED")
    // The engine's session-scoped command handler refuses cross-session
    // access, so the child approval must go through the child session path.
    expect(captured).toBe("http://runtime.test/api/session/sess-child/approval/appr_child/command")
  })
})
