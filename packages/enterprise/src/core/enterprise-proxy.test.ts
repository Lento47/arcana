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
  CONSOLE_ORIGIN_ENV,
  ENGINE_BASE_URL_DEFAULT,
  ENGINE_BASE_URL_ENV,
  forwardToEngine,
  resolveEngineBaseURL,
  shouldForwardCookie,
} from "./enterprise-proxy"

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const realFetch = globalThis.fetch
const originalEnv = process.env[ENGINE_BASE_URL_ENV]
const originalNodeEnv = process.env.NODE_ENV
const originalAllowLocal = process.env.ARCANA_ENGINE_ALLOW_LOCAL

function installFetch(impl: FetchImpl) {
  globalThis.fetch = impl as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  if (originalEnv === undefined) delete process.env[ENGINE_BASE_URL_ENV]
  else process.env[ENGINE_BASE_URL_ENV] = originalEnv
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalAllowLocal === undefined) delete process.env.ARCANA_ENGINE_ALLOW_LOCAL
  else process.env.ARCANA_ENGINE_ALLOW_LOCAL = originalAllowLocal
})

describe("resolveEngineBaseURL", () => {
  it("fails closed when the env var is missing outside local development", () => {
    expect(resolveEngineBaseURL({})).toBe("")
    expect(resolveEngineBaseURL({ NODE_ENV: "production" })).toBe("")
  })

  it("returns the configured engine base URL when set", () => {
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "https://engine.example.com" })).toBe(
      "https://engine.example.com",
    )
  })

  it("uses localhost only in explicit development or when local default is allowed", () => {
    expect(resolveEngineBaseURL({ NODE_ENV: "development" })).toBe(ENGINE_BASE_URL_DEFAULT)
    expect(resolveEngineBaseURL({ ARCANA_ENGINE_ALLOW_LOCAL: "1" })).toBe(ENGINE_BASE_URL_DEFAULT)
  })

  it("fails closed for empty or whitespace-only values outside development", () => {
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "" })).toBe("")
    expect(resolveEngineBaseURL({ [ENGINE_BASE_URL_ENV]: "   " })).toBe("")
  })
})

describe("shouldForwardCookie", () => {
  it("forwards cookies with no Origin (same-origin)", () => {
    expect(shouldForwardCookie(null, {})).toBe(true)
  })

  it("does not forward cookies from an unknown Origin", () => {
    expect(shouldForwardCookie("https://evil.example", {})).toBe(false)
  })

  it("forwards cookies only from the allowlisted console origin", () => {
    expect(
      shouldForwardCookie("https://console.example", { [CONSOLE_ORIGIN_ENV]: "https://console.example" }),
    ).toBe(true)
    expect(
      shouldForwardCookie("https://evil.example", { [CONSOLE_ORIGIN_ENV]: "https://console.example" }),
    ).toBe(false)
  })
})

describe("forwardToEngine", () => {
  it("does not forward Cookie from a foreign Origin", async () => {
    let cookie: string | null = "unset"
    installFetch(async (_input, init) => {
      cookie = new Headers(init?.headers).get("cookie")
      return new Response("{}", { status: 200 })
    })
    await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/approvals", {
        headers: { origin: "https://evil.example", cookie: "sid=abc" },
      }),
      "http://engine.local",
      {},
    )
    expect(cookie).toBeNull()
  })

  it("forwards workspace directory headers with the request", async () => {
    let seen: Record<string, string | null> = {}
    installFetch(async (_input, init) => {
      const headers = new Headers(init?.headers)
      seen = {
        directory: headers.get("x-opencode-directory"),
        workspace: headers.get("x-arcana-workspace"),
      }
      return new Response("{}", { status: 200 })
    })

    await forwardToEngine(
      new Request("http://console/api/enterprise/organizations/t/approvals", {
        headers: {
          "x-opencode-directory": "/work/proj",
          "x-arcana-workspace": "ws-1",
        },
      }),
      "http://engine.local",
    )

    expect(seen).toEqual({ directory: "/work/proj", workspace: "ws-1" })
  })

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

  it("returns 503 through the app when the engine base URL is not configured", async () => {
    delete process.env[ENGINE_BASE_URL_ENV]
    delete process.env.ARCANA_ENGINE_ALLOW_LOCAL
    process.env.NODE_ENV = "test"
    installFetch(async () => {
      throw new Error("must not be called")
    })

    const res = await app.fetch(
      new Request("http://console/api/enterprise/organizations/tenant-a/approvals"),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("engine_base_url_not_configured")
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
