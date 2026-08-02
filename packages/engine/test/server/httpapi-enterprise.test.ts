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

describe("enterprise HttpApi (F1-F6 surface)", () => {
  it.instance(
    "creates organizations, assigns roles, queues and decides approvals with exact inspection",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const created = yield* requestInDirectory(EnterprisePaths.createOrganization, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ tenantId: "tenant-a", name: "Acme" }),
        })
        expect(created.status).toBe(200)
        expect(((yield* created.json) as { tenantId?: string }).tenantId).toBe("tenant-a")

        const role = yield* requestInDirectory(
          EnterprisePaths.assignRole.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ userId: "u-admin", role: "ADMIN" }),
          },
        )
        expect(role.status).toBe(200)

        const queued = yield* requestInDirectory(
          EnterprisePaths.createApproval.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              approvalId: "appr-1",
              requestHash: "hash-1",
              requesterId: "u-agent",
              exactRequestJson: JSON.stringify({ requestHash: "hash-1" }),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }),
          },
        )
        expect(queued.status).toBe(200)

        const wrongInspection = yield* requestInDirectory(
          EnterprisePaths.decideApproval.replace(":tenantId", "tenant-a").replace(":approvalId", "appr-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              actorUserId: "u-admin",
              decision: "APPROVE",
              inspectedRequestJson: JSON.stringify({ requestHash: "hash-2" }),
            }),
          },
        )
        expect(((yield* wrongInspection.json) as { kind?: string }).kind).toBe("REJECTED")

        const approved = yield* requestInDirectory(
          EnterprisePaths.decideApproval.replace(":tenantId", "tenant-a").replace(":approvalId", "appr-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              actorUserId: "u-admin",
              decision: "APPROVE",
              inspectedRequestJson: JSON.stringify({ requestHash: "hash-1" }),
            }),
          },
        )
        expect(((yield* approved.json) as { status?: string }).status).toBe("APPROVED")

        const fleet = yield* requestInDirectory(
          EnterprisePaths.fleet.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* fleet.json).toEqual([])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
