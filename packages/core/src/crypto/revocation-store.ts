/**
 * D-5: Signed Revocation Statement Store (control plane)
 *
 * Durable, sequence-monotonic store for signed revocation statements.
 * Publication requires issuer verification and monotonic sequence +
 * emergency-epoch ordering; rollback of either is rejected so a node can
 * never be re-granted authority that was revoked.
 */

import { createHash } from "node:crypto"
import { verifyRevocationStatement } from "./verifier"
import { REVOCATION_REQUIRED_FIELDS, type RevocationStatement } from "./signed-envelopes"
import { validateEnvelopePayload } from "./canonical-serializer"

export type RevocationRecord = {
  sequence: number
  issuerId: string
  issuerEpoch: number
  subjectType: RevocationStatement["subjectType"]
  subjectId: string
  reason: string
  effectiveAt: string
  issuedAt: string
  signedStatementJson: string
  digest: string
  publishedAt: string
}

export interface RevocationStore {
  put(record: RevocationRecord): void
  getBySequence(sequence: number): RevocationRecord | undefined
  last(): RevocationRecord | undefined
  history(): RevocationRecord[]
}

export type RevocationPublishInput = {
  statement: RevocationStatement
  now?: Date
  trustedIssuerPublicKeys: Map<string, Uint8Array>
}

export type RevocationPublishResult =
  | { kind: "PUBLISHED"; record: RevocationRecord }
  | { kind: "REJECTED"; reason: string }

export function publishRevocation(
  input: RevocationPublishInput,
  store: RevocationStore,
): RevocationPublishResult {
  const now = input.now ?? new Date()
  const statement = input.statement

  const schemaIssues = validateEnvelopePayload(
    statement as unknown as Record<string, unknown>,
    REVOCATION_REQUIRED_FIELDS,
  )
  if (schemaIssues.length > 0) {
    return {
      kind: "REJECTED",
      reason: `revocation schema invalid: ${schemaIssues.map((i) => i.field).join(", ")}`,
    }
  }

  const last = store.last()
  const knownSequences = new Map<string, number>()
  if (last && last.issuerId === statement.issuerId) {
    knownSequences.set(statement.issuerId, last.sequence)
  }
  const existing = store.getBySequence(statement.sequence)
  if (existing) {
    if (existing.subjectId === statement.subjectId && existing.reason === statement.reason) {
      return { kind: "PUBLISHED", record: existing }
    }
    return { kind: "REJECTED", reason: `sequence ${statement.sequence} already used with different content` }
  }

  const verified = verifyRevocationStatement(
    statement as unknown as Record<string, unknown>,
    input.trustedIssuerPublicKeys,
    knownSequences,
    now.getTime(),
  )
  if (!verified.valid) {
    return { kind: "REJECTED", reason: `revocation verification failed: ${verified.detail}` }
  }

  if (last) {
    if (statement.sequence <= last.sequence) {
      return {
        kind: "REJECTED",
        reason: `sequence rollback: ${statement.sequence} <= ${last.sequence}`,
      }
    }
  } else if (statement.sequence !== 1) {
    return { kind: "REJECTED", reason: `first revocation statement must use sequence 1, got ${statement.sequence}` }
  }

  const signedJson = JSON.stringify(statement)
  const record: RevocationRecord = {
    sequence: statement.sequence,
    issuerId: statement.issuerId,
    issuerEpoch: statement.issuerEpoch,
    subjectType: statement.subjectType,
    subjectId: statement.subjectId,
    reason: statement.reason,
    effectiveAt: statement.effectiveAt,
    issuedAt: statement.issuedAt,
    signedStatementJson: signedJson,
    digest: createHash("sha256").update(signedJson).digest("hex"),
    publishedAt: now.toISOString(),
  }
  store.put(record)
  return { kind: "PUBLISHED", record }
}
