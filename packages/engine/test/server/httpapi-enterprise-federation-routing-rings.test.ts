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
          upgradeRing: 0,
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

describe("enterprise HttpApi federation routing and upgrade rings (F8, F4)", () => {
  it.instance(
    "routes cross-org approvals only under active agreements with exact bounded rules",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-a", headers)

        const now = new Date()
        const created = yield* requestInDirectory(
          EnterprisePaths.federationAgreements.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              version: 1,
              orgA: "tenant-a",
              orgB: "org-b",
              audienceRestrictions: ["audience-x"],
              validFrom: new Date(now.getTime() - 60_000).toISOString(),
              validTo: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
              status: "ACTIVE",
            }),
          },
        )
        expect(((yield* created.json) as { status?: string }).status).toBe("ACTIVE")

        const rule = yield* requestInDirectory(
          EnterprisePaths.federationRules.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              ruleId: "rule-1",
              orgB: "org-b",
              agreementId: "agree-1",
              actionPatterns: ["execute"],
              maxPerDay: 1,
            }),
          },
        )
        expect(((yield* rule.json) as { ruleId?: string }).ruleId).toBe("rule-1")

        const rules = yield* requestInDirectory(
          EnterprisePaths.federationRules.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* rules.json).toHaveLength(1)

        const routed = yield* requestInDirectory(
          EnterprisePaths.federationRouteApproval.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              orgB: "org-b",
              agreementId: "agree-1",
              approvalId: "appr-1",
              action: "execute",
            }),
          },
        )
        const routedBody = (yield* routed.json) as {
          kind: string
          record?: { approvalId: string }
          rule?: { maxPerDay: number }
        }
        expect(routedBody.kind).toBe("ROUTED")
        expect(routedBody.record?.approvalId).toBe("appr-1")
        expect(routedBody.rule?.maxPerDay).toBe(1)

        const capped = yield* requestInDirectory(
          EnterprisePaths.federationRouteApproval.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              orgB: "org-b",
              agreementId: "agree-1",
              approvalId: "appr-2",
              action: "execute",
            }),
          },
        )
        expect(((yield* capped.json) as { kind?: string }).kind).toBe("REJECTED")

        const ungranted = yield* requestInDirectory(
          EnterprisePaths.federationRouteApproval.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              orgB: "org-b",
              agreementId: "agree-1",
              approvalId: "appr-3",
              action: "delete",
            }),
          },
        )
        expect(((yield* ungranted.json) as { kind?: string }).kind).toBe("REJECTED")

        const routedList = yield* requestInDirectory(
          `${EnterprisePaths.federationRouted.replace(":tenantId", "tenant-a")}?orgId=org-b`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* routedList.json).toHaveLength(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "stores upgrade rings, assigns nodes, and plans gated rollouts",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-a", headers)
        yield* registerNode(tmp.directory, "tenant-a", "node-1", headers)
        yield* registerNode(tmp.directory, "tenant-a", "node-2", headers)

        const ring = yield* requestInDirectory(
          EnterprisePaths.rings.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              ringId: "ring-1",
              name: "canary",
              targetVersion: "2.0.0",
              paused: false,
            }),
          },
        )
        expect(((yield* ring.json) as { ringId?: string }).ringId).toBe("ring-1")

        for (const nodeId of ["node-1", "node-2"]) {
          const assigned = yield* requestInDirectory(
            EnterprisePaths.ringAssign
              .replace(":tenantId", "tenant-a")
              .replace(":ringId", "ring-1"),
            tmp.directory,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ nodeId }),
            },
          )
          expect(((yield* assigned.json) as { ok?: boolean }).ok).toBe(true)
        }

        const plan = yield* requestInDirectory(
          EnterprisePaths.ringPlan
            .replace(":tenantId", "tenant-a")
            .replace(":ringId", "ring-1"),
          tmp.directory,
          { method: "GET", headers },
        )
        const planBody = (yield* plan.json) as Array<{ nodeId: string; allowed: boolean }>
        expect(planBody).toHaveLength(2)
        expect(planBody.every((entry) => entry.allowed)).toBe(true)

        const pausedRing = yield* requestInDirectory(
          EnterprisePaths.rings.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              ringId: "ring-2",
              name: "frozen",
              targetVersion: "3.0.0",
              paused: true,
            }),
          },
        )
        expect(((yield* pausedRing.json) as { paused?: boolean }).paused).toBe(true)

        const moved = yield* requestInDirectory(
          EnterprisePaths.ringAssign
            .replace(":tenantId", "tenant-a")
            .replace(":ringId", "ring-2"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ nodeId: "node-2" }),
          },
        )
        expect(((yield* moved.json) as { ok?: boolean }).ok).toBe(true)

        const frozenPlan = yield* requestInDirectory(
          EnterprisePaths.ringPlan
            .replace(":tenantId", "tenant-a")
            .replace(":ringId", "ring-2"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(
          ((yield* frozenPlan.json) as Array<{ nodeId: string; allowed: boolean }>)[0]?.allowed,
        ).toBe(false)

        const rings = yield* requestInDirectory(
          EnterprisePaths.rings.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* rings.json).toHaveLength(2)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
