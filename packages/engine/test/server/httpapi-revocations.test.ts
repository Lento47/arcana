import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { REVOCATION_DOMAIN } from "@arcana/core/crypto/signed-envelopes"
import { createJoinToken, signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { signSyncRequest, type SignedSyncEnvelope } from "@arcana/core/crypto/sync-transport"
import type { SyncRequestContext } from "@arcana/core/crypto/sync-auth"
import { RevocationPaths } from "../../src/server/routes/instance/httpapi/groups/revocations"
import { EnrollmentPaths } from "../../src/server/routes/instance/httpapi/groups/enrollment"
import { SyncNodePaths } from "../../src/server/routes/instance/httpapi/groups/sync-node"
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

const issuerSeed = new Uint8Array(32).fill(0x91)
const issuerKey = ed25519.keygen(issuerSeed)
const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0xa2))

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

function statement(sequence: number, subjectId = "grant-1") {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType: "GRANT",
    subjectId,
    reason: "compromised",
    effectiveAt: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
  }
  return signEnvelope(REVOCATION_DOMAIN, payload, issuerKey.secretKey)
}

describe("revocations HttpApi (D-5)", () => {
  it.instance(
    "emergency-deny revokes the node and propagates through sync",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const enrolled = yield* requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            joinToken: createJoinToken(
              {
                organizationId: "org-arcana",
                trustDomain: "arcana.test",
                nodeId: "node-alpha",
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
              },
              issuerKey.secretKey,
            ),
            publicKey: encodeBase64url(nodeKey.publicKey),
          }),
        })
        expect(((yield* enrolled.json) as { kind?: string }).kind).toBe("ENROLLED")

        const emergency = yield* requestInDirectory(RevocationPaths.emergency, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ nodeId: "node-alpha", reason: "compromised node" }),
        })
        const emergencyBody = (yield* emergency.json) as {
          kind: string
          record?: { subjectType: string; subjectId: string }
        }
        expect(emergencyBody.kind).toBe("PUBLISHED")
        expect(emergencyBody.record?.subjectType).toBe("NODE")
        expect(emergencyBody.record?.subjectId).toBe("node-alpha")

        const record = yield* requestInDirectory(
          EnrollmentPaths.get.replace(":nodeId", "node-alpha"),
          tmp.directory,
          { method: "GET", headers },
        )
        expect(((yield* record.json) as { status?: string }).status).toBe("REVOKED")

        const syncRequest = signSyncRequest(
          {
            protocolVersion: 1,
            requestId: "req-emergency-1",
            clientNonce: "nonce-1",
            trustDomain: "arcana.test",
            nodeId: "node-alpha",
            nodeCertificateFingerprint: "fp",
            nodeKeyEpoch: 1,
            acceptedPolicySequence: 0,
            acceptedRevocationSequence: 0,
            acceptedEmergencyEpoch: 0,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          },
          nodeKey.secretKey,
        )
        const sync = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(syncRequest),
        })
        expect(sync.status).toBe(401)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "publishes, reads current, and rejects rollback/forgery",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const current0 = yield* requestInDirectory(RevocationPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect(yield* current0.json).toBeNull()

        const published = yield* requestInDirectory(RevocationPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ statement: statement(1) }),
        })
        const publishedBody = (yield* published.json) as { kind: string; record?: { sequence: number } }
        expect(publishedBody.kind).toBe("PUBLISHED")
        expect(publishedBody.record?.sequence).toBe(1)

        const current = yield* requestInDirectory(RevocationPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect(((yield* current.json) as { sequence?: number }).sequence).toBe(1)

        const rollback = yield* requestInDirectory(RevocationPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ statement: statement(1, "grant-2") }),
        })
        expect(((yield* rollback.json) as { kind?: string }).kind).toBe("REJECTED")

        const forged = statement(2)
        forged.signature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        const forgedRes = yield* requestInDirectory(RevocationPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ statement: forged }),
        })
        expect(((yield* forgedRes.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
