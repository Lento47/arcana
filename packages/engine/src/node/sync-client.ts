/**
 * D-6B-T: node-side sync client.
 *
 * Builds signed policy/revocation sync requests, submits them to the control
 * plane, and verifies the signed response envelope (signature, audience,
 * requestId/nonce binding, freshness) before returning it.
 */

import { randomUUID } from "node:crypto"
import type { SyncRequestContext, SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import {
  signSyncRequest,
  verifySyncResponse,
  type SignedSyncEnvelope,
} from "@arcana/core/crypto/sync-transport"

export type SyncClientOptions = {
  /** Control-plane base URL, e.g. http://127.0.0.1:9142 */
  endpoint: string
  /** Control-plane issuer public key (trust anchor). */
  serverPublicKey: Uint8Array
  headers?: Record<string, string>
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export type NodeSyncInput = {
  nodeId: string
  trustDomain: string
  nodeKeyEpoch: number
  nodeCertificateFingerprint: string
  secretKey: Uint8Array
  acceptedPolicySequence: number
  acceptedPolicyDigest?: string
  acceptedRevocationSequence: number
  acceptedRevocationDigest?: string
  acceptedEmergencyEpoch: number
  requestId?: string
}

export type SyncClientResult =
  | {
      kind: "RESPONSE"
      context: SyncResponseContext
      envelope: SignedSyncEnvelope<SyncResponseContext>
    }
  | {
      kind: "ERROR"
      status: number
      message: string
    }

export function createSyncClient(options: SyncClientOptions): {
  syncPolicy(input: NodeSyncInput): Promise<SyncClientResult>
  syncRevocation(input: NodeSyncInput): Promise<SyncClientResult>
} {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint.replace(/\/+$/, "")

  async function sync(path: string, input: NodeSyncInput): Promise<SyncClientResult> {
    const now = new Date()
    const context: SyncRequestContext = {
      protocolVersion: 1,
      requestId: input.requestId ?? randomUUID(),
      clientNonce: randomUUID(),
      trustDomain: input.trustDomain,
      nodeId: input.nodeId,
      nodeCertificateFingerprint: input.nodeCertificateFingerprint,
      nodeKeyEpoch: input.nodeKeyEpoch,
      acceptedPolicySequence: input.acceptedPolicySequence,
      acceptedRevocationSequence: input.acceptedRevocationSequence,
      acceptedEmergencyEpoch: input.acceptedEmergencyEpoch,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    }
    // Optional digests are omitted entirely so canonical signing and the wire
    // schema agree (no undefined/null ambiguity).
    if (input.acceptedPolicyDigest !== undefined) {
      context.acceptedPolicyDigest = input.acceptedPolicyDigest
    }
    if (input.acceptedRevocationDigest !== undefined) {
      context.acceptedRevocationDigest = input.acceptedRevocationDigest
    }
    const envelope = signSyncRequest(context, input.secretKey)

    let response: Response
    try {
      response = await fetchImpl(`${endpoint}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        body: JSON.stringify(envelope),
      })
    } catch (error) {
      return { kind: "ERROR", status: 0, message: `transport error: ${String(error)}` }
    }

    if (response.status !== 200) {
      const text = await response.text().catch(() => "")
      return { kind: "ERROR", status: response.status, message: text }
    }

    let body: { envelope?: SignedSyncEnvelope<SyncResponseContext> }
    try {
      body = (await response.json()) as { envelope?: SignedSyncEnvelope<SyncResponseContext> }
    } catch (error) {
      return { kind: "ERROR", status: 200, message: `invalid response body: ${String(error)}` }
    }
    if (!body.envelope) {
      return { kind: "ERROR", status: 200, message: "response missing envelope" }
    }

    const verified = verifySyncResponse(body.envelope, options.serverPublicKey, {
      nodeId: input.nodeId,
      requestId: context.requestId,
      clientNonce: context.clientNonce,
      now: new Date(),
    })
    if (!verified.valid) {
      return { kind: "ERROR", status: 200, message: `response verification failed: ${verified.reason}` }
    }

    return { kind: "RESPONSE", context: body.envelope.context, envelope: body.envelope }
  }

  return {
    syncPolicy: (input) => sync("/api/sync/policy", input),
    syncRevocation: (input) => sync("/api/sync/revocation", input),
  }
}
