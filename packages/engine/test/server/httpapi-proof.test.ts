import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { buildProofBatch } from "@arcana/core/crypto/proof-batching"
import { signProofBatch } from "@arcana/core/crypto/proof-registration"
import { createJoinToken } from "@arcana/core/crypto/node-enrollment"
import { ProofPaths } from "../../src/server/routes/instance/httpapi/groups/proof"
import { EnrollmentPaths } from "../../src/server/routes/instance/httpapi/groups/enrollment"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED
const originalIssuerId = process.env.ARCANA_CONTROL_ISSUER_ID
const originalOrgId = process.env.ARCANA_CONTROL_ORGANIZATION_ID

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x11))
const rotatedKey = ed25519.keygen(new Uint8Array(32).fill(0x22))
const issuerSeed = new Uint8Array(32).fill(0xab)
const issuerKey = ed25519.keygen(issuerSeed)

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  if (originalIssuerId === undefined) delete process.env.ARCANA_CONTROL_ISSUER_ID
  else process.env.ARCANA_CONTROL_ISSUER_ID = originalIssuerId
  if (originalOrgId === undefined) delete process.env.ARCANA_CONTROL_ORGANIZATION_ID
  else process.env.ARCANA_CONTROL_ORGANIZATION_ID = originalOrgId
  await disposeAllInstances()
  await resetDatabase()
})

function makeEnvelope(
  sequences: number[],
  previousBatchRoot?: string,
  secretKey: Uint8Array = nodeKey.secretKey,
  nodeKeyEpoch = 1,
) {
  const built = buildProofBatch(
    sequences.map((seq) => ({
      localSequence: seq,
      runProofHash: `proof-hash-${seq}`,
      evidenceHash: `evidence-${seq}`,
      traceHealth: "COMPLETE",
      timestamp: `2026-08-02T12:00:00.${String(seq).padStart(3, "0")}Z`,
    })),
    {
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      previousBatchRoot,
      issuedAt: "2026-08-02T12:00:00.000Z",
    },
  )
  if (!built.success) throw new Error(`fixture build failed: ${built.reason}`)
  return signProofBatch(built.payload, secretKey)
}

function configureControlPlane() {
  process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
  process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
  process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
  process.env.ARCANA_CONTROL_ORGANIZATION_ID = "org-arcana"
}

function enrollViaHttp(tmp: { directory: string }, headers: Record<string, string>, nodeId: string, publicKey: Uint8Array) {
  return requestInDirectory(EnrollmentPaths.enroll, tmp.directory, {
    method: "POST",
    headers,
    body: JSON.stringify({
      joinToken: createJoinToken(
        {
          organizationId: "org-arcana",
          trustDomain: "arcana.test",
          nodeId,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
        issuerKey.secretKey,
      ),
      publicKey: encodeBase64url(publicKey),
    }),
  })
}

describe("proof HttpApi (D-8B)", () => {
  it.instance(
    "registers, deduplicates, rejects forgery, and reconciles",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configureControlPlane()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const enrolled = yield* enrollViaHttp(tmp, headers, "node-alpha", nodeKey.publicKey)
        expect(enrolled.status).toBe(200)
        expect(((yield* enrolled.json) as { kind?: string }).kind).toBe("ENROLLED")

        const first = makeEnvelope([1, 2])
        const registered = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(first),
        })
        if (registered.status !== 200) {
          console.log("REGISTER 500 BODY", yield* registered.text)
        }
        expect(registered.status).toBe(200)
        const body = (yield* registered.json) as { kind?: string; reason?: string; detail?: string }
        expect(body.kind).toBe("REGISTERED")

        const dup = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(first),
        })
        expect(dup.status).toBe(200)
        expect(((yield* dup.json) as { kind?: string }).kind).toBe("DUPLICATE")

        const forged = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...first,
            signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          }),
        })
        expect(forged.status).toBe(200)
        expect(((yield* forged.json) as { kind?: string }).kind).toBe("REJECTED")

        const second = makeEnvelope([3, 4], first.batchRoot)
        const chained = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(second),
        })
        expect(chained.status).toBe(200)
        expect(((yield* chained.json) as { kind?: string }).kind).toBe("REGISTERED")

        const reconcile = yield* requestInDirectory(
          `${ProofPaths.reconcile.replace(":nodeId", "node-alpha")}?firstLocalSequence=1&lastLocalSequence=4&lastBatchRoot=${encodeURIComponent(second.batchRoot)}`,
          tmp.directory,
          { method: "GET", headers },
        )
        expect(reconcile.status).toBe(200)
        expect(yield* reconcile.json).toMatchObject({
          status: "RECONCILED",
          nodeId: "node-alpha",
          batchCount: 2,
          lastLocalSequence: 4,
        })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "rejects batches signed with a rotated key",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configureControlPlane()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const enrolled = yield* enrollViaHttp(tmp, headers, "node-alpha", nodeKey.publicKey)
        expect(((yield* enrolled.json) as { kind?: string }).kind).toBe("ENROLLED")

        const ok = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(makeEnvelope([1, 2])),
        })
        expect(((yield* ok.json) as { kind?: string }).kind).toBe("REGISTERED")

        const rotated = yield* requestInDirectory(
          EnrollmentPaths.rotate.replace(":nodeId", "node-alpha"),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ publicKey: encodeBase64url(rotatedKey.publicKey) }),
          },
        )
        expect(rotated.status).toBe(200)
        expect(((yield* rotated.json) as { kind?: string }).kind).toBe("ROTATED")

        const oldKey = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(makeEnvelope([3, 4], undefined, nodeKey.secretKey, 1)),
        })
        expect(((yield* oldKey.json) as { kind?: string }).kind).toBe("REJECTED")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "fails closed without a node registry",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configureControlPlane()

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }
        const res = yield* requestInDirectory(ProofPaths.register, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify(makeEnvelope([1])),
        })
        expect(res.status).toBe(200)
        expect(yield* res.json).toMatchObject({ kind: "REJECTED", reason: "NODE_NOT_ENROLLED" })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
