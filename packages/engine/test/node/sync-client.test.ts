import { describe, expect, it } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import { signSyncResponse } from "@arcana/core/crypto/sync-transport"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import { createSyncClient, type NodeSyncInput } from "../../src/node/sync-client"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("aa".repeat(32)))
const serverKey = ed25519.keygen(hexToBytes("bb".repeat(32)))

const INPUT: NodeSyncInput = {
  nodeId: "node-alpha",
  trustDomain: "arcana.test",
  nodeKeyEpoch: 1,
  nodeCertificateFingerprint: "fp-1",
  secretKey: nodeKey.secretKey,
  acceptedPolicySequence: 0,
  acceptedRevocationSequence: 0,
  acceptedEmergencyEpoch: 0,
}

function responseEnvelope(requestId: string, clientNonce: string): ReturnType<typeof signSyncResponse> {
  const context: SyncResponseContext = {
    protocolVersion: 1,
    requestId,
    clientNonce,
    serverNonce: "server-nonce-1",
    nodeId: "node-alpha",
    serverIdentity: "issuer-arcana",
    responseKind: "NO_CHANGE",
    policySequence: 0,
    policyDigest: "",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }
  return signSyncResponse(context, serverKey.secretKey)
}

describe("D-6B-T sync client", () => {
  it("returns a verified RESPONSE for a signed server reply", async () => {
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { context: { requestId: string; clientNonce: string } }
      return new Response(
        JSON.stringify({
          kind: "RESPONSE",
          envelope: responseEnvelope(body.context.requestId, body.context.clientNonce),
        }),
        { status: 200 },
      )
    }
    const client = createSyncClient({
      endpoint: "http://control.example",
      serverPublicKey: serverKey.publicKey,
      fetchImpl: fakeFetch,
    })
    const result = await client.syncPolicy(INPUT)
    expect(result.kind).toBe("RESPONSE")
    if (result.kind !== "RESPONSE") return
    expect(result.context.responseKind).toBe("NO_CHANGE")
  })

  it("rejects a response signed by the wrong server", async () => {
    const otherServer = ed25519.keygen(hexToBytes("cc".repeat(32)))
    const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { context: { requestId: string; clientNonce: string } }
      const context: SyncResponseContext = {
        protocolVersion: 1,
        requestId: body.context.requestId,
        clientNonce: body.context.clientNonce,
        serverNonce: "n",
        nodeId: "node-alpha",
        serverIdentity: "issuer-arcana",
        responseKind: "NO_CHANGE",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }
      return new Response(
        JSON.stringify({ kind: "RESPONSE", envelope: signSyncResponse(context, otherServer.secretKey) }),
        { status: 200 },
      )
    }
    const client = createSyncClient({
      endpoint: "http://control.example",
      serverPublicKey: serverKey.publicKey,
      fetchImpl: fakeFetch,
    })
    const result = await client.syncPolicy(INPUT)
    expect(result.kind).toBe("ERROR")
    if (result.kind !== "ERROR") return
    expect(result.message).toContain("response verification failed")
  })

  it("surfaces non-200 responses as ERROR", async () => {
    const fakeFetch = async () => new Response("unauthorized", { status: 401 })
    const client = createSyncClient({
      endpoint: "http://control.example",
      serverPublicKey: serverKey.publicKey,
      fetchImpl: fakeFetch,
    })
    const result = await client.syncRevocation(INPUT)
    expect(result).toMatchObject({ kind: "ERROR", status: 401 })
  })
})
