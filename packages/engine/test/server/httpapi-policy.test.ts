import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
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

const issuerSeed = new Uint8Array(32).fill(0x78)
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

describe("policy HttpApi (D-4)", () => {
  it.instance(
    "publishes, chains, reads current, and rolls back",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const current0 = yield* requestInDirectory(PolicyPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect((yield* current0.json)).toBeNull()

        const first = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(1),
            activationTime: new Date().toISOString(),
          }),
        })
        const firstBody = (yield* first.json) as { kind: string; record?: { status: string } }
        expect(firstBody.kind).toBe("PUBLISHED")
        expect(firstBody.record?.status).toBe("ACTIVE")

        const second = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(2, "digest-1"),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* second.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const current = yield* requestInDirectory(PolicyPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect(((yield* current.json) as { sequence?: number }).sequence).toBe(2)

        const rolled = yield* requestInDirectory(PolicyPaths.rollback, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ toSequence: 1 }),
        })
        expect(((yield* rolled.json) as { kind?: string }).kind).toBe("ROLLED_BACK")

        const currentAfter = yield* requestInDirectory(PolicyPaths.current, tmp.directory, {
          method: "GET",
          headers,
        })
        expect(((yield* currentAfter.json) as { sequence?: number }).sequence).toBe(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects unknown policy fields and forged signatures",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const unknownField = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(1, undefined, {
              mandatoryExtension: "unrecognized",
            } as Partial<SignedPolicyEnvelope>),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* unknownField.json) as { kind?: string }).kind).toBe("REJECTED")

        const forged = policyEnvelope(1)
        forged.signature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        const forgedRes = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: forged,
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* forgedRes.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
