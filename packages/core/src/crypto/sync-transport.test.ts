/**
 * D-6B-T: authenticated sync transport tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "./canonical-serializer"
import type { SyncRequestContext, SyncResponseContext } from "./sync-auth"
import {
  signSyncRequest,
  signSyncResponse,
  verifySyncRequest,
  verifySyncResponse,
} from "./sync-transport"
import { SqliteSyncReplayStore } from "./sync-replay-store-sqlite"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("88".repeat(32)))
const serverKey = ed25519.keygen(hexToBytes("99".repeat(32)))
const NOW = new Date("2026-08-02T12:00:00.000Z")

function requestContext(overrides: Partial<SyncRequestContext> = {}): SyncRequestContext {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    clientNonce: "nonce-abc",
    trustDomain: "arcana.test",
    nodeId: "node-alpha",
    nodeCertificateFingerprint: "fingerprint-1",
    nodeKeyEpoch: 1,
    acceptedPolicySequence: 0,
    acceptedRevocationSequence: 0,
    acceptedEmergencyEpoch: 0,
    issuedAt: "2026-08-02T12:00:00.000Z",
    expiresAt: "2026-08-02T12:10:00.000Z",
    ...overrides,
  }
}

function responseContext(overrides: Partial<SyncResponseContext> = {}): SyncResponseContext {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    clientNonce: "nonce-abc",
    serverNonce: "server-nonce-1",
    nodeId: "node-alpha",
    serverIdentity: "control-plane-1",
    responseKind: "NO_CHANGE",
    policySequence: 0,
    policyDigest: "digest-0",
    revocationSequence: 0,
    revocationDigest: "digest-0",
    emergencyEpoch: 0,
    issuedAt: "2026-08-02T12:00:00.000Z",
    expiresAt: "2026-08-02T12:10:00.000Z",
    ...overrides,
  }
}

describe("D-6B-T sync request envelopes", () => {
  it("signs and verifies a valid request", () => {
    const envelope = signSyncRequest(requestContext(), nodeKey.secretKey)
    const result = verifySyncRequest(envelope, nodeKey.publicKey, {
      nodeId: "node-alpha",
      trustDomain: "arcana.test",
      now: NOW,
    })
    expect(result).toEqual({ valid: true })
  })

  it("rejects a forged signature", () => {
    const envelope = signSyncRequest(requestContext(), nodeKey.secretKey)
    const forged = { ...envelope, signature: encodeBase64url(new Uint8Array(64).fill(3)) }
    const result = verifySyncRequest(forged, nodeKey.publicKey, {
      nodeId: "node-alpha",
      trustDomain: "arcana.test",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.stage).toBe("SIGNATURE")
  })

  it("rejects an expired request", () => {
    const envelope = signSyncRequest(
      requestContext({ issuedAt: "2026-08-02T10:00:00.000Z", expiresAt: "2026-08-02T10:10:00.000Z" }),
      nodeKey.secretKey,
    )
    const result = verifySyncRequest(envelope, nodeKey.publicKey, {
      nodeId: "node-alpha",
      trustDomain: "arcana.test",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.stage).toBe("FRESHNESS")
  })

  it("rejects a wrong audience (node/trustDomain)", () => {
    const envelope = signSyncRequest(requestContext(), nodeKey.secretKey)
    const wrongNode = verifySyncRequest(envelope, nodeKey.publicKey, {
      nodeId: "node-beta",
      trustDomain: "arcana.test",
      now: NOW,
    })
    expect(wrongNode.valid).toBe(false)
    const wrongDomain = verifySyncRequest(envelope, nodeKey.publicKey, {
      nodeId: "node-alpha",
      trustDomain: "other.corp",
      now: NOW,
    })
    expect(wrongDomain.valid).toBe(false)
  })
})

describe("D-6B-T sync response envelopes", () => {
  it("signs and verifies a valid response", () => {
    const envelope = signSyncResponse(responseContext(), serverKey.secretKey)
    const result = verifySyncResponse(envelope, serverKey.publicKey, {
      nodeId: "node-alpha",
      requestId: "req-1",
      clientNonce: "nonce-abc",
      now: NOW,
    })
    expect(result).toEqual({ valid: true })
  })

  it("rejects a response for a different requestId/nonce", () => {
    const envelope = signSyncResponse(responseContext(), serverKey.secretKey)
    expect(
      verifySyncResponse(envelope, serverKey.publicKey, {
        nodeId: "node-alpha",
        requestId: "req-2",
        clientNonce: "nonce-abc",
        now: NOW,
      }).valid,
    ).toBe(false)
    expect(
      verifySyncResponse(envelope, serverKey.publicKey, {
        nodeId: "node-alpha",
        requestId: "req-1",
        clientNonce: "nonce-xyz",
        now: NOW,
      }).valid,
    ).toBe(false)
  })

  it("rejects a forged server signature", () => {
    const envelope = signSyncResponse(responseContext(), serverKey.secretKey)
    const forged = { ...envelope, signature: encodeBase64url(new Uint8Array(64).fill(7)) }
    const result = verifySyncResponse(forged, serverKey.publicKey, {
      nodeId: "node-alpha",
      requestId: "req-1",
      clientNonce: "nonce-abc",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.stage).toBe("SIGNATURE")
  })

  it("rejects an expired response", () => {
    const envelope = signSyncResponse(
      responseContext({ issuedAt: "2026-08-02T10:00:00.000Z", expiresAt: "2026-08-02T10:10:00.000Z" }),
      serverKey.secretKey,
    )
    const result = verifySyncResponse(envelope, serverKey.publicKey, {
      nodeId: "node-alpha",
      requestId: "req-1",
      clientNonce: "nonce-abc",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.stage).toBe("AUDIENCE")
  })
})

describe("D-6B-T sync replay store", () => {
  it("classifies fresh, idempotent, and conflicting responses", () => {
    const store = new SqliteSyncReplayStore(new Database(":memory:"))
    const context = responseContext()
    const envelope = signSyncResponse(context, serverKey.secretKey)
    const digest = encodeBase64url(new Uint8Array(32).fill(1))
    const responseJson = JSON.stringify(envelope)

    const fresh = store.classify(context, digest, NOW)
    expect(fresh.status).toBe("OK")

    store.record(context, digest, responseJson, NOW)

    const idempotent = store.classify(context, digest, NOW)
    expect(idempotent.status).toBe("IDEMPOTENT")
    expect(idempotent.existing?.responseJson).toBe(responseJson)

    const conflict = store.classify(responseContext({ serverNonce: "different" }), "different-digest", NOW)
    expect(conflict.status).toBe("SECURITY_CONFLICT")
  })

  it("persists stored responses across instances", () => {
    const db = new Database(":memory:")
    const store1 = new SqliteSyncReplayStore(db)
    const context = responseContext()
    store1.record(context, "digest", JSON.stringify({ ok: true }), NOW)

    const store2 = new SqliteSyncReplayStore(db)
    expect(store2.find("req-1")?.responseJson).toBe(JSON.stringify({ ok: true }))
  })
})
