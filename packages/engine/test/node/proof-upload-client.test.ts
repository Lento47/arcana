import { describe, expect, it } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import { buildProofBatch } from "@arcana/core/crypto/proof-batching"
import { signProofBatch, type ProofBatchEnvelope } from "@arcana/core/crypto/proof-registration"
import { createProofUploadTransport } from "../../src/node/proof-upload-client"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("44".repeat(32)))

function makeEnvelope(): ProofBatchEnvelope {
  const built = buildProofBatch(
    [1, 2].map((seq) => ({
      localSequence: seq,
      runProofHash: `h-${seq}`,
      evidenceHash: `e-${seq}`,
      traceHealth: "COMPLETE",
      timestamp: "2026-08-02T12:00:00.000Z",
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
      issuedAt: "2026-08-02T12:00:00.000Z",
    },
  )
  if (!built.success) throw new Error(built.reason)
  return signProofBatch(built.payload, nodeKey.secretKey)
}

describe("D-8B proof upload HTTP transport", () => {
  it("maps REGISTERED responses to a durable receipt", async () => {
    const envelope = makeEnvelope()
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          kind: "REGISTERED",
          receiptId: "receipt-x",
          nodeId: "node-alpha",
          batchRoot: envelope.batchRoot,
          status: "REGISTERED",
          acknowledgedFirstSequence: 1,
          acknowledgedLastSequence: 2,
          acknowledgedAt: "2026-08-02T12:00:00.000Z",
        }),
        { status: 200 },
      )

    const transport = createProofUploadTransport({
      endpoint: "http://control.example",
      fetchImpl: fakeFetch,
    })
    const result = await transport(envelope)
    expect(result).toMatchObject({
      kind: "REGISTERED",
      receipt: {
        receiptId: "receipt-x",
        batchRoot: envelope.batchRoot,
        status: "REGISTERED",
      },
    })
  })

  it("maps REJECTED responses to PERMANENT", async () => {
    const envelope = makeEnvelope()
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          kind: "REJECTED",
          reason: "SIGNATURE_INVALID",
          detail: "Ed25519 signature verification failed",
        }),
        { status: 200 },
      )

    const transport = createProofUploadTransport({
      endpoint: "http://control.example",
      fetchImpl: fakeFetch,
    })
    const result = await transport(envelope)
    expect(result).toMatchObject({
      kind: "PERMANENT",
      error: "SIGNATURE_INVALID: Ed25519 signature verification failed",
    })
  })

  it("maps non-200 responses to RETRYABLE", async () => {
    const envelope = makeEnvelope()
    const fakeFetch = async () => new Response("service unavailable", { status: 503 })
    const transport = createProofUploadTransport({
      endpoint: "http://control.example",
      fetchImpl: fakeFetch,
    })
    const result = await transport(envelope)
    expect(result).toMatchObject({ kind: "RETRYABLE", error: "HTTP 503" })
  })

  it("maps network failures to RETRYABLE", async () => {
    const envelope = makeEnvelope()
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED")
    }
    const transport = createProofUploadTransport({
      endpoint: "http://control.example",
      fetchImpl: fakeFetch,
    })
    const result = await transport(envelope)
    expect(result.kind).toBe("RETRYABLE")
  })
})
