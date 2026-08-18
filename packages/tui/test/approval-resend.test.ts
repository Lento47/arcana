import { describe, expect, test } from "bun:test"
import { resendApproval } from "../src/util/approval-resend"

const url = "http://engine.local"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function stubFetch(responder: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    return responder(String(input), init)
  }) as typeof fetch
}

describe("resendApproval", () => {
  test("POSTs the resend endpoint for the session-scoped approval", async () => {
    let seen: { url: string; method: string | undefined } | undefined
    const fetchImpl = stubFetch((input, init) => {
      seen = { url: input, method: init?.method }
      return jsonResponse({ success: true, resendAt: "2026-08-17T00:00:00.000Z", desktopOnline: true })
    })
    const outcome = await resendApproval({
      baseUrl: url,
      fetchImpl,
      sessionID: "ses-1",
      approvalID: "appr-1",
    })
    expect(seen).toEqual({
      url: "http://engine.local/api/session/ses-1/approval/appr-1/resend",
      method: "POST",
    })
    expect(outcome).toEqual({ ok: true, resendAt: "2026-08-17T00:00:00.000Z", desktopOnline: true })
  })

  test("surfaces desktopOnline so offline re-sends are visible", async () => {
    const fetchImpl = stubFetch(() => jsonResponse({ success: true, resendAt: "", desktopOnline: false }))
    const outcome = await resendApproval({ baseUrl: url, fetchImpl, sessionID: "ses-1", approvalID: "a" })
    expect(outcome).toEqual({ ok: true, resendAt: "", desktopOnline: false })
  })

  test("passes through the engine reason for settled approvals", async () => {
    const fetchImpl = stubFetch(() =>
      jsonResponse({ success: false, reason: "approval is consumed, nothing to re-send" }),
    )
    const outcome = await resendApproval({ baseUrl: url, fetchImpl, sessionID: "ses-1", approvalID: "a" })
    expect(outcome).toEqual({ ok: false, reason: "approval is consumed, nothing to re-send" })
  })

  test("404 maps to not found", async () => {
    const fetchImpl = stubFetch(() => new Response("", { status: 404 }))
    const outcome = await resendApproval({ baseUrl: url, fetchImpl, sessionID: "ses-1", approvalID: "gone" })
    expect(outcome).toEqual({ ok: false, reason: "approval not found" })
  })

  test("network failure maps to engine unreachable", async () => {
    const fetchImpl = stubFetch(() => {
      throw new Error("fetch failed")
    })
    const outcome = await resendApproval({ baseUrl: url, fetchImpl, sessionID: "ses-1", approvalID: "a" })
    expect(outcome).toEqual({ ok: false, reason: "engine unreachable" })
  })
})
