/**
 * F8: Federated revocation transport (outbox/inbox exchange).
 *
 * Message-exchange layer for revocation propagation between organizations:
 * revocations are queued as deliveries under an active agreement, marked
 * delivered/failed with audit state, and receivers ingest them with
 * agreement validation and deduplication. Live network delivery remains an
 * ops concern; the exchange contract is deterministic and tested here.
 */

import type { FederationStore } from "./federation"
import { agreementValid } from "./federation"

export type PendingRevocationDelivery = {
  deliveryId: string
  /** Sending organization. */
  orgId: string
  agreementId: string
  subjectId: string
  reason: string
  queuedAt: string
  deliveredAt?: string
  failureReason?: string
}

export type ReceivedRevocation = {
  receivedId: string
  /** Receiving organization. */
  orgId: string
  agreementId: string
  senderOrgId: string
  subjectId: string
  reason: string
  receivedAt: string
}

export interface FederationTransportStore {
  putPending(delivery: PendingRevocationDelivery): void
  pending(orgId: string): PendingRevocationDelivery[]
  markDelivered(orgId: string, deliveryId: string, deliveredAt: string): void
  markFailed(orgId: string, deliveryId: string, reason: string): void
  putReceived(record: ReceivedRevocation): void
  received(orgId: string): ReceivedRevocation[]
}

export type RevocationDeliveryResult =
  | { kind: "QUEUED"; record: PendingRevocationDelivery }
  | { kind: "REJECTED"; reason: string }

export function queueRevocationDelivery(
  input: { orgId: string; agreementId: string; subjectId: string; reason: string; now: Date },
  agreements: FederationStore,
  store: FederationTransportStore,
): RevocationDeliveryResult {
  const validity = agreementValid(agreements.getAgreement(input.agreementId), input.now)
  if (!validity.valid) return { kind: "REJECTED", reason: validity.reason }
  const record: PendingRevocationDelivery = {
    deliveryId: `delivery-${input.now.getTime()}-${input.subjectId}`,
    orgId: input.orgId,
    agreementId: input.agreementId,
    subjectId: input.subjectId,
    reason: input.reason,
    queuedAt: input.now.toISOString(),
  }
  store.putPending(record)
  return { kind: "QUEUED", record }
}

export type RevocationReceiveResult =
  | { kind: "RECEIVED"; record: ReceivedRevocation }
  | { kind: "REJECTED"; reason: string }

export function receiveRevocationDelivery(
  input: {
    orgId: string
    agreementId: string
    senderOrgId: string
    subjectId: string
    reason: string
    now: Date
  },
  agreements: FederationStore,
  store: FederationTransportStore,
): RevocationReceiveResult {
  const validity = agreementValid(agreements.getAgreement(input.agreementId), input.now)
  if (!validity.valid) return { kind: "REJECTED", reason: validity.reason }

  const existing = store
    .received(input.orgId)
    .find(
      (record) =>
        record.senderOrgId === input.senderOrgId &&
        record.subjectId === input.subjectId &&
        record.reason === input.reason,
    )
  if (existing) return { kind: "RECEIVED", record: existing }

  const record: ReceivedRevocation = {
    receivedId: `recv-${input.now.getTime()}-${input.subjectId}`,
    orgId: input.orgId,
    agreementId: input.agreementId,
    senderOrgId: input.senderOrgId,
    subjectId: input.subjectId,
    reason: input.reason,
    receivedAt: input.now.toISOString(),
  }
  store.putReceived(record)
  return { kind: "RECEIVED", record }
}
