import { describe, expect, it } from "bun:test"
import { buildAuthorizationRequest } from "./governance.js"
import { AuthorizationDeniedError, ApprovalRequiredError, TransportError } from "./errors.js"
import {
  createLivePepClient,
  governedToolWithLivePep,
  governedMcpToolWithLivePep,
  governedMastraToolWithLivePep,
  governedLangGraphToolWithLivePep,
  PEP_DECIDE_PATH,
  type LivePepOptions,
} from "./live-pep.js"
import type { GovernanceContext } from "./governance.js"

type CapturedCall = {
  url: string
  method: string
  body?: unknown
  headers: Record<string, string>
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(
  calls: CapturedCall[],
  responder: (call: CapturedCall) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: CapturedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    }
    calls.push(call)
    return responder(call)
  }) as typeof fetch
}

function clientWith(
  calls: CapturedCall[],
  responder: (call: CapturedCall) => Response | Promise<Response>,
  options: Partial<LivePepOptions> = {},
) {
  return createLivePepClient({
    baseUrl: "http://localhost:4100",
    fetchImpl: stubFetch(calls, responder),
    ...options,
  })
}

const CONTEXT: GovernanceContext = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  contractId: "contract-1",
  contractRevision: "3",
  requestId: "req-frozen",
  nonce: "nonce-frozen",
  requestedAt: "2026-08-02T12:00:00.000Z",
  action: "process.execute",
  resource: { kind: "process" },
  executable: "bun",
  provenance: ["USER_INSTRUCTION"],
  sensitivity: ["INTERNAL"],
}

const REQUEST = buildAuthorizationRequest({
  schemaVersion: "1",
  principalId: CONTEXT.principalId,
  sessionId: CONTEXT.sessionId,
  workspaceId: CONTEXT.workspaceId,
  contractId: CONTEXT.contractId,
  contractRevision: CONTEXT.contractRevision,
  requestId: CONTEXT.requestId,
  nonce: CONTEXT.nonce,
  requestedAt: CONTEXT.requestedAt,
  tool: "run",
  action: "process.execute",
  resource: { kind: "process" },
  executable: "bun",
  arguments: ["command=bun test"],
  provenance: ["USER_INSTRUCTION"],
  sensitivity: ["INTERNAL"],
})

