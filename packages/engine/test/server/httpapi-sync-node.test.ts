import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { createJoinToken } from "@arcana/core/crypto/node-enrollment"
import { POLICY_DOMAIN, type SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import {
  signSyncRequest,
  verifySyncResponse,
  type SignedSyncEnvelope,
} from "@arcana/core/crypto/sync-transport"
import type { SyncRequestContext } from "@arcana/core/crypto/sync-auth"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import { SyncNodePaths } from "../../src/server/routes/instance/httpapi/groups/sync-node"
import { EnrollmentPaths } from "../../src/server/routes/instance/httpapi/groups/enrollment"
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

const issuerSeed = new Uint8Array(32).fill(0x12)
const issuerKey = ed25519.keygen(issuerSeed)
const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x34))
const forgedKey = ed25519.keygen(new Uint8Array(32).fill(0x56))

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

function requestEnvelope(
  overrides: Partial<SyncRequestContext> = {},
  secretKey: Uint8Array = nodeKey.secretKey,
): SignedSyncEnvelope<SyncRequestContext> {
  const context: SyncRequestContext = {
    protocolVersion: 1,
    requestId: "req-sync-1",
    clientNonce: "nonce-1",
    trustDomain: "arcana.test",
    nodeId: "node-alpha",
    nodeCertificateFingerprint: "fp-1",
    nodeKeyEpoch: 1,
    acceptedPolicySequence: 0,
    acceptedRevocationSequence: 0,
    acceptedEmergencyEpoch: 0,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  }
  return signSyncRequest(context, secretKey)
}

function policyEnvelope(sequence: number, previousPolicyDigest?: string): SignedPolicyEnvelope {
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
  }
  return signEnvelope(POLICY_DOMAIN, payload, issuerKey.secretKey) as unknown as SignedPolicyEnvelope
}

describe("syncNode HttpApi (D-6B-T)", () => {
  it.instance(
    "serves signed policy sync with replay idempotency and conflict detection",
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

        const published = yield* requestInDirectory(PolicyPaths.publish, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            envelope: policyEnvelope(1),
            activationTime: new Date().toISOString(),
          }),
        })
        expect(((yield* published.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const envelope = requestEnvelope()
        const res = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(envelope),
        })
        expect(res.status).toBe(200)
        const body = (yield* res.json) as {
          kind: string
          envelope: SignedSyncEnvelope<SyncResponseContext>
        }
        expect(body.kind).toBe("RESPONSE")

        const verified = verifySyncResponse(body.envelope, issuerKey.publicKey, {
          nodeId: "node-alpha",
          requestId: "req-sync-1",
          clientNonce: "nonce-1",
          now: new Date(),
        })
        expect(verified).toEqual({ valid: true })
        expect(body.envelope.context.responseKind).toBe("POLICY_SNAPSHOT")
        expect(body.envelope.context.policySequence).toBe(1)
        expect(body.envelope.context.envelope?.policyDigest).toBe("digest-1")

        // Idempotent retry: identical request → identical stored response.
        const replay = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(envelope),
        })
        const replayBody = (yield* replay.json) as {
          envelope: SignedSyncEnvelope<SyncResponseContext>
        }
        expect(replayBody.envelope.context.serverNonce).toBe(body.envelope.context.serverNonce)

        // Conflict: same requestId, different nonce.
        const conflict = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(requestEnvelope({ clientNonce: "nonce-2" })),
        })
        expect(conflict.status).toBe(401)

        // Caught-up node receives NO_CHANGE.
        const caughtUp = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(
            requestEnvelope({
              requestId: "req-sync-2",
              clientNonce: "nonce-2",
              acceptedPolicySequence: 1,
              acceptedPolicyDigest: "digest-1",
            }),
          ),
        })
        const caughtUpBody = (yield* caughtUp.json) as {
          envelope: SignedSyncEnvelope<SyncResponseContext>
        }
        expect(caughtUpBody.envelope.context.responseKind).toBe("NO_CHANGE")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects unknown, forged, and suspended nodes",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const unknown = yield* requestInDirectory(SyncNodePaths.revocation, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(requestEnvelope({ nodeId: "node-stranger" })),
        })
        expect(unknown.status).toBe(401)

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

        const forged = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(requestEnvelope({}, forgedKey.secretKey)),
        })
        expect(forged.status).toBe(401)

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

        const suspendedSync = yield* requestInDirectory(SyncNodePaths.policy, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(requestEnvelope({ requestId: "req-sync-2", clientNonce: "nonce-3" })),
        })
        expect(suspendedSync.status).toBe(401)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
