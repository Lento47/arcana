import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { EnterprisePaths } from "../../src/server/routes/instance/httpapi/groups/enterprise"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  await disposeAllInstances()
  await resetDatabase()
})

function createOrg(
  directory: string,
  tenantId: string,
  headers: Record<string, string>,
) {
  return Effect.gen(function* () {
    const res = yield* requestInDirectory(EnterprisePaths.createOrganization, directory, {
      method: "POST",
      headers,
      body: JSON.stringify({ tenantId, name: tenantId }),
    })
    expect(res.status).toBe(200)
  })
}

function assignRole(
  directory: string,
  tenantId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "OPERATOR" | "AUDITOR" | "MEMBER",
  headers: Record<string, string>,
) {
  return Effect.gen(function* () {
    const res = yield* requestInDirectory(
      EnterprisePaths.assignRole.replace(":tenantId", tenantId),
      directory,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, role }),
      },
    )
    expect(res.status).toBe(200)
  })
}

function registerNode(
  directory: string,
  tenantId: string,
  nodeId: string,
  headers: Record<string, string>,
) {
  return Effect.gen(function* () {
    const res = yield* requestInDirectory(
      EnterprisePaths.registerNode.replace(":tenantId", tenantId),
      directory,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          nodeId,
          organizationId: `org-${tenantId}`,
          environment: "prod",
          version: "1.0.0",
          upgradeRing: 1,
          nodeKeyEpoch: 1,
          enforcementMode: "ONLINE",
          policySequence: 1,
          policyDigest: "digest-1",
          revocationSequence: 0,
          revocationDigest: "",
          proofBacklog: 0,
        }),
      },
    )
    expect(res.status).toBe(200)
  })
}

function queueApproval(
  directory: string,
  tenantId: string,
  approvalId: string,
  requesterId: string,
  headers: Record<string, string>,
) {
  return Effect.gen(function* () {
    const res = yield* requestInDirectory(
      EnterprisePaths.createApproval.replace(":tenantId", tenantId),
      directory,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          approvalId,
          requestHash: `hash-${approvalId}`,
          requesterId,
          exactRequestJson: JSON.stringify({ requestHash: `hash-${approvalId}` }),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      },
    )
    expect(res.status).toBe(200)
  })
}

