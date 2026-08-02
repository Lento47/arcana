import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { buildProofBatch } from "@arcana/core/crypto/proof-batching"
import { signProofBatch } from "@arcana/core/crypto/proof-registration"
import { ProofPaths } from "../../src/server/routes/instance/httpapi/groups/proof"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalNodeKeys = process.env.ARCANA_CONTROL_NODE_KEYS

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const nodeKey = ed25519.keygen(new Uint8Array(32).fill(0x11))

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalNodeKeys === undefined) delete process.env.ARCANA_CONTROL_NODE_KEYS
  else process.env.ARCANA_CONTROL_NODE_KEYS = originalNodeKeys
  await disposeAllInstances()
  await resetDatabase()
})

function makeEnvelope(sequences: number[], previousBatchRoot?: string) {
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
      nodeKeyEpoch: 1,
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
  return signProofBatch(built.payload, nodeKey.secretKey)
}

describe("proof HttpApi (D-8B)", () => {
  it.instance(
    "registers, deduplicates, rejects forgery, and reconciles",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
        process.env.ARCANA_CONTROL_NODE_KEYS = JSON.stringify({
          "node-alpha": encodeBase64url(nodeKey.publicKey),
        })

        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

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
    "fails closed without a node registry",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
        delete process.env.ARCANA_CONTROL_NODE_KEYS

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
