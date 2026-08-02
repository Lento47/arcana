import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { createJoinToken } from "@arcana/core/crypto/node-enrollment"
import { EnrollmentPaths } from "../../src/server/routes/instance/httpapi/groups/enrollment"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED
const originalOrgId = process.env.ARCANA_CONTROL_ORGANIZATION_ID

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const issuerSeed = new Uint8Array(32).fill(0xcd)
const issuerKey = ed25519.keygen(issuerSeed)
const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0xee))

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  if (originalOrgId === undefined) delete process.env.ARCANA_CONTROL_ORGANIZATION_ID
  else process.env.ARCANA_CONTROL_ORGANIZATION_ID = originalOrgId
  await disposeAllInstances()
  await resetDatabase()
})

function configure() {
  process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
  process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
  process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
  process.env.ARCANA_CONTROL_ORGANIZATION_ID = "org-arcana"
}

function joinTokenBody(nodeId: string, publicKey: Uint8Array, overrides: Partial<{ trustDomain: string; organizationId: string }> = {}) {
  return {
    joinToken: createJoinToken(
      {
        organizationId: overrides.organizationId ?? "org-arcana",
        trustDomain: overrides.trustDomain ?? "arcana.test",
        nodeId,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      issuerKey.secretKey,
    ),
    publicKey: encodeBase64url(publicKey),
  }
}

describe("enrollment HttpApi (D-1)", () => {
  it.instance(
    "enrolls, reads, duplicates, suspends, and decommissions",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const enrolled = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-alpha", nodeKey.publicKey)),
        })
        expect(enrolled.status).toBe(200)
        const enrolledBody = (yield* enrolled.json) as {
          kind: string
          record?: { status: string; nodeKeyEpoch: number; certificate: { issuerId: string } }
        }
        expect(enrolledBody.kind).toBe("ENROLLED")
        expect(enrolledBody.record?.status).toBe("TRUSTED")
        expect(enrolledBody.record?.nodeKeyEpoch).toBe(1)
        expect(enrolledBody.record?.certificate.issuerId).toBe("issuer-arcana")

        const get = yield* requestInDirectory(
          EnrollmentPaths.get.replace(":nodeId", "node-alpha"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(get.status).toBe(200)
        expect(((yield* get.json) as { status?: string }).status).toBe("TRUSTED")

        const dup = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-alpha", nodeKey.publicKey)),
        })
        const dupBody = (yield* dup.json) as { kind?: string; name?: string; message?: string }
        if (dupBody.kind !== "DUPLICATE_ENROLLMENT") {
          console.log("DUP STATUS", dup.status, "BODY", JSON.stringify(dupBody))
        }
        expect(dupBody.kind).toBe("DUPLICATE_ENROLLMENT")

        const suspended = yield* requestInDirectory(
          EnrollmentPaths.status.replace(":nodeId", "node-alpha"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ status: "SUSPENDED" }),
          },
        )
        expect(((yield* suspended.json) as { ok?: boolean }).ok).toBe(true)

        const revoked = yield* requestInDirectory(
          EnrollmentPaths.status.replace(":nodeId", "node-alpha"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ status: "REVOKED" }),
          },
        )
        expect(((yield* revoked.json) as { ok?: boolean }).ok).toBe(true)

        const reenroll = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-alpha", nodeKey.publicKey)),
        })
        expect(((yield* reenroll.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects a token from a different trust domain",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        const res = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-alpha", nodeKey.publicKey, { trustDomain: "other.corp" })),
        })
        expect(res.status).toBe(200)
        expect((yield* res.json)).toMatchObject({ kind: "REJECTED" })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "fails closed without issuer material",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        delete process.env.ARCANA_CONTROL_ISSUER_SEED

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        const res = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(joinTokenBody("node-alpha", nodeKey.publicKey)),
        })
        expect(res.status).toBe(200)
        expect((yield* res.json)).toMatchObject({ kind: "REJECTED" })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
