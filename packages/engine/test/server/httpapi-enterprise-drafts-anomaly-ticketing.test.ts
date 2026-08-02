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

const issuerSeed = new Uint8Array(32).fill(0x42)
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

describe("enterprise HttpApi drafts, anomaly scan, and ticketing (F3, F9, F11)", () => {
  it.instance(
    "validates policy drafts without publishing them",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-a", headers)

        const published = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(1),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* published.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const validDraft = yield* requestInDirectory(
          EnterprisePaths.validatePolicyDraft.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ envelope: policyEnvelope(2, "digest-1") }),
          },
        )
        const validBody = (yield* validDraft.json) as { valid: boolean; record?: { sequence: number } }
        expect(validBody.valid).toBe(true)
        expect(validBody.record?.sequence).toBe(2)

        const forged = policyEnvelope(2, "digest-1")
        forged.signature = "A".repeat(64)
        const invalid = yield* requestInDirectory(
          EnterprisePaths.validatePolicyDraft.replace(":tenantId", "tenant-a"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ envelope: forged }),
          },
        )
        expect(((yield* invalid.json) as { valid?: boolean }).valid).toBe(false)

        // Nothing was persisted: the live chain still ends at sequence 1.
        const current = yield* requestInDirectory(PolicyPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect(((yield* current.json) as { sequence?: number }).sequence).toBe(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "runs anomaly heuristics and records signals through security alerts",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-b", headers)

        const scan = yield* requestInDirectory(
          EnterprisePaths.anomalyScan.replace(":tenantId", "tenant-b"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              alertsLastHour: 12,
              revocationsLastHour: 0,
              maxProofBacklog: 0,
              staleNodeCount: 0,
              totalNodeCount: 0,
            }),
          },
        )
        const signals = (yield* scan.json) as Array<{ kind: string; severity: string }>
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({ kind: "alert_burst", severity: "HIGH" })

        const alerts = yield* requestInDirectory(
          EnterprisePaths.alerts.replace(":tenantId", "tenant-b"),
          tmp.directory,
          { method: "GET", headers },
        )
        const alertBody = (yield* alerts.json) as Array<{ kind: string }>
        expect(alertBody).toMatchObject([{ kind: "anomaly.alert_burst" }])

        const quiet = yield* requestInDirectory(
          EnterprisePaths.anomalyScan.replace(":tenantId", "tenant-b"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              alertsLastHour: 1,
              revocationsLastHour: 0,
              maxProofBacklog: 10,
              staleNodeCount: 1,
              totalNodeCount: 10,
            }),
          },
        )
        expect(yield* quiet.json).toEqual([])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "exports canonical ticketing payloads from admin events",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        yield* createOrg(tmp.directory, "tenant-c", headers)

        for (const event of [
          { kind: "approval.pending", approvalId: "appr-1", requestHash: "hash-1" },
          { kind: "alert.critical", alertId: "alert-1" },
        ]) {
          const recorded = yield* requestInDirectory(
            EnterprisePaths.adminEvents.replace(":tenantId", "tenant-c"),
            tmp.directory,
            { method: "POST", headers, body: JSON.stringify(event) },
          )
          expect(((yield* recorded.json) as { kind?: string }).kind).toBe(event.kind)
        }

        const tickets = yield* requestInDirectory(
          EnterprisePaths.ticketingExport.replace(":tenantId", "tenant-c"),
          tmp.directory,
          { method: "GET", headers },
        )
        const ticketBody = (yield* tickets.json) as Array<{
          title: string
          priority: string
          labels: string[]
        }>
        expect(ticketBody).toHaveLength(2)
        expect(ticketBody[0]).toMatchObject({ title: "Approval pending: appr-1", priority: "medium" })
        expect(ticketBody[1]).toMatchObject({ title: "Critical alert: alert-1", priority: "urgent" })
        expect(ticketBody[1]?.labels).toContain("security")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