describe("enterprise HttpApi diagnostics, escalation, SIEM, and metering (F4, F5, F11, F12)", () => {
  it.instance(
    "serves node remote diagnostics and escalates stale approvals without consuming them",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-a", headers)
        yield* assignRole(tmp.directory, "tenant-a", "u-admin", "ADMIN", headers)
        yield* registerNode(tmp.directory, "tenant-a", "node-1", headers)

        const detail = yield* requestInDirectory(
          EnterprisePaths.nodeDetail
            .replace(":tenantId", "tenant-a")
            .replace(":nodeId", "node-1"),
          tmp.directory,
          { method: "GET", headers },
        )
        const detailBody = (yield* detail.json) as { nodeId?: string; health?: string }
        expect(detailBody.nodeId).toBe("node-1")
        expect(detailBody.health).toBe("HEALTHY")

        const missing = yield* requestInDirectory(
          EnterprisePaths.nodeDetail
            .replace(":tenantId", "tenant-a")
            .replace(":nodeId", "node-missing"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* missing.json).toBeNull()

        yield* queueApproval(tmp.directory, "tenant-a", "appr-1", "u-agent", headers)

        const policy = yield* requestInDirectory(
          EnterprisePaths.escalationPolicy.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              policyId: "esc-1",
              maxWaitMs: 0,
              fallbackApprovers: ["u-owner"],
              requireBreakGlass: true,
            }),
          },
        )
        expect(((yield* policy.json) as { policyId?: string }).policyId).toBe("esc-1")

        const escalated = yield* requestInDirectory(
          EnterprisePaths.escalationCheck.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ approvalId: "appr-1" }),
          },
        )
        const escalatedBody = (yield* escalated.json) as {
          escalated: boolean
          suggestedApprovers?: string[]
          requireBreakGlass?: boolean
        }
        expect(escalatedBody.escalated).toBe(true)
        expect(escalatedBody.suggestedApprovers).toEqual(["u-owner"])
        expect(escalatedBody.requireBreakGlass).toBe(true)

        const events = yield* requestInDirectory(
          EnterprisePaths.escalationEvents.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* events.json)).toHaveLength(1)

        // Escalation must not consume the approval: it can still be decided
        // with exact inspection by a real approver.
        const decided = yield* requestInDirectory(
          EnterprisePaths.decideApproval
            .replace(":tenantId", "tenant-a")
            .replace(":approvalId", "appr-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              actorUserId: "u-admin",
              decision: "APPROVE",
              inspectedRequestJson: JSON.stringify({ requestHash: "hash-appr-1" }),
            }),
          },
        )
        expect(((yield* decided.json) as { status?: string }).status).toBe("APPROVED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "records canonical admin events and exports them as SIEM CEF",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-b", headers)

        const events = [
          {
            kind: "approval.pending",
            approvalId: "appr-1",
            requestHash: "hash-1",
          },
          {
            kind: "node.revoked",
            nodeId: "node-1",
            reason: "compromised|urgent",
          },
          {
            kind: "policy.promoted",
            policyId: "policy-root",
            sequence: 2,
          },
          {
            kind: "alert.critical",
            alertId: "alert-1",
          },
        ]
        for (const event of events) {
          const recorded = yield* requestInDirectory(
            EnterprisePaths.adminEvents.replace(":tenantId", "tenant-b"),
            tmp.directory,
            { method: "POST", headers, body: JSON.stringify(event) },
          )
          expect(((yield* recorded.json) as { kind?: string }).kind).toBe(event.kind)
        }

        const byKind = yield* requestInDirectory(
          `${EnterprisePaths.adminEvents.replace(":tenantId", "tenant-b")}?kind=node.revoked`,
          tmp.directory,
          { method: "GET", headers },
        )
        const byKindBody = (yield* byKind.json) as Array<{ nodeId?: string }>
        expect(byKindBody).toHaveLength(1)
        expect(byKindBody[0]?.nodeId).toBe("node-1")

        const all = yield* requestInDirectory(
          `${EnterprisePaths.adminEvents.replace(":tenantId", "tenant-b")}?since=2026-08-02T00:00:00.000Z`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* all.json).toHaveLength(4)

        const siem = yield* requestInDirectory(
          EnterprisePaths.siemExport.replace(":tenantId", "tenant-b"),
          tmp.directory,
          { method: "GET", headers },
        )
        const cef = yield* siem.json
        expect(cef).toContain("CEF:0|Arcana|Arcana|1.0|arcana/approval/pending")
        expect(cef).toContain("arcana/node/revoked")
        expect(cef).toContain("arcana/policy/promoted")
        expect(cef).toContain("arcana/alert/critical")
        expect(cef).toContain("cs2=compromised\\|urgent")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "records and aggregates usage metering while keeping quota informational",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-c", headers)

        for (const [eventId, units, at] of [
          ["usage-1", 3, "2026-08-02T10:00:00.000Z"],
          ["usage-2", 4, "2026-08-02T11:00:00.000Z"],
        ] as const) {
          const recorded = yield* requestInDirectory(
            EnterprisePaths.usage.replace(":tenantId", "tenant-c"),
            tmp.directory,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ eventId, feature: "shared_approvals", units, at }),
            },
          )
          expect(((yield* recorded.json) as { eventId?: string }).eventId).toBe(eventId)
        }

        const summary = yield* requestInDirectory(
          `${EnterprisePaths.usage.replace(":tenantId", "tenant-c")}?feature=shared_approvals&since=2026-08-02T10:30:00.000Z`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* summary.json)).toEqual({ kind: "summary", feature: "shared_approvals", units: 4 })

        const all = yield* requestInDirectory(
          EnterprisePaths.usage.replace(":tenantId", "tenant-c"),
          tmp.directory,
          { method: "GET", headers },
        )
        const allBody = (yield* all.json) as { kind?: string; events?: Array<{ eventId: string }> }
        expect(allBody.kind).toBe("events")
        expect(allBody.events).toHaveLength(2)

        const over = yield* requestInDirectory(
          EnterprisePaths.usageQuota.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ limit: 5, feature: "shared_approvals" }),
          },
        )
        expect((yield* over.json)).toEqual({ ok: false, used: 7, limit: 5, overQuota: true })

        // Quota status is informational: the security decision is unchanged.
        const decision = yield* requestInDirectory(
          EnterprisePaths.meteringCheck.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ decision: "DENY", meteringOk: false, overQuota: true }),
          },
        )
        expect(((yield* decision.json) as { decision?: string }).decision).toBe("DENY")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
