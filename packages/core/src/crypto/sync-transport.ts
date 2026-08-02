/**
 * D-6B-T: Authenticated Synchronization Transport (signed envelopes)
 *
 * Production transport layer for policy/revocation synchronization. Every
 * request and response is an Ed25519-signed envelope binding:
 *   - requestId + clientNonce (replay protection)
 *   - nodeId + trustDomain (audience)
 *   - accepted policy/revocation state
 *   - issuedAt/expiresAt (freshness)
 *
 * The state machine and response semantics live in sync-protocol.ts; the
 * replay bookkeeping lives in sync-auth.ts + sync-replay-store-sqlite.ts.
 * Confidentiality (TLS) is a deployment concern tracked in the Phase D ops
 * blocker; this module provides authentication, integrity, and replay
 * resistance at the message layer.
 */

import { buildSignatureInput, type SignatureDomain } from "./canonical-serializer"
import { verifyEnvelopeSignature } from "./verifier"
import {
  SYNC_ACK_DOMAIN,
  SYNC_REQUEST_DOMAIN,
  SYNC_RESPONSE_DOMAIN,
  validateSyncResponse,
  type SyncRequestContext,
  type SyncResponseContext,
} from "./sync-auth"
import { signEnvelope } from "./node-enrollment"

export type SignedSyncEnvelope<T> = {
  context: T
  signatureAlgorithm: "Ed25519"
  signature: string
}

export type SyncEnvelopeVerification =
  | { valid: true }
  | { valid: false; stage: "SCHEMA" | "SIGNATURE" | "AUDIENCE" | "FRESHNESS"; reason: string }

// ─── Request signing / verification ────────────────────────────────

export function signSyncRequest(
  context: SyncRequestContext,
  nodeSecretKey: Uint8Array,
): SignedSyncEnvelope<SyncRequestContext> {
  const signed = signEnvelope(
    SYNC_REQUEST_DOMAIN as SignatureDomain,
    { context: stripUndefined(context) },
    nodeSecretKey,
  )
  return signed as unknown as SignedSyncEnvelope<SyncRequestContext>
}

export function verifySyncRequest(
  envelope: SignedSyncEnvelope<SyncRequestContext>,
  nodePublicKey: Uint8Array,
  expected: {
    nodeId: string
    trustDomain: string
    now: Date
  },
): SyncEnvelopeVerification {
  const context = envelope.context
  if (!context || typeof context !== "object") {
    return { valid: false, stage: "SCHEMA", reason: "missing sync request context" }
  }
  if (!context.requestId || !context.clientNonce) {
    return { valid: false, stage: "SCHEMA", reason: "requestId/clientNonce required" }
  }
  if (!context.nodeCertificateFingerprint || !context.nodeId) {
    return { valid: false, stage: "SCHEMA", reason: "node identity fields required" }
  }

  if (context.nodeId !== expected.nodeId) {
    return { valid: false, stage: "AUDIENCE", reason: `nodeId mismatch: ${context.nodeId}` }
  }
  if (context.trustDomain !== expected.trustDomain) {
    return { valid: false, stage: "AUDIENCE", reason: `trustDomain mismatch: ${context.trustDomain}` }
  }

  const nowMs = expected.now.getTime()
  if (nowMs > new Date(context.expiresAt).getTime()) {
    return { valid: false, stage: "FRESHNESS", reason: `request expired at ${context.expiresAt}` }
  }
  if (new Date(context.issuedAt).getTime() > nowMs + 5 * 60 * 1000) {
    return { valid: false, stage: "FRESHNESS", reason: "request issuedAt is in the future" }
  }

  const signature = verifyEnvelopeSignature(
    envelope as unknown as Record<string, unknown>,
    SYNC_REQUEST_DOMAIN as SignatureDomain,
    nodePublicKey,
  )
  if (!signature.valid) {
    return { valid: false, stage: "SIGNATURE", reason: signature.detail }
  }
  return { valid: true }
}

// ─── Response signing / verification ───────────────────────────────

export function signSyncResponse(
  context: SyncResponseContext,
  serverSecretKey: Uint8Array,
): SignedSyncEnvelope<SyncResponseContext> {
  const signed = signEnvelope(
    SYNC_RESPONSE_DOMAIN as SignatureDomain,
    { context: stripUndefined(context) },
    serverSecretKey,
  )
  return signed as unknown as SignedSyncEnvelope<SyncResponseContext>
}

export function verifySyncResponse(
  envelope: SignedSyncEnvelope<SyncResponseContext>,
  serverPublicKey: Uint8Array,
  expected: {
    nodeId: string
    requestId: string
    clientNonce: string
    now: Date
  },
): SyncEnvelopeVerification {
  const context = envelope.context
  if (!context || typeof context !== "object") {
    return { valid: false, stage: "SCHEMA", reason: "missing sync response context" }
  }

  const audience = validateSyncResponse(
    context,
    expected.nodeId,
    expected.requestId,
    expected.clientNonce,
    expected.now,
  )
  if (!audience.valid) {
    return { valid: false, stage: "AUDIENCE", reason: audience.reason }
  }

  const signature = verifyEnvelopeSignature(
    envelope as unknown as Record<string, unknown>,
    SYNC_RESPONSE_DOMAIN as SignatureDomain,
    serverPublicKey,
  )
  if (!signature.valid) {
    return { valid: false, stage: "SIGNATURE", reason: signature.detail }
  }
  return { valid: true }
}

// ─── ACK envelope (durable acknowledgement) ─────────────────────────

export function signSyncAck(
  payload: Record<string, unknown>,
  nodeSecretKey: Uint8Array,
): SignedSyncEnvelope<Record<string, unknown>> {
  const signed = signEnvelope(SYNC_ACK_DOMAIN as SignatureDomain, { context: payload }, nodeSecretKey)
  return signed as unknown as SignedSyncEnvelope<Record<string, unknown>>
}

function stripUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out as T
}
