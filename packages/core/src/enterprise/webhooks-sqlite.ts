/**
 * F11: SQLite webhook store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type { WebhookDelivery, WebhookEndpoint, WebhookStore } from "./webhooks"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  tenant_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, webhook_id)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  tenant_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  last_error TEXT,
  PRIMARY KEY (tenant_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_pending
  ON webhook_deliveries (tenant_id, status, next_attempt_at);
`

export class SqliteWebhookStore implements WebhookStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putEndpoint(endpoint: WebhookEndpoint): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO webhook_endpoints (
          tenant_id, webhook_id, url, active, created_at
        ) VALUES ($tenantId, $webhookId, $url, $active, $createdAt)`,
      )
      .run({
        $tenantId: endpoint.tenantId,
        $webhookId: endpoint.webhookId,
        $url: endpoint.url,
        $active: endpoint.active ? 1 : 0,
        $createdAt: endpoint.createdAt,
      })
  }

  listEndpoints(tenantId: string): WebhookEndpoint[] {
    const rows = this.db
      .query(`SELECT * FROM webhook_endpoints WHERE tenant_id = $tenantId ORDER BY webhook_id ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<{
      webhook_id: string
      url: string
      active: number
      created_at: string
    }>
    return rows.map((row) => ({
      tenantId,
      webhookId: row.webhook_id,
      url: row.url,
      active: row.active === 1,
      createdAt: row.created_at,
    }))
  }

  putDelivery(delivery: WebhookDelivery): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO webhook_deliveries (
          tenant_id, delivery_id, webhook_id, payload_json, status, attempts,
          next_attempt_at, created_at, delivered_at, last_error
        ) VALUES (
          $tenantId, $deliveryId, $webhookId, $payloadJson, $status, $attempts,
          $nextAttemptAt, $createdAt, $deliveredAt, $lastError
        )`,
      )
      .run({
        $tenantId: delivery.tenantId,
        $deliveryId: delivery.deliveryId,
        $webhookId: delivery.webhookId,
        $payloadJson: delivery.payloadJson,
        $status: delivery.status,
        $attempts: delivery.attempts,
        $nextAttemptAt: delivery.nextAttemptAt,
        $createdAt: delivery.createdAt,
        $deliveredAt: delivery.deliveredAt ?? null,
        $lastError: delivery.lastError ?? null,
      })
  }

  pending(tenantId: string, dueBefore: string): WebhookDelivery[] {
    const rows = this.db
      .query(
        `SELECT * FROM webhook_deliveries
         WHERE tenant_id = $tenantId AND status = 'PENDING' AND next_attempt_at <= $dueBefore
         ORDER BY next_attempt_at ASC`,
      )
      .all({ $tenantId: tenantId, $dueBefore: dueBefore }) as unknown as Array<DeliveryRow>
    return rows.map((row) => mapDelivery(tenantId, row))
  }

  deliveries(tenantId: string): WebhookDelivery[] {
    const rows = this.db
      .query(`SELECT * FROM webhook_deliveries WHERE tenant_id = $tenantId ORDER BY created_at ASC`)
      .all({ $tenantId: tenantId }) as unknown as Array<DeliveryRow>
    return rows.map((row) => mapDelivery(tenantId, row))
  }

  markAttempt(tenantId: string, deliveryId: string, attempts: number, nextAttemptAt: string): void {
    this.db
      .query(
        `UPDATE webhook_deliveries
         SET attempts = $attempts, next_attempt_at = $nextAttemptAt, last_error = NULL
         WHERE tenant_id = $tenantId AND delivery_id = $deliveryId`,
      )
      .run({ $tenantId: tenantId, $deliveryId: deliveryId, $attempts: attempts, $nextAttemptAt: nextAttemptAt })
  }

  markDelivered(tenantId: string, deliveryId: string, deliveredAt: string): void {
    this.db
      .query(
        `UPDATE webhook_deliveries
         SET status = 'DELIVERED', delivered_at = $deliveredAt, last_error = NULL
         WHERE tenant_id = $tenantId AND delivery_id = $deliveryId`,
      )
      .run({ $tenantId: tenantId, $deliveryId: deliveryId, $deliveredAt: deliveredAt })
  }

  markFailed(tenantId: string, deliveryId: string, error: string): void {
    this.db
      .query(
        `UPDATE webhook_deliveries
         SET status = 'FAILED', last_error = $error
         WHERE tenant_id = $tenantId AND delivery_id = $deliveryId`,
      )
      .run({ $tenantId: tenantId, $deliveryId: deliveryId, $error: error })
  }
}

type DeliveryRow = {
  delivery_id: string
  webhook_id: string
  payload_json: string
  status: string
  attempts: number
  next_attempt_at: string
  created_at: string
  delivered_at: string | null
  last_error: string | null
}

function mapDelivery(tenantId: string, row: DeliveryRow): WebhookDelivery {
  return {
    tenantId,
    deliveryId: row.delivery_id,
    webhookId: row.webhook_id,
    payloadJson: row.payload_json,
    status: row.status as WebhookDelivery["status"],
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
    lastError: row.last_error ?? undefined,
  }
}
