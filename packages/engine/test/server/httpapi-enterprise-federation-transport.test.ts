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

describe("enterprise HttpApi federated revocation transport (F8)", () => {
  it.instance(
    "queues, receives, deduplicates, and completes revocation deliveries",
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

        const now = new Date()
        const agreement = yield* requestInDirectory(
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
              audienceRestrictions: [],
              validFrom: new Date(now.getTime() - 60_000).toISOString(),
              validTo: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
              status: "ACTIVE",
            }),
          },
        )
        expect(((yield* agreement.json) as { status?: string }).status).toBe("ACTIVE")

        const queued = yield* requestInDirectory(
          EnterprisePaths.revocationOutbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              subjectId: "node-bad",
              reason: "compromised",
            }),
          },
        )
        const queuedBody = (yield* queued.json) as {
          kind: string
          record?: { deliveryId: string }
        }
        expect(queuedBody.kind).toBe("QUEUED")
        expect(queuedBody.record?.deliveryId).toBeTruthy()

        const pending = yield* requestInDirectory(
          EnterprisePaths.revocationOutbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* pending.json).toHaveLength(1)

        const received = yield* requestInDirectory(
          EnterprisePaths.revocationInbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              senderOrgId: "org-b",
              subjectId: "node-bad",
              reason: "compromised",
            }),
          },
        )
        expect(((yield* received.json) as { kind?: string }).kind).toBe("RECEIVED")

        const duplicate = yield* requestInDirectory(
          EnterprisePaths.revocationInbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              senderOrgId: "org-b",
              subjectId: "node-bad",
              reason: "compromised",
            }),
          },
        )
        expect(((yield* duplicate.json) as { kind?: string }).kind).toBe("RECEIVED")

        const inbox = yield* requestInDirectory(
          EnterprisePaths.revocationInbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* inbox.json).toHaveLength(1)

        const unknownAgreement = yield* requestInDirectory(
          EnterprisePaths.revocationOutbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-unknown",
              subjectId: "node-other",
              reason: "compromised",
            }),
          },
        )
        expect(((yield* unknownAgreement.json) as { kind?: string }).kind).toBe("REJECTED")

        const delivered = yield* requestInDirectory(
          EnterprisePaths.revocationDelivered
            .replace(":tenantId", "tenant-a")
            .replace(":deliveryId", queuedBody.record?.deliveryId ?? ""),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify({}) },
        )
        expect(((yield* delivered.json) as { ok?: boolean }).ok).toBe(true)

        const outboxAfter = yield* requestInDirectory(
          EnterprisePaths.revocationOutbox.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(yield* outboxAfter.json).toHaveLength(0)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
