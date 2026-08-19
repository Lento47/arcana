import { describe, expect, it } from "bun:test"
import { enterpriseClient } from "./enterprise.js"

type CapturedCall = {
  url: string
  method: string
  body?: unknown
  headers: Record<string, string>
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(calls: CapturedCall[], responder: (call: CapturedCall) => Response): typeof fetch {
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

describe("SDK 1.0 enterprise admin surface (F11)", () => {
  it("creates organizations with workspace routing headers", async () => {
    const calls: CapturedCall[] = []
    const client = enterpriseClient({
      baseUrl: "http://localhost:4100",
      directory: "C:/work",
      fetchImpl: stubFetch(calls, () =>
        jsonResponse({ tenantId: "tenant-a", id: "org-tenant-a", name: "Acme", createdAt: "2026-08-02T12:00:00.000Z" }),
      ),
    })
    const org = await client.createOrganization("tenant-a", "Acme")
    expect(org.tenantId).toBe("tenant-a")
    expect(calls[0]).toMatchObject({
      url: "http://localhost:4100/api/enterprise/organizations",
      method: "POST",
      body: { tenantId: "tenant-a", name: "Acme" },
    })
    expect(calls[0]?.headers["x-arcana-directory"]).toBe("C:/work")
  })

  it("promotes policies, checks escalation, and reads the fleet", async () => {
    const calls: CapturedCall[] = []
    const client = enterpriseClient({
      baseUrl: "http://localhost:4100",
      fetchImpl: stubFetch(calls, (call) => {
        if (call.url.endsWith("/policies/promote")) {
          return jsonResponse({ kind: "PROMOTED", promotionId: "promo-1" })
        }
        if (call.url.endsWith("/escalations/check")) {
          return jsonResponse({ escalated: true, reason: "stale", suggestedApprovers: ["u-owner"] })
        }
        return jsonResponse([{ nodeId: "node-1", health: "HEALTHY", version: "1.0.0" }])
      }),
    })

    const promoted = await client.promotePolicy("tenant-a", {
      sourceSequence: 2,
      targetEnvironment: "prod",
      requestedBy: "u-agent",
      approvedBy: "u-admin",
    })
    expect(promoted.kind).toBe("PROMOTED")

    const escalation = await client.escalationCheck("tenant-a", "appr-1")
    expect(escalation.escalated).toBe(true)
    expect(escalation.suggestedApprovers).toEqual(["u-owner"])

    const fleet = await client.fleet("tenant-a")
    expect(fleet[0]?.health).toBe("HEALTHY")
    expect(calls.map((c) => c.url)).toEqual([
      "http://localhost:4100/api/enterprise/organizations/tenant-a/policies/promote",
      "http://localhost:4100/api/enterprise/organizations/tenant-a/escalations/check",
      "http://localhost:4100/api/enterprise/organizations/tenant-a/fleet",
    ])
  })

  it("exports SIEM text and evaluates quotas without affecting decisions", async () => {
    const calls: CapturedCall[] = []
    const client = enterpriseClient({
      baseUrl: "http://localhost:4100",
      fetchImpl: stubFetch(calls, (call) => {
        if (call.url.endsWith("/siem-export")) {
          return new Response("CEF:0|Arcana|Arcana|1.0|arcana/alert/critical|Critical security alert|10|", {
            status: 200,
          })
        }
        return jsonResponse({ ok: false, used: 7, limit: 5, overQuota: true })
      }),
    })

    const cef = await client.siemExport("tenant-a")
    expect(cef).toContain("CEF:0|Arcana")

    const quota = await client.usageQuota("tenant-a", { limit: 5, feature: "shared_approvals" })
    expect(quota).toEqual({ ok: false, used: 7, limit: 5, overQuota: true })
  })

  it("records usage and routes cross-org approvals", async () => {
    const calls: CapturedCall[] = []
    const client = enterpriseClient({
      baseUrl: "http://localhost:4100",
      fetchImpl: stubFetch(calls, (call) =>
        call.url.endsWith("/commercial/usage")
          ? jsonResponse({
              tenantId: "tenant-a",
              eventId: "usage-1",
              feature: "shared_approvals",
              units: 3,
              at: "2026-08-02T12:00:00.000Z",
            })
          : jsonResponse({ kind: "ROUTED" }),
      ),
    })

    const used = await client.recordUsage("tenant-a", {
      eventId: "usage-1",
      feature: "shared_approvals",
      units: 3,
    })
    expect(used.eventId).toBe("usage-1")

    const routed = await client.routeCrossOrgApproval("tenant-a", {
      orgB: "org-b",
      agreementId: "agree-1",
      approvalId: "appr-1",
      action: "execute",
    })
    expect(routed.kind).toBe("ROUTED")
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST"])
  })
})
