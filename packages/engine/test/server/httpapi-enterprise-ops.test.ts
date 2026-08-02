import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { EnterprisePaths } from "../../src/server/routes/instance/httpapi/groups/enterprise"
import { PolicyPaths } from "../../src/server/routes/instance/httpapi/groups/policy"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const issuerSeed = new Uint8Array(32).fill(0x99)
const issuerKey = ed25519.keygen(issuerSeed)

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  await disposeAllInstances()
  await resetDatabase()
})

function configure() {
  process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
  process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
  process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
  process.env.ARCANA_CONTROL_ORGANIZATION_ID = "org-arcana"
}

function policyEnvelope(
  sequence: number,
  previousPolicyDigest?: string,
  overrides: Partial<SignedPolicyEnvelope> = {},
): SignedPolicyEnvelope {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    policyId: "policy-root",
    policyVersion: `1.0.${sequence}`,
    policyDigest: `digest-${sequence}`,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...(previousPolicyDigest !== undefined ? { previousPolicyDigest } : {}),
    ...overrides,
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

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

describe("enterprise HttpApi operations (F3-F6, F9, F10)", () => {
  it.instance(
    "registers fleet nodes, heartbeats, alerts, and runs an audited revocation campaign",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-a", headers)
        yield* assignRole(tmp.directory, "tenant-a", "u-ops", "OPERATOR", headers)

        const register = yield* requestInDirectory(
          EnterprisePaths.registerNode.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              nodeId: "node-1",
              organizationId: "org-tenant-a",
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
        expect(register.status).toBe(200)

        const heartbeat = yield* requestInDirectory(
          EnterprisePaths.heartbeat.replace(":tenantId", "tenant-a").replace(":nodeId", "node-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ policySequence: 2, policyDigest: "digest-2", proofBacklog: 3 }),
          },
        )
        expect(heartbeat.status).toBe(200)

        const fleet = yield* requestInDirectory(
          EnterprisePaths.fleet.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        const fleetBody = (yield* fleet.json) as Array<{ nodeId: string; health: string; proofBacklog: number }>
        expect(fleetBody[0]?.health).toBe("HEALTHY")
        expect(fleetBody[0]?.proofBacklog).toBe(3)

        const alert = yield* requestInDirectory(
          EnterprisePaths.alerts.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              alertId: "alert-1",
              severity: "CRITICAL",
              kind: "policy.mismatch",
              detail: "node policy digest mismatch",
            }),
          },
        )
        expect(alert.status).toBe(200)

        const alerts = yield* requestInDirectory(
          `${EnterprisePaths.alerts.replace(":tenantId", "tenant-a")}?severity=CRITICAL`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect((yield* alerts.json) as Array<{ alertId: string }>).toMatchObject([{ alertId: "alert-1" }])

        const deniedCampaign = yield* requestInDirectory(
          EnterprisePaths.revocationCampaign.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              nodeIds: ["node-1"],
              reason: "compromised",
              actorUserId: "u-stranger",
            }),
          },
        )
        expect(((yield* deniedCampaign.json) as { kind?: string }).kind).toBe("REJECTED")

        const campaign = yield* requestInDirectory(
          EnterprisePaths.revocationCampaign.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              nodeIds: ["node-1"],
              reason: "compromised",
              actorUserId: "u-ops",
            }),
          },
        )
        const campaignBody = (yield* campaign.json) as {
          kind: string
          revokedNodes: string[]
          auditEvents: Array<{ nodeId: string }>
        }
        expect(campaignBody.kind).toBe("RUN")
        expect(campaignBody.revokedNodes).toEqual(["node-1"])
        expect(campaignBody.auditEvents).toHaveLength(1)

        const fleetAfter = yield* requestInDirectory(
          EnterprisePaths.fleet.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(
          ((yield* fleetAfter.json) as Array<{ health: string }>)[0]?.health,
        ).toBe("REVOKED")

        const forensic = yield* requestInDirectory(
          EnterprisePaths.forensicExport.replace(":tenantId", "tenant-a"),
          tmp.directory,
          { method: "GET", headers },
        )
        const forensicBody = (yield* forensic.json) as {
          alerts: Array<{ alertId: string }>
          timeline: Array<{ event: string }>
        }
        expect(forensicBody.alerts).toMatchObject([{ alertId: "alert-1" }])
        expect(forensicBody.timeline.some((e) => e.event.includes("emergency revocation"))).toBe(true)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "emergency-revokes and bulk-denies central approvals under RBAC",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-b", headers)
        yield* assignRole(tmp.directory, "tenant-b", "u-admin", "ADMIN", headers)
        yield* assignRole(tmp.directory, "tenant-b", "u-member", "MEMBER", headers)

        for (const [approvalId, requesterId] of [
          ["appr-1", "u-agent"],
          ["appr-2", "u-agent"],
          ["appr-3", "u-admin"],
        ] as const) {
          const queued = yield* requestInDirectory(
            EnterprisePaths.createApproval.replace(":tenantId", "tenant-b"),
            tmp.directory,
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
          expect(queued.status).toBe(200)
        }

        const unauthorized = yield* requestInDirectory(
          EnterprisePaths.revokeApproval.replace(":tenantId", "tenant-b"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ approvalId: "appr-1", actorUserId: "u-member" }),
          },
        )
        expect(((yield* unauthorized.json) as { kind?: string }).kind).toBe("REJECTED")

        const revoked = yield* requestInDirectory(
          EnterprisePaths.revokeApproval.replace(":tenantId", "tenant-b"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ approvalId: "appr-1", actorUserId: "u-admin" }),
          },
        )
        expect(((yield* revoked.json) as { kind?: string }).kind).toBe("DECIDED")

        const bulk = yield* requestInDirectory(
          EnterprisePaths.bulkDenyApprovals.replace(":tenantId", "tenant-b"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              approvalIds: ["appr-2", "appr-3"],
              actorUserId: "u-admin",
            }),
          },
        )
        const bulkBody = (yield* bulk.json) as { denied: number; skipped: number }
        expect(bulkBody.denied).toBe(1)
        expect(bulkBody.skipped).toBe(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "archives, exports, holds, and retention-sweeps proofs",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-c", headers)

        const proofJson = JSON.stringify({
          id: "proof-1",
          schema_version: "0.2",
          timestamp: "2026-08-02T00:00:00.000Z",
          lifecycle: { status: "COMPLETE", started_at: "2026-08-02T00:00:00.000Z" },
          events: [{ id: "evt-1", timestamp: "2026-08-02T00:00:00.000Z", type: "authorization.allowed" }],
        })
        const archived = yield* requestInDirectory(
          EnterprisePaths.archiveProof.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              proofId: "proof-1",
              proofJson,
              source: "test",
              retentionUntil: "2020-01-01T00:00:00.000Z",
            }),
          },
        )
        const archivedBody = (yield* archived.json) as {
          kind: string
          record?: { archiveId: string; fingerprint: string }
        }
        expect(archivedBody.kind).toBe("ARCHIVED")
        expect(archivedBody.record?.fingerprint).toHaveLength(64)

        const invalid = yield* requestInDirectory(
          EnterprisePaths.archiveProof.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              proofId: "bad",
              proofJson: JSON.stringify({ id: "bad" }),
              source: "test",
              retentionUntil: "2020-01-01T00:00:00.000Z",
            }),
          },
        )
        expect(((yield* invalid.json) as { kind?: string }).kind).toBe("REJECTED")

        const custody = yield* requestInDirectory(
          EnterprisePaths.custody
            .replace(":tenantId", "tenant-c")
            .replace(":archiveId", "arch-proof-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ who: "auditor-1", action: "exported" }),
          },
        )
        expect(((yield* custody.json) as { ok?: boolean }).ok).toBe(true)

        const hold = yield* requestInDirectory(
          EnterprisePaths.legalHold
            .replace(":tenantId", "tenant-c")
            .replace(":archiveId", "arch-proof-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "PLACE" }),
          },
        )
        expect(((yield* hold.json) as { ok?: boolean }).ok).toBe(true)

        const sweepHeld = yield* requestInDirectory(
          EnterprisePaths.retentionSweep.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ now: new Date().toISOString() }),
          },
        )
        expect((yield* sweepHeld.json)).toEqual({ deleted: 0, retainedByHold: 1 })

        const released = yield* requestInDirectory(
          EnterprisePaths.legalHold
            .replace(":tenantId", "tenant-c")
            .replace(":archiveId", "arch-proof-1"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "REMOVE" }),
          },
        )
        expect(((yield* released.json) as { ok?: boolean }).ok).toBe(true)

        const sweepDeleted = yield* requestInDirectory(
          EnterprisePaths.retentionSweep.replace(":tenantId", "tenant-c"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ now: new Date().toISOString() }),
          },
        )
        expect((yield* sweepDeleted.json)).toEqual({ deleted: 1, retainedByHold: 0 })

        const exported = yield* requestInDirectory(
          EnterprisePaths.exportArchive
            .replace(":tenantId", "tenant-c")
            .replace(":archiveId", "arch-proof-1"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(((yield* exported.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "promotes signed policy bundles across environments with RBAC and audits denials",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-d", headers)
        yield* assignRole(tmp.directory, "tenant-d", "u-admin", "ADMIN", headers)
        yield* assignRole(tmp.directory, "tenant-d", "u-member", "MEMBER", headers)

        const published1 = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(1),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* published1.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const promotedGenesis = yield* requestInDirectory(
          EnterprisePaths.promotePolicy.replace(":tenantId", "tenant-d"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              sourceSequence: 1,
              targetEnvironment: "prod",
              requestedBy: "u-agent",
              approvedBy: "u-admin",
            }),
          },
        )
        const genesisBody = (yield* promotedGenesis.json) as { kind: string; reason?: string }
        expect(genesisBody.kind).toBe("PROMOTED")

        const published2 = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(2, "digest-1"),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* published2.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const promoted = yield* requestInDirectory(
          EnterprisePaths.promotePolicy.replace(":tenantId", "tenant-d"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              sourceSequence: 2,
              targetEnvironment: "prod",
              requestedBy: "u-agent",
              approvedBy: "u-admin",
            }),
          },
        )
        const promotedBody = (yield* promoted.json) as {
          kind: string
          record?: { sequence: number }
          promotionId?: string
        }
        expect(promotedBody.kind).toBe("PROMOTED")
        expect(promotedBody.record?.sequence).toBe(2)
        expect(promotedBody.promotionId).toBeTruthy()

        const denied = yield* requestInDirectory(
          EnterprisePaths.promotePolicy.replace(":tenantId", "tenant-d"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              sourceSequence: 2,
              targetEnvironment: "prod",
              requestedBy: "u-agent",
              approvedBy: "u-member",
            }),
          },
        )
        expect(((yield* denied.json) as { kind?: string }).kind).toBe("REJECTED")

        const audit = yield* requestInDirectory(
          EnterprisePaths.audit.replace(":tenantId", "tenant-d"),
          tmp.directory,
          { method: "GET", headers },
        )
        const auditBody = (yield* audit.json) as Array<{
          action: string
          outcome: string
          actorUserId: string
        }>
        expect(
          auditBody.some(
            (e) => e.action === "policy.publish" && e.outcome === "DENIED" && e.actorUserId === "u-member",
          ),
        ).toBe(true)

        const diff = yield* requestInDirectory(
          EnterprisePaths.diffPolicy.replace(":tenantId", "tenant-d"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ beforeSequence: 1, afterSequence: 2 }),
          },
        )
        const diffBody = (yield* diff.json) as { digestChanged: boolean; changes: string[] }
        expect(diffBody.digestChanged).toBe(true)
        expect(diffBody.changes.length).toBeGreaterThan(0)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "applies data governance checks, classification, and PII retention",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-e", headers)

        const blocked = yield* requestInDirectory(
          EnterprisePaths.checkStorable.replace(":tenantId", "tenant-e"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              record: {
                id: "rec-1",
                classification: "SECRET",
                region: "EU",
                createdAt: new Date().toISOString(),
              },
            }),
          },
        )
        expect(((yield* blocked.json) as { allowed?: boolean }).allowed).toBe(false)

        const allowed = yield* requestInDirectory(
          EnterprisePaths.checkStorable.replace(":tenantId", "tenant-e"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              record: {
                id: "rec-1",
                classification: "SECRET",
                region: "EU",
                createdAt: new Date().toISOString(),
              },
              policy: {
                allowedRegions: ["EU"],
                customerManagedKeys: true,
                telemetryOptOut: false,
                piiRetentionMs: 1000,
              },
            }),
          },
        )
        expect(((yield* allowed.json) as { allowed?: boolean }).allowed).toBe(true)

        const exportBlocked = yield* requestInDirectory(
          EnterprisePaths.checkExportable.replace(":tenantId", "tenant-e"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              classification: "PII",
              policy: {
                allowedRegions: ["EU"],
                customerManagedKeys: false,
                telemetryOptOut: true,
                piiRetentionMs: 1000,
              },
            }),
          },
        )
        expect(((yield* exportBlocked.json) as { allowed?: boolean }).allowed).toBe(false)

        const classified = yield* requestInDirectory(
          EnterprisePaths.classify.replace(":tenantId", "tenant-e"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ containsPii: true, sensitivity: "INTERNAL" }),
          },
        )
        expect(((yield* classified.json) as { classification?: string }).classification).toBe("PII")

        const now = new Date()
        const retention = yield* requestInDirectory(
          EnterprisePaths.piiRetention.replace(":tenantId", "tenant-e"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              records: [
                {
                  id: "old-pii",
                  classification: "PII",
                  region: "EU",
                  createdAt: new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
                },
                {
                  id: "fresh-pii",
                  classification: "PII",
                  region: "EU",
                  createdAt: now.toISOString(),
                },
                { id: "secret-rec", classification: "SECRET", region: "EU", createdAt: now.toISOString() },
              ],
              policy: {
                allowedRegions: ["EU"],
                customerManagedKeys: true,
                telemetryOptOut: false,
                piiRetentionMs: 90 * 24 * 60 * 60 * 1000,
              },
              now: now.toISOString(),
            }),
          },
        )
        const retentionBody = (yield* retention.json) as { retained: Array<{ id: string }>; expired: string[] }
        expect(retentionBody.expired).toEqual(["old-pii"])
        expect(retentionBody.retained.map((r) => r.id).sort()).toEqual(["fresh-pii", "secret-rec"])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
