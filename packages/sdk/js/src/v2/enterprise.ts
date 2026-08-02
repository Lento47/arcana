/**
 * SDK 1.0 enterprise admin surface (F11).
 *
 * Typed automation client for the `/api/enterprise/*` admin API: orgs,
 * roles, fleet, policy promotion, escalation, archive, SIEM export,
 * metering, and federation routing. The client is transport-only: every
 * request is executed against the engine PEP/governance stack and never
 * bypasses a security decision.
 */

export const ENTERPRISE_API_ROOT = "/api/enterprise"

export type EnterpriseClientOptions = {
  baseUrl: string
  directory?: string
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
}

export type TenantRole = "OWNER" | "ADMIN" | "OPERATOR" | "AUDITOR" | "MEMBER"

export type EnterpriseClient = {
  createOrganization(tenantId: string, name: string): Promise<{ tenantId: string; id: string; name: string; createdAt: string }>
  assignRole(tenantId: string, userId: string, role: TenantRole): Promise<boolean>
  fleet(tenantId: string): Promise<Array<{ nodeId: string; health: string; version: string }>>
  promotePolicy(
    tenantId: string,
    input: { sourceSequence: number; targetEnvironment: string; requestedBy: string; approvedBy: string },
  ): Promise<{ kind: "PROMOTED"; promotionId: string } | { kind: "REJECTED"; reason: string }>
  escalationCheck(
    tenantId: string,
    approvalId: string,
  ): Promise<{ escalated: boolean; reason: string; suggestedApprovers?: string[] }>
  siemExport(tenantId: string): Promise<string>
  recordUsage(
    tenantId: string,
    input: { eventId: string; feature: string; units: number },
  ): Promise<{ tenantId: string; eventId: string; feature: string; units: number; at: string }>
  usageQuota(
    tenantId: string,
    input: { limit: number; feature: string },
  ): Promise<{ ok: boolean; used: number; limit: number; overQuota: boolean }>
  routeCrossOrgApproval(
    tenantId: string,
    input: { orgB: string; agreementId: string; approvalId: string; action: string },
  ): Promise<{ kind: "ROUTED" } | { kind: "REJECTED"; reason: string }>
}

function pathFor(tenantId: string, suffix: string): string {
  return `${ENTERPRISE_API_ROOT}/organizations/${encodeURIComponent(tenantId)}${suffix}`
}

export function enterpriseClient(options: EnterpriseClientOptions): EnterpriseClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/+$/, "")

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.directory ? { "x-opencode-directory": options.directory } : {}),
      ...options.headers,
    }
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`enterprise admin request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }

  return {
    createOrganization: (tenantId, name) =>
      request("POST", `${ENTERPRISE_API_ROOT}/organizations`, { tenantId, name }),

    assignRole: async (tenantId, userId, role) => {
      await request("POST", pathFor(tenantId, "/roles"), { userId, role })
      return true
    },

    fleet: (tenantId) => request("GET", pathFor(tenantId, "/fleet")),

    promotePolicy: (tenantId, input) =>
      request("POST", pathFor(tenantId, "/policies/promote"), input),

    escalationCheck: (tenantId, approvalId) =>
      request("POST", pathFor(tenantId, "/escalations/check"), { approvalId }),

    siemExport: async (tenantId) => {
      const headers: Record<string, string> = {
        ...(options.directory ? { "x-opencode-directory": options.directory } : {}),
        ...options.headers,
      }
      const response = await fetchImpl(`${base}${pathFor(tenantId, "/admin-events/siem-export")}`, {
        method: "GET",
        headers,
      })
      if (!response.ok) {
        throw new Error(`enterprise admin request failed: ${response.status} ${response.statusText}`)
      }
      return response.text()
    },

    recordUsage: (tenantId, input) =>
      request("POST", pathFor(tenantId, "/commercial/usage"), input),

    usageQuota: (tenantId, input) =>
      request("POST", pathFor(tenantId, "/commercial/usage/quota"), input),

    routeCrossOrgApproval: (tenantId, input) =>
      request("POST", pathFor(tenantId, "/federation/route-approval"), input),
  }
}
