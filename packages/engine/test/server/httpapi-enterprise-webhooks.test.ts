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

describe("enterprise HttpApi webhook delivery (F11)", () => {
  it.instance(
    "registers webhooks, auto-enqueues admin events, and fails closed on delivery errors",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const created = yield* requestInDirectory(
          EnterprisePaths.createOrganization,
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ tenantId: "tenant-a", name: "tenant-a" }),
          },
        )
        expect(created.status).toBe(200)

        const webhook = yield* requestInDirectory(
          EnterprisePaths.webhooks.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              webhookId: "wh-1",
              url: "http://127.0.0.1:1/hook",
              active: true,
            }),
          },
        )
        expect(((yield* webhook.json) as { webhookId?: string }).webhookId).toBe("wh-1")

        const list = yield* requestInDirectory(
          EnterprisePaths.webhooks.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* list.json).toHaveLength(1)

        const event = yield* requestInDirectory(
          EnterprisePaths.adminEvents.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ kind: "alert.critical", alertId: "alert-1" }),
          },
        )
        expect(((yield* event.json) as { kind?: string }).kind).toBe("alert.critical")

        const deliveries = yield* requestInDirectory(
          EnterprisePaths.webhookDeliveries.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        const deliveryBody = (yield* deliveries.json) as Array<{
          status: string
          payloadJson: string
          webhookId: string
        }>
        expect(deliveryBody).toHaveLength(1)
        expect(deliveryBody[0]?.status).toBe("PENDING")
        expect(deliveryBody[0]?.webhookId).toBe("wh-1")
        expect(JSON.parse(deliveryBody[0]?.payloadJson ?? "{}")).toMatchObject({
          kind: "alert.critical",
          alertId: "alert-1",
        })

        const delivered = yield* requestInDirectory(
          EnterprisePaths.webhookDeliver.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ maxAttempts: 1 }),
          },
        )
        expect(yield* delivered.json).toEqual({ delivered: 0, failed: 1, pending: 0 })

        const after = yield* requestInDirectory(
          EnterprisePaths.webhookDeliveries.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        const afterBody = (yield* after.json) as Array<{ status: string; lastError?: string }>
        expect(afterBody[0]?.status).toBe("FAILED")
        expect(afterBody[0]?.lastError).toBeTruthy()

        // Inactive endpoints are never enqueued.
        const inactive = yield* requestInDirectory(
          EnterprisePaths.webhooks.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              webhookId: "wh-inactive",
              url: "http://127.0.0.1:1/hook",
              active: false,
            }),
          },
        )
        expect(((yield* inactive.json) as { active?: boolean }).active).toBe(false)

        const secondEvent = yield* requestInDirectory(
          EnterprisePaths.adminEvents.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ kind: "node.revoked", nodeId: "node-1", reason: "compromised" }),
          },
        )
        expect(((yield* secondEvent.json) as { kind?: string }).kind).toBe("node.revoked")

        const afterSecond = yield* requestInDirectory(
          EnterprisePaths.webhookDeliveries.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* afterSecond.json).toHaveLength(2)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
