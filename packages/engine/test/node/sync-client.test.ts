import { describe, expect, it } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import { signSyncResponse } from "@arcana/core/crypto/sync-transport"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import type { SignedPolicyDeltaPayload } from "@arcana/core/crypto/sync-protocol"
import {
  createSyncClient,
  type NodeSyncInput,
  validatePolicyDeltaResponse,
  validateRevocationDeltaResponse,
} from "../../src/node/sync-client"

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

function policyDeltaContext(
  requestId: string,
  clientNonce: string,
  overrides: Partial<SyncResponseContext> = {},
): SyncResponseContext {
  const delta: SignedPolicyDeltaPayload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence: 2,
    basePolicyDigest: "digest-1",
    resultPolicyDigest: "digest-2",
    operations: [{ op: "replace", path: "policyVersion", value: "1.0.2" }],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }
  return {
    protocolVersion: 1,
    requestId,
    clientNonce,
    serverNonce: "server-nonce-1",
    nodeId: "node-alpha",
    serverIdentity: "issuer-arcana",
    responseKind: "POLICY_DELTA",
    policySequence: 2,
    policyDigest: "digest-2",
    delta,
    envelope: {
      schemaVersion: 1,
      issuerId: "issuer-arcana",
      issuerEpoch: 1,
      sequence: 2,
      policyId: "policy-root",
      policyVersion: "1.0.2",
      policyDigest: "digest-2",
      previousPolicyDigest: "digest-1",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      signatureAlgorithm: "Ed25519",
      signature: "sig",
    },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  }
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

  it("validates a consistent POLICY_DELTA response", async () => {
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { context: { requestId: string; clientNonce: string } }
      const context = policyDeltaContext(body.context.requestId, body.context.clientNonce)
      return new Response(
        JSON.stringify({ kind: "RESPONSE", envelope: signSyncResponse(context, serverKey.secretKey) }),
        { status: 200 },
      )
    }
    const client = createSyncClient({
      endpoint: "http://control.example",
      serverPublicKey: serverKey.publicKey,
      fetchImpl: fakeFetch,
    })
    const result = await client.syncPolicy({
      ...INPUT,
      acceptedPolicySequence: 1,
      acceptedPolicyDigest: "digest-1",
    })
    expect(result.kind).toBe("RESPONSE")
    if (result.kind !== "RESPONSE") return
    expect(result.context.responseKind).toBe("POLICY_DELTA")
    expect(
      validatePolicyDeltaResponse(result.context, {
        acceptedPolicySequence: 1,
        acceptedPolicyDigest: "digest-1",
      }),
    ).toEqual({ valid: true })
  })

  it("rejects an inconsistent POLICY_DELTA response", async () => {
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { context: { requestId: string; clientNonce: string } }
      const context = policyDeltaContext(body.context.requestId, body.context.clientNonce, {
        delta: {
          ...policyDeltaContext("", "").delta!,
          basePolicyDigest: "digest-evil",
        },
      })
      return new Response(
        JSON.stringify({ kind: "RESPONSE", envelope: signSyncResponse(context, serverKey.secretKey) }),
        { status: 200 },
      )
    }
    const client = createSyncClient({
      endpoint: "http://control.example",
      serverPublicKey: serverKey.publicKey,
      fetchImpl: fakeFetch,
    })
    const result = await client.syncPolicy({
      ...INPUT,
      acceptedPolicySequence: 1,
      acceptedPolicyDigest: "digest-1",
    })
    expect(result.kind).toBe("ERROR")
    if (result.kind !== "ERROR") return
    expect(result.message).toContain("delta validation failed")
  })

  it("validates contiguous REVOCATION_DELTA and rejects gaps", async () => {
    const base: SyncResponseContext = {
      protocolVersion: 1,
      requestId: "req-1",
      clientNonce: "nonce-1",
      serverNonce: "server-nonce-1",
      nodeId: "node-alpha",
      serverIdentity: "issuer-arcana",
      responseKind: "REVOCATION_DELTA",
      issuedAt: "2026-08-02T12:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }
    const valid = validateRevocationDeltaResponse(
      {
        ...base,
        envelopes: [{ sequence: 2 }, { sequence: 3 }],
      },
      { acceptedRevocationSequence: 1 },
    )
    expect(valid).toEqual({ valid: true })

    const gap = validateRevocationDeltaResponse(
      {
        ...base,
        envelopes: [{ sequence: 3 }],
      },
      { acceptedRevocationSequence: 1 },
    )
    expect(gap.valid).toBe(false)
  })
})
