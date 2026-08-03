/**
 * BLK-F-AUTH-01: authenticated administrative identity boundary.
 *
 * Enterprise admin mutations must derive actor and tenant identity from the
 * authenticated server context. Client-supplied actorUserId / approvedBy /
 * requestedBy / who / tenantId body fields must never establish authority or
 * audit attribution. These fixtures fail closed:
 *   - cross-tenant impersonation (principal bound to tenant-a claims tenant-b)
 *   - tenant-id squatting on an existing organization
 *   - forged approver / actor attribution
 *   - audit records bound to the authenticated principal (including the
 *     Basic-auth username when the server requires auth)
 *
 * Each fixture builds its own web handler with an explicit ConfigProvider
 * (mirroring httpapi-instance-route-auth.test.ts), so auth configuration is
 * per-test and never depends on process env mutation.
 */
import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { EnterprisePaths } from "../../src/server/routes/instance/httpapi/groups/enterprise"
import { PolicyPaths } from "../../src/server/routes/instance/httpapi/groups/policy"
import { controlStateFor } from "../../src/server/routes/instance/httpapi/handlers/control-state"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { ServerAuth } from "../../src/server/auth"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED
const originalIssuerId = process.env.ARCANA_CONTROL_ISSUER_ID

const issuerSeed = new Uint8Array(32).fill(0x99)
const issuerKey = ed25519.keygen(issuerSeed)

afterEach(async () => {
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  if (originalIssuerId === undefined) delete process.env.ARCANA_CONTROL_ISSUER_ID
  else process.env.ARCANA_CONTROL_ISSUER_ID = originalIssuerId
  await disposeAllInstances()
  await resetDatabase()
})

function app(input: { password?: string; username?: string }) {
  const handler = HttpRouter.toWebHandler(
    HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            ARCANA_SERVER_PASSWORD: input.password,
            ARCANA_SERVER_USERNAME: input.username,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    fetch: (request: Request) => handler(request, HttpApiApp.context),
    request(input: string | URL | Request, init?: RequestInit) {
      return this.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init))
    },
  }
}

function basic(username: string, password: string) {
  return ServerAuth.header({ username, password }) ?? ""
}

