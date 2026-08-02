/**
 * D-6B-T: node-side sync client.
 *
 * Builds signed policy/revocation sync requests, submits them to the control
 * plane, and verifies the signed response envelope (signature, audience,
 * requestId/nonce binding, freshness) before returning it.
 */

import { randomUUID } from "node:crypto"
import type { SyncRequestContext, SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import type { SignedPolicyDeltaPayload } from "@arcana/core/crypto/sync-protocol"
import type { SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
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
  /** Node-supported policy compatibility version (D-4 negotiation). */
  supportedCompatibleVersion?: number
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

/**
 * Client-side POLICY_DELTA validation. A node only accepts a delta whose
 * base digest, sequence, result digest, and carried target envelope are all
 * consistent with its accepted state; any mismatch fails closed.
 */
export function validatePolicyDeltaResponse(
  context: SyncResponseContext,
  input: { acceptedPolicySequence: number; acceptedPolicyDigest?: string },
): { valid: true } | { valid: false; reason: string } {
  if (context.responseKind !== "POLICY_DELTA") {
    return { valid: false, reason: `response is ${context.responseKind}, not POLICY_DELTA` }
  }
  if (input.acceptedPolicyDigest === undefined) {
    return { valid: false, reason: "POLICY_DELTA requires a known base digest" }
  }
  const delta = context.delta as SignedPolicyDeltaPayload | undefined
  if (!delta) return { valid: false, reason: "POLICY_DELTA missing delta payload" }
  if (delta.schemaVersion !== 1) {
    return { valid: false, reason: `unsupported delta schemaVersion: ${delta.schemaVersion}` }
  }
  if (delta.basePolicyDigest !== input.acceptedPolicyDigest) {
    return {
      valid: false,
      reason: `delta base digest ${delta.basePolicyDigest} does not match accepted ${input.acceptedPolicyDigest}`,
    }
  }
  if (delta.sequence !== input.acceptedPolicySequence + 1) {
    return {
      valid: false,
      reason: `delta sequence ${delta.sequence} is not accepted sequence ${input.acceptedPolicySequence} + 1`,
    }
  }
  if (delta.resultPolicyDigest !== context.policyDigest) {
    return {
      valid: false,
      reason: `delta result digest ${delta.resultPolicyDigest} does not match response policyDigest ${context.policyDigest}`,
    }
  }
  const target = context.envelope as SignedPolicyEnvelope | undefined
  if (!target) return { valid: false, reason: "POLICY_DELTA missing target envelope" }
  if (target.policyDigest !== context.policyDigest) {
    return {
      valid: false,
      reason: `target envelope digest ${target.policyDigest} does not match response ${context.policyDigest}`,
    }
  }
  if (target.previousPolicyDigest !== input.acceptedPolicyDigest) {
    return {
      valid: false,
      reason: `target envelope previousPolicyDigest ${target.previousPolicyDigest} does not match accepted ${input.acceptedPolicyDigest}`,
    }
  }
  return { valid: true }
}

/**
 * Client-side REVOCATION_DELTA validation: non-empty, bounded at 32, and
 * strictly contiguous starting at accepted sequence + 1.
 */
export function validateRevocationDeltaResponse(
  context: SyncResponseContext,
  input: { acceptedRevocationSequence: number },
): { valid: true } | { valid: false; reason: string } {
  if (context.responseKind !== "REVOCATION_DELTA") {
    return { valid: false, reason: `response is ${context.responseKind}, not REVOCATION_DELTA` }
  }
  const envelopes = context.envelopes ?? []
  if (envelopes.length === 0) {
    return { valid: false, reason: "REVOCATION_DELTA carries no statements" }
  }
  if (envelopes.length > 32) {
    return { valid: false, reason: `REVOCATION_DELTA exceeds 32 statements: ${envelopes.length}` }
  }
  let expected = input.acceptedRevocationSequence + 1
  for (const envelope of envelopes) {
    const sequence = (envelope as { sequence?: unknown }).sequence
    if (typeof sequence !== "number" || sequence !== expected) {
      return {
        valid: false,
        reason: `revocation delta sequence ${String(sequence)} is not contiguous at ${expected}`,
      }
    }
    expected++
  }
  return { valid: true }
}

/**
 * D-4 compatibility negotiation: a node that declares a supported
 * compatible version only accepts policy responses whose served range
 * covers it. A missing range on a policy response fails closed.
 */
export function validateCompatibility(
  context: SyncResponseContext,
  supportedVersion: number | undefined,
): { valid: true } | { valid: false; reason: string } {
  if (supportedVersion === undefined) return { valid: true }
  const isPolicyResponse =
    context.responseKind === "POLICY_SNAPSHOT" || context.responseKind === "POLICY_DELTA"
  if (!isPolicyResponse) return { valid: true }
  if (context.compatibleFrom === undefined || context.compatibleTo === undefined) {
    return { valid: false, reason: "policy response missing compatibility range" }
  }
  if (supportedVersion < context.compatibleFrom || supportedVersion > context.compatibleTo) {
    return {
      valid: false,
      reason: `compatibility negotiation failed: supported ${supportedVersion} outside [${context.compatibleFrom}, ${context.compatibleTo}]`,
    }
  }
  return { valid: true }
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

    if (body.envelope.context.responseKind === "POLICY_DELTA") {
      const deltaCheck = validatePolicyDeltaResponse(body.envelope.context, {
        acceptedPolicySequence: input.acceptedPolicySequence,
        acceptedPolicyDigest: input.acceptedPolicyDigest,
      })
      if (!deltaCheck.valid) {
        return { kind: "ERROR", status: 200, message: `delta validation failed: ${deltaCheck.reason}` }
      }
    }
    if (body.envelope.context.responseKind === "REVOCATION_DELTA") {
      const deltaCheck = validateRevocationDeltaResponse(body.envelope.context, {
        acceptedRevocationSequence: input.acceptedRevocationSequence,
      })
      if (!deltaCheck.valid) {
        return { kind: "ERROR", status: 200, message: `delta validation failed: ${deltaCheck.reason}` }
      }
    }
    const compatibility = validateCompatibility(
      body.envelope.context,
      input.supportedCompatibleVersion,
    )
    if (!compatibility.valid) {
      return { kind: "ERROR", status: 200, message: compatibility.reason }
    }

    return { kind: "RESPONSE", context: body.envelope.context, envelope: body.envelope }
  }

  return {
    syncPolicy: (input) => sync("/api/sync/policy", input),
    syncRevocation: (input) => sync("/api/sync/revocation", input),
  }
}