describe("SDK 1.0 live PEP transport (E6 / BLK-E-06)", () => {
  it("ALLOW round trip: POSTs the canonical request to the decision endpoint", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))

    const outcome = await client.authorize(REQUEST)

    expect(outcome).toEqual({ decision: "ALLOW" })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: `http://localhost:4100${PEP_DECIDE_PATH}`,
      method: "POST",
      headers: { "content-type": "application/json" },
    })
  })

  it("request payload matches the engine contract: requestHash + exact canonical fields", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))

    await client.authorize(REQUEST)

    expect(calls[0]?.body).toEqual({
      schemaVersion: "1",
      requestId: "req-frozen",
      principalId: "agent:build",
      sessionId: "session-1",
      contractId: "contract-1",
      contractRevision: "3",
      workspaceId: "workspace-1",
      tool: "run",
      action: "process.execute",
      resource: { kind: "process" },
      executable: "bun",
      arguments: ["command=bun test"],
      provenance: ["USER_INSTRUCTION"],
      sensitivity: ["INTERNAL"],
      requestedAt: "2026-08-02T12:00:00.000Z",
      nonce: "nonce-frozen",
      requestHash: REQUEST.requestHash,
    })
    expect(REQUEST.requestHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("DENY maps to AuthorizationDeniedError without executing", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "DENY", reason: "outside workspace" }))
    let executed = false

    await expect(
      client.executeExact(REQUEST, async () => {
        executed = true
        return "done"
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError)

    await expect(client.executeExact(REQUEST, async () => "done")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "outside workspace",
    })
    expect(executed).toBe(false)
  })

  it("REQUIRE_APPROVAL maps to ApprovalRequiredError with requestHash and approvalId", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () =>
      jsonResponse({ decision: "REQUIRE_APPROVAL", reason: "exact approval", approvalId: "appr-1" }),
    )

    const error = await client
      .executeExact(REQUEST, async () => "done")
      .then(
        () => null,
        (e: unknown) => e,
      )

    expect(error).toBeInstanceOf(ApprovalRequiredError)
    expect(error).toMatchObject({
      code: "APPROVAL_REQUIRED",
      message: "exact approval",
      details: { requestHash: REQUEST.requestHash, approvalId: "appr-1" },
    })
  })

  it("authorize returns REQUIRE_APPROVAL as an outcome carrying the approval id", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () =>
      jsonResponse({ decision: "REQUIRE_APPROVAL", reason: "exact approval", approvalId: "appr-9" }),
    )

    const outcome = await client.authorize(REQUEST)

    expect(outcome).toEqual({
      decision: "REQUIRE_APPROVAL",
      reason: "exact approval",
      approvalId: "appr-9",
    })
  })

  it("fails closed on network errors with TransportError", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => {
      throw new TypeError("fetch failed: ECONNREFUSED")
    })

    await expect(client.authorize(REQUEST)).rejects.toBeInstanceOf(TransportError)
    await expect(client.authorize(REQUEST)).rejects.toMatchObject({
      code: "TRANSPORT_ERROR",
    })
  })

  it("fails closed on 5xx responses with TransportError", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ error: "internal" }, 503))

    await expect(client.authorize(REQUEST)).rejects.toBeInstanceOf(TransportError)
  })

  it("fails closed on non-JSON success responses", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => new Response("<html>gateway error</html>", { status: 200 }))

    await expect(client.authorize(REQUEST)).rejects.toBeInstanceOf(TransportError)
  })

  it("fails closed on unknown or missing decision values", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, (call) =>
      call.url.endsWith(PEP_DECIDE_PATH) ? jsonResponse({ decision: "MAYBE" }) : jsonResponse({}),
    )

    await expect(client.authorize(REQUEST)).rejects.toBeInstanceOf(TransportError)
  })

  it("fails closed when the engine echoes a mismatched requestHash", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW", requestHash: "0".repeat(64) }))

    await expect(client.authorize(REQUEST)).rejects.toBeInstanceOf(TransportError)
    await expect(client.authorize(REQUEST)).rejects.toMatchObject({
      details: {
        responseRequestHash: "0".repeat(64),
        submittedRequestHash: REQUEST.requestHash,
      },
    })
  })

  it("accepts a matching requestHash echo", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW", requestHash: REQUEST.requestHash }))

    await expect(client.authorize(REQUEST)).resolves.toEqual({ decision: "ALLOW" })
  })

  it("sends engine auth: auth_token query, Basic header, and custom headers", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }), {
      token: "dXNlcjpwYXNz",
      username: "operator",
      password: "secret",
      directory: "C:/work",
      workspace: "ws-a",
      headers: { "x-arcana-session": "session-1" },
    })

    await client.authorize(REQUEST)

    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe(PEP_DECIDE_PATH)
    expect(url.searchParams.get("auth_token")).toBe("dXNlcjpwYXNz")
    expect(url.searchParams.get("workspace")).toBe("ws-a")
    expect(calls[0]?.headers["authorization"]).toBe("Basic b3BlcmF0b3I6c2VjcmV0")
    expect(calls[0]?.headers["x-arcana-directory"]).toBe("C:/work")
    expect(calls[0]?.headers["x-arcana-session"]).toBe("session-1")
  })

  it("executes only after a fresh revalidation in executeExact", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))
    const executed: string[] = []

    const result = await client.executeExact(REQUEST, async () => {
      executed.push("effect")
      return { ok: true }
    })

    expect(result).toEqual({ ok: true })
    expect(executed).toEqual(["effect"])
    // The enforcement boundary revalidates the exact request over HTTP.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toEqual(REQUEST)
  })

  it("wires governedToolWithLivePep: authorize + fresh revalidation, ALLOW executes", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))
    const executed: string[] = []

    const tool = governedToolWithLivePep(
      {
        name: "run",
        execute: async (args: { command: string }) => {
          executed.push(args.command)
          return { ok: true }
        },
      },
      { context: CONTEXT, pep: client },
    )

    const result = await tool.execute({ command: "bun test" })

    expect(result).toEqual({ ok: true })
    expect(executed).toEqual(["bun test"])
    // Hook authorize + enforcement-boundary revalidation = two decisions.
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.method).toBe("POST")
      expect(call.url).toContain(PEP_DECIDE_PATH)
    }
    expect(calls[0]?.body).toMatchObject({ tool: "run", action: "process.execute" })
    expect(calls[1]?.body).toMatchObject({ tool: "run", action: "process.execute" })
  })

  it("wires governedToolWithLivePep: DENY blocks the executor", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "DENY", reason: "outside workspace" }))
    let executed = false

    const tool = governedToolWithLivePep(
      {
        name: "rm",
        execute: async () => {
          executed = true
          return {}
        },
      },
      { context: { ...CONTEXT, action: "filesystem.delete" }, pep: client },
    )

    await expect(tool.execute({ path: "/etc/passwd" })).rejects.toBeInstanceOf(AuthorizationDeniedError)
    expect(executed).toBe(false)
  })

  it("wires governedMcpToolWithLivePep with MCP_DESCRIPTION provenance", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))
    const executed: string[] = []
    // Omit provenance so the adapter applies its untrusted-metadata default.
    const { provenance: _omitted, ...contextNoProvenance } = CONTEXT

    const tool = governedMcpToolWithLivePep(
      {
        server: "filesystem",
        name: "read",
        execute: async (args: { path: string }) => {
          executed.push(args.path)
          return "content"
        },
      },
      { context: contextNoProvenance, pep: client },
    )

    const result = await tool.execute({ path: "/tmp/a.txt" })

    expect(result).toBe("content")
    expect(executed).toEqual(["/tmp/a.txt"])
    expect(calls[0]?.body).toMatchObject({
      tool: "mcp.filesystem.read",
      provenance: ["MCP_DESCRIPTION"],
    })
  })

  it("wires governedMastraToolWithLivePep and governedLangGraphToolWithLivePep", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, () => jsonResponse({ decision: "ALLOW" }))
    const { provenance: _omitted, ...contextNoProvenance } = CONTEXT

    const mastraTool = governedMastraToolWithLivePep(
      {
        id: "weather",
        execute: async () => "sunny",
      },
      { context: contextNoProvenance, pep: client },
    )
    await expect(mastraTool.execute({})).resolves.toBe("sunny")

    const langGraphTool = governedLangGraphToolWithLivePep(
      {
        name: "search",
        invoke: async () => "results",
      },
      { context: contextNoProvenance, pep: client },
    )
    await expect(langGraphTool.invoke({})).resolves.toBe("results")

    expect(calls.map((c) => c.body)).toMatchObject([
      { tool: "mastra.weather" },
      { tool: "mastra.weather" },
      { tool: "langgraph.search" },
      { tool: "langgraph.search" },
    ])
    expect(calls[0]?.body).toMatchObject({ provenance: ["MCP_DESCRIPTION"] })
    expect(calls[1]?.body).toMatchObject({ provenance: ["MCP_DESCRIPTION"] })
  })

  it("submits approval commands with RuntimeApprovalCommandPayload to the runtime surface", async () => {
    const calls: CapturedCall[] = []
    const client = clientWith(calls, (call) => {
      if (call.url.endsWith("/approvals/appr-1/approve")) {
        return jsonResponse({
          success: true,
          approval: {
            approvalId: "appr-1",
            requestHash: REQUEST.requestHash,
            state: "APPROVED",
          },
        })
      }
      return jsonResponse({ success: false, reason: "stale", stale: true })
    })

    const payload = {
      expectedVersion: 1,
      expectedRequestHash: REQUEST.requestHash,
      expectedContractRevision: 3,
    }

    const approved = await client.approvals.approve("appr-1", payload)
    expect(approved).toMatchObject({ success: true })
    expect(calls[0]).toMatchObject({
      url: "http://localhost:4100/approvals/appr-1/approve",
      method: "POST",
      body: payload,
    })

    const denied = await client.approvals.deny("appr-2", payload)
    expect(denied).toMatchObject({ success: false, stale: true })
    expect(calls[1]).toMatchObject({
      url: "http://localhost:4100/approvals/appr-2/deny",
      body: payload,
    })

    await client.approvals.revoke("appr-3", payload)
    expect(calls[2]).toMatchObject({
      url: "http://localhost:4100/approvals/appr-3/revoke",
      method: "POST",
    })

    await client.approvals.list()
    expect(calls[3]).toMatchObject({
      url: "http://localhost:4100/approvals",
      method: "GET",
    })
  })
})
