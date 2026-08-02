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

describe("enterprise HttpApi reliability, federation, and commercial readiness (F7, F8, F12)", () => {
  it.instance(
    "records backups, restores only with matching digests, and evaluates drills against RPO/RTO",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-r", headers)

        const backup = yield* requestInDirectory(
          EnterprisePaths.backup.replace(":tenantId", "tenant-r"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ backupId: "backup-1", kind: "DATABASE", digest: "abc123" }),
          },
        )
        expect(((yield* backup.json) as { backupId?: string }).backupId).toBe("backup-1")

        const tampered = yield* requestInDirectory(
          EnterprisePaths.restore
            .replace(":tenantId", "tenant-r")
            .replace(":backupId", "backup-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ presentedDigest: "tampered" }),
          },
        )
        expect(((yield* tampered.json) as { kind?: string }).kind).toBe("REJECTED")

        const restored = yield* requestInDirectory(
          EnterprisePaths.restore
            .replace(":tenantId", "tenant-r")
            .replace(":backupId", "backup-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ presentedDigest: "abc123" }),
          },
        )
        const restoredBody = (yield* restored.json) as {
          kind: string
          record?: { restoredAt?: string }
        }
        expect(restoredBody.kind).toBe("RESTORED")
        expect(restoredBody.record?.restoredAt).toBeTruthy()

        const passingDrill = yield* requestInDirectory(
          EnterprisePaths.drill.replace(":tenantId", "tenant-r"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              drillId: "drill-1",
              startedAt: "2026-08-02T00:00:00.000Z",
              finishedAt: "2026-08-02T00:05:00.000Z",
              restoredDigest: "abc123",
              measuredRpoMs: 10_000,
              measuredRtoMs: 60_000,
            }),
          },
        )
        expect(((yield* passingDrill.json) as { result?: { pass?: boolean } }).result?.pass).toBe(true)

        const failingDrill = yield* requestInDirectory(
          EnterprisePaths.drill.replace(":tenantId", "tenant-r"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              drillId: "drill-2",
              startedAt: "2026-08-02T00:00:00.000Z",
              finishedAt: "2026-08-02T00:05:00.000Z",
              restoredDigest: "abc123",
              measuredRpoMs: 10_000,
              measuredRtoMs: 99_999_999,
            }),
          },
        )
        const failingBody = (yield* failingDrill.json) as {
          result?: { pass?: boolean; violations?: string[] }
        }
        expect(failingBody.result?.pass).toBe(false)
        expect(failingBody.result?.violations?.length).toBeGreaterThan(0)

        const drills = yield* requestInDirectory(
          EnterprisePaths.drills.replace(":tenantId", "tenant-r"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* drills.json)).toHaveLength(2)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "stores federation agreements, exchanges proofs, propagates revocations, and intersects authority",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-f", headers)

        const now = new Date()
        const agreementBody = {
          agreementId: "agree-1",
          version: 1,
          orgA: "org-a",
          orgB: "org-f",
          audienceRestrictions: ["audience-x"],
          validFrom: new Date(now.getTime() - 60_000).toISOString(),
          validTo: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          status: "ACTIVE",
        }
        const created = yield* requestInDirectory(
          EnterprisePaths.federationAgreements.replace(":tenantId", "tenant-f"),
          tmp.directory,
          { method: "POST", headers, body: JSON.stringify(agreementBody) },
        )
        expect(((yield* created.json) as { status?: string }).status).toBe("ACTIVE")

        const fingerprint = "a".repeat(64)
        const exchanged = yield* requestInDirectory(
          EnterprisePaths.federationExchange.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              orgId: "org-f",
              remoteProofId: "remote-proof-1",
              fingerprint,
              origin: "org-a",
            }),
          },
        )
        expect(((yield* exchanged.json) as { kind?: string }).kind).toBe("EXCHANGED")

        const badFingerprint = yield* requestInDirectory(
          EnterprisePaths.federationExchange.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              orgId: "org-f",
              remoteProofId: "remote-proof-2",
              fingerprint: "not-hex",
              origin: "org-a",
            }),
          },
        )
        expect(((yield* badFingerprint.json) as { kind?: string }).kind).toBe("REJECTED")

        const revoked = yield* requestInDirectory(
          EnterprisePaths.federationRevoke.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              orgId: "org-f",
              subjectId: "node-bad",
              reason: "compromised",
            }),
          },
        )
        expect(((yield* revoked.json) as { subjectId?: string }).subjectId).toBe("node-bad")

        const exchanges = yield* requestInDirectory(
          `${EnterprisePaths.federationExchanges.replace(":tenantId", "tenant-f")}?orgId=org-f`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* exchanges.json)).toHaveLength(1)

        const revocations = yield* requestInDirectory(
          `${EnterprisePaths.federationRevocations.replace(":tenantId", "tenant-f")}?orgId=org-f`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* revocations.json)).toHaveLength(1)

        const intersected = yield* requestInDirectory(
          EnterprisePaths.federationIntersect.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              localActions: ["execute", "read", "write"],
              localResources: ["/tmp/*", "/etc/*"],
              remoteActions: ["execute", "read"],
              remoteResources: ["/tmp/*", "/var/*"],
            }),
          },
        )
        const intersection = (yield* intersected.json) as {
          allowed: boolean
          scope?: { actions: string[]; resources: string[] }
        }
        expect(intersection.allowed).toBe(true)
        expect(intersection.scope?.actions.sort()).toEqual(["execute", "read"])
        expect(intersection.scope?.resources).toEqual(["/tmp/*"])

        const disjoint = yield* requestInDirectory(
          EnterprisePaths.federationIntersect.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-1",
              localActions: ["delete"],
              localResources: ["/tmp/*"],
              remoteActions: ["execute"],
              remoteResources: ["/tmp/*"],
            }),
          },
        )
        expect(((yield* disjoint.json) as { allowed?: boolean }).allowed).toBe(false)

        const expiredAgreement = yield* requestInDirectory(
          EnterprisePaths.federationAgreements.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              ...agreementBody,
              agreementId: "agree-expired",
              validTo: new Date(now.getTime() - 60_000).toISOString(),
            }),
          },
        )
        expect(expiredAgreement.status).toBe(200)

        const expiredExchange = yield* requestInDirectory(
          EnterprisePaths.federationExchange.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-expired",
              orgId: "org-f",
              remoteProofId: "remote-proof-3",
              fingerprint,
              origin: "org-a",
            }),
          },
        )
        expect(((yield* expiredExchange.json) as { kind?: string }).kind).toBe("REJECTED")

        const unknownExchange = yield* requestInDirectory(
          EnterprisePaths.federationExchange.replace(":tenantId", "tenant-f"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              agreementId: "agree-unknown",
              orgId: "org-f",
              remoteProofId: "remote-proof-4",
              fingerprint,
              origin: "org-a",
            }),
          },
        )
        expect(((yield* unknownExchange.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "checks entitlements, keeps metering out of security decisions, redacts diagnostics, and serves upgrade policy",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-cm", headers)

        const team = yield* requestInDirectory(
          EnterprisePaths.entitlement.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ tier: "TEAM", feature: "shared_policy" }),
          },
        )
        expect(((yield* team.json) as { entitled?: boolean }).entitled).toBe(true)

        const community = yield* requestInDirectory(
          EnterprisePaths.entitlement.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ tier: "COMMUNITY", feature: "fleet_control" }),
          },
        )
        expect(((yield* community.json) as { entitled?: boolean }).entitled).toBe(false)

        const enterprise = yield* requestInDirectory(
          EnterprisePaths.entitlement.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ tier: "ENTERPRISE", feature: "federation" }),
          },
        )
        expect(((yield* enterprise.json) as { entitled?: boolean }).entitled).toBe(true)

        const metered = yield* requestInDirectory(
          EnterprisePaths.meteringCheck.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ decision: "DENY", meteringOk: false, overQuota: true }),
          },
        )
        expect(((yield* metered.json) as { decision?: string }).decision).toBe("DENY")

        const redacted = yield* requestInDirectory(
          EnterprisePaths.diagnostics.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              diagnostics: {
                version: "1.0.0",
                runtime: { node: "supersecret-node" },
                config: { apiKey: "supersecret", region: "US" },
                logs: ["token supersecret"],
              },
              secretFragments: ["supersecret"],
            }),
          },
        )
        const redactedBody = (yield* redacted.json) as {
          runtime: Record<string, string>
          config: Record<string, string>
          logs: string[]
        }
        expect(redactedBody.runtime.node).toBe("[REDACTED]-node")
        expect(redactedBody.config.apiKey).toBe("[REDACTED]")
        expect(redactedBody.logs[0]).toBe("token [REDACTED]")

        const upgrade = yield* requestInDirectory(
          EnterprisePaths.upgradePolicy.replace(":tenantId", "tenant-cm"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* upgrade.json)).toMatchObject({ rollbackAllowed: true })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
