/**
 * F11: Outbound webhook delivery sink.
 *
 * Admin events are enqueued to active webhook endpoints as immutable JSON
 * payloads and delivered with bounded retry/backoff. Delivery state is
 * durable: a crash can never lose an undelivered event, and a permanently
 * failing endpoint fails closed with an auditable error.
 */

export type WebhookEndpoint = {
  tenantId: string
  webhookId: string
  url: string
  active: boolean
  createdAt: string
}

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED"

export type WebhookDelivery = {
  tenantId: string
  deliveryId: string
  webhookId: string
  payloadJson: string
  status: WebhookDeliveryStatus
  attempts: number
  nextAttemptAt: string
  createdAt: string
  deliveredAt?: string
  lastError?: string
}

export interface WebhookStore {
  putEndpoint(endpoint: WebhookEndpoint): void
  listEndpoints(tenantId: string): WebhookEndpoint[]
  putDelivery(delivery: WebhookDelivery): void
  pending(tenantId: string, dueBefore: string): WebhookDelivery[]
  deliveries(tenantId: string): WebhookDelivery[]
  markAttempt(tenantId: string, deliveryId: string, attempts: number, nextAttemptAt: string): void
  markDelivered(tenantId: string, deliveryId: string, deliveredAt: string): void
  markFailed(tenantId: string, deliveryId: string, error: string): void
}

export function enqueueWebhookDeliveries(
  tenantId: string,
  event: { kind: string; at: string },
  endpoints: readonly WebhookEndpoint[],
  store: WebhookStore,
  now: Date,
): WebhookDelivery[] {
  const deliveries: WebhookDelivery[] = []
  for (const endpoint of endpoints) {
    if (!endpoint.active) continue
    const delivery: WebhookDelivery = {
      tenantId,
      deliveryId: `wh-${now.getTime()}-${endpoint.webhookId}-${event.kind}-${event.at}`,
      webhookId: endpoint.webhookId,
      payloadJson: JSON.stringify(event),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      createdAt: now.toISOString(),
    }
    store.putDelivery(delivery)
    deliveries.push(delivery)
  }
  return deliveries
}

export const WEBHOOK_MAX_ATTEMPTS = 5
export const WEBHOOK_RETRY_BASE_MS = 1_000

export type WebhookDeliverySummary = {
  delivered: number
  failed: number
  pending: number
}

/**
 * Deliver due webhooks with bounded retries and exponential backoff.
 * `deliver` is injected so tests exercise retry semantics without a network.
 */
export function deliverPendingWebhooks(
  tenantId: string,
  store: WebhookStore,
  now: Date,
  deliver: (
    url: string,
    payloadJson: string,
  ) => Promise<{ ok: boolean; status?: number; error?: string }>,
  maxAttempts: number = WEBHOOK_MAX_ATTEMPTS,
): Promise<WebhookDeliverySummary> {
  return (async () => {
    const due = store.pending(tenantId, now.toISOString())
    const endpoints = new Map(store.listEndpoints(tenantId).map((endpoint) => [endpoint.webhookId, endpoint]))
    let delivered = 0
    let failed = 0
    let pending = 0
    for (const delivery of due) {
      const endpoint = endpoints.get(delivery.webhookId)
      if (!endpoint || !endpoint.active) {
        store.markFailed(tenantId, delivery.deliveryId, "endpoint missing or inactive")
        failed++
        continue
      }
      const result = await deliver(endpoint.url, delivery.payloadJson)
      const attempts = delivery.attempts + 1
      if (result.ok) {
        store.markDelivered(tenantId, delivery.deliveryId, now.toISOString())
        delivered++
      } else if (attempts >= maxAttempts) {
        store.markFailed(
          tenantId,
          delivery.deliveryId,
          result.error ?? `http ${result.status ?? "unknown"}`,
        )
        failed++
      } else {
        const nextAttemptAt = new Date(
          now.getTime() + WEBHOOK_RETRY_BASE_MS * 2 ** (attempts - 1),
        ).toISOString()
        store.markAttempt(tenantId, delivery.deliveryId, attempts, nextAttemptAt)
        pending++
      }
    }
    return { delivered, failed, pending }
  })()
}
