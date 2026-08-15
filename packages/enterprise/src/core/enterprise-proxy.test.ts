/**
 * F5: console api proxy forwarding tests.
 *
 * Covers the /api/enterprise/* forwarding added to the console API route:
 * method/header/query preservation, engine error propagation, local-handler
 * fallthrough, and fail-closed behavior (502/503, never a silent empty 200).
 */

import { afterEach, describe, expect, it } from "bun:test"
import { app } from "../api-app"
import {
  ENGINE_BASE_URL_DEFAULT,
  ENGINE_BASE_URL_ENV,
  forwardToEngine,
  resolveEngineBaseURL,
} from "./enterprise-proxy"

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const realFetch = globalThis.fetch
const originalEnv = process.env[ENGINE_BASE_URL_ENV]

function installFetch(impl: FetchImpl) {
  globalThis.fetch = impl as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  if (originalEnv === undefined) delete process.env[ENGINE_BASE_URL_ENV]
  else process.env[ENGINE_BASE_URL_ENV] = originalEnv
})

describe("resolveEngineBaseURL", () => {
  it("returns the documented default when the env var is missing", () => {
    expect(resolveEngineBaseURL({})).toBe(ENGINE_BASE_URL_DEFAULT)
  })

  it("returns the configured engine base URL when set", () => {
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "https://engine.example.com" })).toBe(
      "https://engine.example.com",
    )
  })

  it("falls back to the default for empty or whitespace-only values", () => {
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "" })).toBe(ENGINE_BASE_URL_DEFAULT)
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "   " })).toBe(ENGINE_BASE_URL_DEFAULT)
  })
})

describe("forwardToEngine", () => {
  it("forwards method, query string, and authorization header", async () => {
    const seen: Array<{ url: string; method: string; auth: string | null }> = []
    installFetch(async (input, init) => {
      seen.push({
        url: String(input),
        method: init?.method ?? "GET",
        auth: new Headers(init?.headers).get("authorization"),
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-engine": "yes" },
      })
    })

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/tenant-a/approvals?status=PENDING", {
        method: "GET",
        headers: { authorization: "Bearer tok-123" },
      }),
      "http://engine.local",
    )

    expect(seen).toEqual([
      {
        url: "http://engine.local/api/enterprise/organizations/tenant-a/approvals?status=PENDING",
        method: "GET",
        auth: "Bearer tok-123",
      },
    ])
    expect(res.status).toBe(200)
    expect(res.headers.get("x-engine")).toBe("yes")
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
  })

  it("forwards POST body and content-type", async () => {
    let seenBody = ""
    installFetch(async (_input, init) => {
      seenBody = await new Response(init?.body).text()
      return new Response(JSON.stringify({ escalated: true, reason: "wait" }), { status: 200 })
    })

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/escalations/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId: "appr-1", now: "2026-08-12T00:00:00Z" }),
      }),
      "http://engine.local",
    )

    expect(seenBody).toBe(JSON.stringify({ approvalId: "appr-1", now: "2026-08-12T00:00:00Z" }))
    expect(res.status).toBe(200)
    expect((await res.json()) as { escalated: boolean; reason: string }).toEqual({
      escalated: true,
      reason: "wait",
    })
  })

  it("propagates engine 404 responses as-is", async () => {
    installFetch(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }))

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/nope/approvals"),
      "http://engine.local",
    )
    expect(res.status).toBe(404)
    expect((await res.json()) as { error: string }).toEqual({ error: "not_found" })
  })

  it("propagates engine 5xx responses as-is", async () => {
    installFetch(async () => new Response(JSON.stringify({ error: "engine_busy" }), { status: 503 }))

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/approvals"),
      "http://engine.local",
    )
    expect(res.status).toBe(503)
    expect((await res.json()) as { error: string }).toEqual({ error: "engine_busy" })
  })

  it("fails closed with 502 JSON when the engine is unreachable", async () => {
    installFetch(async () => {
      throw new Error("ECONNREFUSED")
    })

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/approvals"),
      "http://engine.local",
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; engine: string }
    expect(body.error).toBe("engine_unreachable")
    expect(body.engine).toBe("http://engine.local")
  })

  it("fails closed with 503 JSON when no base URL is resolvable", async () => {
    installFetch(async () => {
      throw new Error("must not be called")
    })

    const res = await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/approvals"),
      "",
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("engine_base_url_not_configured")
  })
})

describe("console api route forwarding", () => {
  it("forwards /api/enterprise/* through the app with method, headers, and query preserved", async () => {
    process.env[ENGINE_BASE_URL_ENV] = "http://engine.test"
    const seen: Array<{ url: string; method: string; auth: string | null }> = []
    installFetch(async (input, init) => {
      seen.push({
        url: String(input),
        method: init?.method ?? "GET",
        auth: new Headers(init?.headers).get("authorization"),
      })
      return new Response(JSON.stringify([{ approvalId: "appr-1", status: "PENDING" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await app.fetch(
      new Request("http://console/api/enterprise/organizations/tenant-a/approvals?status=PENDING", {
        method: "GET",
        headers: { authorization: "Bearer tok-456" },
      }),
    )

    expect(seen).toEqual([
      {
        url: "http://engine.test/api/enterprise/organizations/tenant-a/approvals?status=PENDING",
        method: "GET",
        auth: "Bearer tok-456",
      },
    ])
    expect(res.status).toBe(200)
    expect((await res.json()) as Array<{ approvalId: string; status: string }>).toEqual([
      { approvalId: "appr-1", status: "PENDING" },
    ])
  })

  it("returns 502 JSON through the app when the engine is unreachable", async () => {
    process.env[ENGINE_BASE_URL_ENV] = "http://engine.test"
    installFetch(async () => {
      throw new Error("fetch failed")
    })

    const res = await app.fetch(
      new Request("http://console/api/enterprise/organizations/tenant-a/approvals"),
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; engine: string }
    expect(body.error).toBe("engine_unreachable")
    expect(body.engine).toBe("http://engine.test")
  })

  it("keeps non-enterprise paths on the local handlers without calling fetch", async () => {
    installFetch(async () => {
      throw new Error("fetch must not be called for local paths")
    })

    const share = await app.fetch(
      new Request("http://console/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionID: "session-local-1" }),
      }),
    )
    expect(share.status).toBe(200)
    const shareBody = (await share.json()) as { id: string; secret: string }
    expect(shareBody.id).toBe("test_" + "session-local-1".slice(-8))
    expect(shareBody.secret).toBeDefined()
  })
})
