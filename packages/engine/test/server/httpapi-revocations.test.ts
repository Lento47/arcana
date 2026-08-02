import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { REVOCATION_DOMAIN } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { RevocationPaths } from "../../src/server/routes/instance/httpapi/groups/revocations"
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