function policyEnvelope(sequence: number): SignedPolicyEnvelope {
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
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

function jsonHeaders(directory: string, authorization?: string) {
  return {
    "x-opencode-directory": directory,
    "content-type": "application/json",
    ...(authorization ? { authorization } : {}),
  }
}

function proofJson() {
  return JSON.stringify({
    id: "proof-1",
    schema_version: "0.2",
    timestamp: "2026-08-02T00:00:00.000Z",
    lifecycle: { status: "COMPLETE", started_at: "2026-08-02T00:00:00.000Z" },
    events: [{ id: "evt-1", timestamp: "2026-08-02T00:00:00.000Z", type: "authorization.allowed" }],
  })
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("enterprise HttpApi authenticated identity boundary (BLK-F-AUTH-01)", () => {
  test("rejects cross-tenant impersonation and tenant-id squatting (fail closed)", async () => {
    Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const server = app({})
    const hdrs = jsonHeaders(tmp.path)

    // The authenticated principal (local-operator) creates tenant-a and is
    // bound as OWNER by the server.
    const created = await server.request(EnterprisePaths.createOrganization, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ tenantId: "tenant-a", name: "Acme" }),
    })
    expect(created.status).toBe(200)

    // tenant-b exists in server state, but the principal has no role there.
    const state = controlStateFor(tmp.path)
    state.tenants.putOrganization({
      tenantId: "tenant-b",
      id: "org-tenant-b",
      name: "Other Corp",
      createdAt: new Date().toISOString(),
    })
    state.identity.assignRole({
      tenantId: "tenant-b",
      userId: "u-other",
      role: "ADMIN",
      assignedAt: new Date().toISOString(),
    })

    // Every mutation in tenant-b fails closed for the unbound principal.
    const role = await server.request(EnterprisePaths.assignRole.replace(":tenantId", "tenant-b"), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ userId: "u-x", role: "ADMIN" }),
    })
    expect(role.status).toBe(403)

    const approval = await server.request(
      EnterprisePaths.createApproval.replace(":tenantId", "tenant-b"),
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          approvalId: "appr-1",
          requestHash: "hash-appr-1",
          requesterId: "u-agent",
          exactRequestJson: JSON.stringify({ requestHash: "hash-appr-1" }),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      },
    )
    expect(approval.status).toBe(403)

    // Claiming an existing tenantId in the createOrganization body fails closed.
    const squat = await server.request(EnterprisePaths.createOrganization, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ tenantId: "tenant-b", name: "Impostor" }),
    })
    expect(squat.status).toBe(403)

    // The claimed tenant record was never overwritten.
    expect(state.tenants.getOrganization("tenant-b")?.name).toBe("Other Corp")
  })

  test("ignores forged actor fields; attribution and decisions bind to the authenticated principal", async () => {
    Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const server = app({})
    const hdrs = jsonHeaders(tmp.path)

    const created = await server.request(EnterprisePaths.createOrganization, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ tenantId: "tenant-a", name: "Acme" }),
    })
    expect(created.status).toBe(200)

    for (const approvalId of ["appr-1", "appr-2"]) {
      const queued = await server.request(
        EnterprisePaths.createApproval.replace(":tenantId", "tenant-a"),
        {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            approvalId,
            requestHash: `hash-${approvalId}`,
            requesterId: "u-agent",
            exactRequestJson: JSON.stringify({ requestHash: `hash-${approvalId}` }),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }),
        },
      )
      expect(queued.status).toBe(200)
    }

    // Forged actorUserId equal to the REQUESTER must not trigger the
    // separation-of-duties rejection: the decision binds to the
    // authenticated principal (local-operator), not the body field.
    const decided = await server.request(
      EnterprisePaths.decideApproval.replace(":tenantId", "tenant-a").replace(":approvalId", "appr-1"),
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          actorUserId: "u-agent",
          decision: "APPROVE",
          inspectedRequestJson: JSON.stringify({ requestHash: "hash-appr-1" }),
        }),
      },
    )
    expect((await json(decided)).kind).toBe("DECIDED")

    // A forged approver with no role is ignored as well.
    const decided2 = await server.request(
      EnterprisePaths.decideApproval.replace(":tenantId", "tenant-a").replace(":approvalId", "appr-2"),
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          actorUserId: "u-stranger",
          decision: "APPROVE",
          inspectedRequestJson: JSON.stringify({ requestHash: "hash-appr-2" }),
        }),
      },
    )
    expect((await json(decided2)).kind).toBe("DECIDED")

    const approvals = await server.request(EnterprisePaths.approvals.replace(":tenantId", "tenant-a"), {
      method: "GET",
      headers: hdrs,
    })
    const approvalsBody = (await approvals.json()) as Array<{ approvalId: string; status: string }>
    expect(approvalsBody.find((a) => a.approvalId === "appr-1")?.status).toBe("APPROVED")
    expect(approvalsBody.find((a) => a.approvalId === "appr-2")?.status).toBe("APPROVED")

    // Chain-of-custody attribution is the authenticated principal, never
    // the forged body-supplied who.
    const archived = await server.request(EnterprisePaths.archiveProof.replace(":tenantId", "tenant-a"), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        proofId: "proof-1",
        proofJson: proofJson(),
        source: "test",
        retentionUntil: "2029-01-01T00:00:00.000Z",
      }),
    })
    const archivedBody = (await json(archived)) as { kind: string; record?: { archiveId: string } }
    expect(archivedBody.kind).toBe("ARCHIVED")
    const archiveId = archivedBody.record?.archiveId
    expect(archiveId).toBeTruthy()

    const custody = await server.request(
      EnterprisePaths.custody.replace(":tenantId", "tenant-a").replace(":archiveId", archiveId!),
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ who: "forged-auditor", action: "exported" }),
      },
    )
    expect((await json(custody)).ok).toBe(true)

    const exported = await server.request(
      EnterprisePaths.exportArchive.replace(":tenantId", "tenant-a").replace(":archiveId", archiveId!),
      { method: "GET", headers: hdrs },
    )
    const exportedBody = (await json(exported)) as { kind: string; custody: Array<{ who: string }> }
    expect(exportedBody.kind).toBe("EXPORTED")
    expect(exportedBody.custody[0]?.who).toBe("local-operator")
  })

  test("derives actor and tenant identity from the authenticated Basic auth context", async () => {
    process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
    process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
    Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const server = app({ password: "s3cret", username: "alice" })
    const hdrs = jsonHeaders(tmp.path, basic("alice", "s3cret"))

    // alice creates an organization; the server binds alice as OWNER.
    const created = await server.request(EnterprisePaths.createOrganization, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ tenantId: "tenant-a", name: "Acme" }),
    })
    expect(created.status).toBe(200)

    const role = await server.request(EnterprisePaths.assignRole.replace(":tenantId", "tenant-a"), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ userId: "u-ops", role: "OPERATOR" }),
    })
    expect(role.status).toBe(200)

    // tenant-b exists server-side without an alice binding: fail closed.
    const state = controlStateFor(tmp.path)
    state.tenants.putOrganization({
      tenantId: "tenant-b",
      id: "org-tenant-b",
      name: "Other Corp",
      createdAt: new Date().toISOString(),
    })
    state.identity.assignRole({
      tenantId: "tenant-b",
      userId: "u-other",
      role: "ADMIN",
      assignedAt: new Date().toISOString(),
    })
    const cross = await server.request(EnterprisePaths.assignRole.replace(":tenantId", "tenant-b"), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ userId: "u-x", role: "ADMIN" }),
    })
    expect(cross.status).toBe(403)

    // Forged approver attribution is ignored; the F2 privileged audit
    // records the authenticated principal (alice).
    const published = await server.request(PolicyPaths.publish, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        envelope: policyEnvelope(1),
        activationTime: new Date().toISOString(),
      }),
    })
    expect((await json(published)).kind).toBe("PUBLISHED")

    const forged = await server.request(EnterprisePaths.promotePolicy.replace(":tenantId", "tenant-a"), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        sourceSequence: 1,
        targetEnvironment: "prod",
        requestedBy: "u-agent",
        approvedBy: "u-member",
      }),
    })
    expect((await json(forged)).kind).toBe("PROMOTED")

    const audit = await server.request(EnterprisePaths.audit.replace(":tenantId", "tenant-a"), {
      method: "GET",
      headers: hdrs,
    })
    const auditBody = (await audit.json()) as Array<{ action: string; outcome: string; actorUserId: string }>
    expect(
      auditBody.some(
        (e) => e.action === "policy.publish" && e.outcome === "ALLOWED" && e.actorUserId === "alice",
      ),
    ).toBe(true)
    expect(auditBody.some((e) => e.action === "policy.publish" && e.actorUserId === "u-member")).toBe(false)
  })
})
