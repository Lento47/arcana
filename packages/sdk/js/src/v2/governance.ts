/**
 * SDK 1.0 governance surface (E3).
 *
 * Framework-agnostic building blocks for external adapters:
 *   - canonical authorization request construction (exact request hashing)
 *   - strict envelope parsing + Ed25519 signature verification
 *   - tool-call → AuthorizationRequest mapping for adapter hooks
 */

import { randomUUID } from "node:crypto"
import {
  computeRequestHash,
} from "@arcana/core/capability/request-hash"
import type {
  AuthorizationRequest,
  CanonicalResource,
  CapabilityAction,
  ProvenanceLabel,
  SensitivityLabel,
} from "@arcana/core/capability/types"
import {
  canonicalize,
  type SignatureDomain,
} from "@arcana/core/crypto/canonical-serializer"
import { parseStrictEnvelope, verifyEnvelopeSignature } from "@arcana/core/crypto/verifier"

export { canonicalize, parseStrictEnvelope }
export type { SignatureDomain }

export type ToolCallLike = {
  name: string
  arguments?: Record<string, unknown> | string
}

export type GovernanceContext = {
  principalId: string
  sessionId: string
  workspaceId?: string
  contractId?: string
  contractRevision?: string
  criterionIds?: string[]
  action: CapabilityAction
  resource?: Partial<CanonicalResource>
  executable?: string
  networkDestination?: string
  workingDirectory?: string
  provenance: ProvenanceLabel[]
  sensitivity: SensitivityLabel[]
}

export type AuthorizationRequestInput = Omit<
  AuthorizationRequest,
  "requestId" | "nonce" | "requestedAt" | "requestHash"
> & {
  requestId?: string
  nonce?: string
  requestedAt?: string
}

/**
 * Build a canonical AuthorizationRequest with an exact request hash.
 * Every consequential field is bound into H(q); the caller must never mutate
 * the returned object before submitting it to the PEP.
 */
export function buildAuthorizationRequest(
  input: AuthorizationRequestInput,
): AuthorizationRequest & { requestHash: string } {
  const request: AuthorizationRequest = {
    ...input,
    requestId: input.requestId ?? `req-${randomUUID()}`,
    nonce: input.nonce ?? randomUUID(),
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  }
  return { ...request, requestHash: computeRequestHash(request) }
}

/**
 * Map a framework tool call + governance context onto a canonical
 * AuthorizationRequest. Framework adapters use this hook before every effect.
 */
export function toAuthorizationRequest(
  toolCall: ToolCallLike,
  context: GovernanceContext,
): AuthorizationRequest & { requestHash: string } {
  const args =
    typeof toolCall.arguments === "string"
      ? (JSON.parse(toolCall.arguments) as Record<string, unknown>)
      : (toolCall.arguments ?? {})
  const resource: CanonicalResource = {
    kind: context.resource?.kind ?? "process",
    ...context.resource,
  }
  return buildAuthorizationRequest({
    schemaVersion: "1",
    principalId: context.principalId,
    sessionId: context.sessionId,
    contractId: context.contractId,
    contractRevision: context.contractRevision,
    criterionIds: context.criterionIds,
    workspaceId: context.workspaceId,
    tool: toolCall.name,
    action: context.action,
    resource,
    executable: context.executable,
    arguments: Object.keys(args).map((key) => `${key}=${String(args[key])}`),
    workingDirectory: context.workingDirectory,
    networkDestination: context.networkDestination,
    provenance: context.provenance,
    sensitivity: context.sensitivity,
  })
}

export type SignedEnvelopeVerification =
  | { valid: true }
  | { valid: false; stage: string; reason: string }

/**
 * Strict-parse and verify a signed envelope against a public key.
 * Wraps the core verifier with duplicate-key rejection.
 */
export function verifySignedEnvelope(
  envelopeJson: string,
  domain: SignatureDomain,
  publicKey: Uint8Array,
): SignedEnvelopeVerification {
  let envelope: Record<string, unknown>
  try {
    envelope = parseStrictEnvelope(envelopeJson)
  } catch (error) {
    return { valid: false, stage: "PARSE", reason: String(error) }
  }
  const result = verifyEnvelopeSignature(envelope, domain, publicKey)
  return result.valid
    ? { valid: true }
    : { valid: false, stage: result.stage, reason: result.detail }
}
