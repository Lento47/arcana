/**
 * F8: SQLite federation transport store.
 */

import { Database } from "bun:sqlite"
import type {
  FederationTransportStore,
  PendingRevocationDelivery,
  ReceivedRevocation,
} from "./federation-transport"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS federation_revocation_deliveries (
  org_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  delivered_at TEXT,
  failure_reason TEXT,
  PRIMARY KEY (org_id, delivery_id)
);

CREATE TABLE IF NOT EXISTS federation_received_revocations (
  org_id TEXT NOT NULL,
  received_id TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  sender_org_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (org_id, received_id)
);
`

export class SqliteFederationTransportStore implements FederationTransportStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putPending(delivery: PendingRevocationDelivery): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO federation_revocation_deliveries (
          org_id, delivery_id, agreement_id, subject_id, reason, queued_at,
          delivered_at, failure_reason
        ) VALUES (
          $orgId, $deliveryId, $agreementId, $subjectId, $reason, $queuedAt,
          $deliveredAt, $failureReason
        )`,
      )
      .run({
        $orgId: delivery.orgId,
        $deliveryId: delivery.deliveryId,
        $agreementId: delivery.agreementId,
        $subjectId: delivery.subjectId,
        $reason: delivery.reason,
        $queuedAt: delivery.queuedAt,
        $deliveredAt: delivery.deliveredAt ?? null,
        $failureReason: delivery.failureReason ?? null,
      })
  }

  pending(orgId: string): PendingRevocationDelivery[] {
    const rows = this.db
      .query(
        `SELECT * FROM federation_revocation_deliveries
         WHERE org_id = $orgId AND delivered_at IS NULL AND failure_reason IS NULL
         ORDER BY queued_at ASC`,
      )
      .all({ $orgId: orgId }) as unknown as Array<{
      delivery_id: string
      agreement_id: string
      subject_id: string
      reason: string
      queued_at: string
      delivered_at: string | null
      failure_reason: string | null
    }>
    return rows.map((row) => ({
      deliveryId: row.delivery_id,
      orgId,
      agreementId: row.agreement_id,
      subjectId: row.subject_id,
      reason: row.reason,
      queuedAt: row.queued_at,
      deliveredAt: row.delivered_at ?? undefined,
      failureReason: row.failure_reason ?? undefined,
    }))
  }

  markDelivered(orgId: string, deliveryId: string, deliveredAt: string): void {
    this.db
      .query(
        `UPDATE federation_revocation_deliveries
         SET delivered_at = $deliveredAt, failure_reason = NULL
         WHERE org_id = $orgId AND delivery_id = $deliveryId`,
      )
      .run({ $orgId: orgId, $deliveryId: deliveryId, $deliveredAt: deliveredAt })
  }

  markFailed(orgId: string, deliveryId: string, reason: string): void {
    this.db
      .query(
        `UPDATE federation_revocation_deliveries
         SET failure_reason = $reason
         WHERE org_id = $orgId AND delivery_id = $deliveryId`,
      )
      .run({ $orgId: orgId, $deliveryId: deliveryId, $reason: reason })
  }

  putReceived(record: ReceivedRevocation): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO federation_received_revocations (
          org_id, received_id, agreement_id, sender_org_id, subject_id, reason, received_at
        ) VALUES (
          $orgId, $receivedId, $agreementId, $senderOrgId, $subjectId, $reason, $receivedAt
        )`,
      )
      .run({
        $orgId: record.orgId,
        $receivedId: record.receivedId,
        $agreementId: record.agreementId,
        $senderOrgId: record.senderOrgId,
        $subjectId: record.subjectId,
        $reason: record.reason,
        $receivedAt: record.receivedAt,
      })
  }

  received(orgId: string): ReceivedRevocation[] {
    const rows = this.db
      .query(
        `SELECT * FROM federation_received_revocations
         WHERE org_id = $orgId ORDER BY received_at ASC`,
      )
      .all({ $orgId: orgId }) as unknown as Array<{
      received_id: string
      agreement_id: string
      sender_org_id: string
      subject_id: string
      reason: string
      received_at: string
    }>
    return rows.map((row) => ({
      receivedId: row.received_id,
      orgId,
      agreementId: row.agreement_id,
      senderOrgId: row.sender_org_id,
      subjectId: row.subject_id,
      reason: row.reason,
      receivedAt: row.received_at,
    }))
  }
}
