/**
 * F11: Live ticketing transport adapters.
 *
 * Transport abstraction for ticketing payloads with two concrete
 * adapters: a Jira-style adapter (injectable HTTP, idempotency key)
 * and a generic webhook adapter (reuses the webhook-sink pattern
 * for durable enqueue, retry/backoff, and delivery state).
 */

import type { TicketPayload } from "./ticketing"
import type { WebhookDelivery, WebhookEndpoint, WebhookStore } from "./webhooks"
import {
  deliverPendingWebhooks,
  WEBHOOK_MAX_ATTEMPTS,
} from "./webhooks"

// --- Delivery result ---

export type TicketDeliveryResult =
  | { kind: "delivered"; deliveryId: string }
  | { kind: "failed"; retryable: boolean; error: string }

// --- Transport abstraction ---

export interface TicketTransport {
  send(payload: TicketPayload, idempotencyKey?: string): Promise<TicketDeliveryResult>
}

// --- Jira-style adapter ---

export type JiraIssueFields = {
  project: string
  summary: string
  description: string
  priority: string
  labels: string[]
}

export class JiraTransport implements TicketTransport {
  constructor(
    private readonly projectKey: string,
    private readonly sendFn: (fields: JiraIssueFields) => Promise<{
      ok: boolean
      status?: number
      error?: string
    }>,
  ) {}

  async send(
    payload: TicketPayload,
    idempotencyKey?: string,
  ): Promise<TicketDeliveryResult> {
    const fields: JiraIssueFields = {
      project: this.projectKey,
      summary: payload.title,
      description: payload.description,
      priority: payload.priority,
      labels: payload.labels,
    }

    try {
      const result = await this.sendFn(fields)
      if (result.ok) {
        return { kind: "delivered", deliveryId: idempotencyKey ?? `jira-${Date.now()}` }
      }
      return {
        kind: "failed",
        retryable: true,
        error: result.error ?? `http ${result.status ?? "unknown"}`,
      }
    } catch (err) {
      return {
        kind: "failed",
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

// --- Generic webhook adapter ---

export class WebhookTicketTransport implements TicketTransport {
  private readonly endpoint: WebhookEndpoint
  private lastError: string | undefined

  constructor(
    private readonly tenantId: string,
    private readonly store: WebhookStore,
    private readonly deliverFn: (
      url: string,
      payloadJson: string,
    ) => Promise<{ ok: boolean; status?: number; error?: string }>,
    endpointUrl: string,
  ) {
    this.endpoint = {
      tenantId,
      webhookId: "ticket-webhook",
      url: endpointUrl,
      active: true,
      createdAt: new Date().toISOString(),
    }
    store.putEndpoint(this.endpoint)
  }

  async send(
    payload: TicketPayload,
    idempotencyKey?: string,
  ): Promise<TicketDeliveryResult> {
    const deliveryId = idempotencyKey ?? `ticket-${Date.now()}`

    // Dedup by event id: if a delivery with this idempotency key already
    // exists and is terminal, return the cached result.
    if (idempotencyKey) {
      const existing = this.store
        .deliveries(this.tenantId)
        .find((d) => d.deliveryId === deliveryId)
      if (existing) {
        if (existing.status === "DELIVERED") {
          return { kind: "delivered", deliveryId }
        }
        if (existing.status === "FAILED") {
          return {
            kind: "failed",
            retryable: false,
            error: existing.lastError ?? "permanently failed",
          }
        }
      }
    }

    // Enqueue the ticket payload as a webhook delivery.
    const now = new Date()
    const delivery: WebhookDelivery = {
      tenantId: this.tenantId,
      deliveryId,
      webhookId: this.endpoint.webhookId,
      payloadJson: JSON.stringify({ kind: "ticket.create", payload, at: now.toISOString() }),
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      createdAt: now.toISOString(),
    }
    this.store.putDelivery(delivery)

    // Wrap the deliver function to capture the last error for
    // intermediate failures (markAttempt clears last_error).
    const wrappedDeliver = async (
      url: string,
      payloadJson: string,
    ) => {
      try {
        const result = await this.deliverFn(url, payloadJson)
        if (!result.ok) {
          this.lastError =
            result.error ?? `http ${result.status ?? "unknown"}`
        }
        return result
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        return { ok: false, error: this.lastError }
      }
    }

    // Process pending deliveries with bounded retry/backoff.
    try {
      await deliverPendingWebhooks(
        this.tenantId,
        this.store,
        now,
        wrappedDeliver,
      )
    } catch (err) {
      return {
        kind: "failed",
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // Inspect the result from the store.
    const result = this.store
      .deliveries(this.tenantId)
      .find((d) => d.deliveryId === deliveryId)

    if (result?.status === "DELIVERED") {
      return { kind: "delivered", deliveryId }
    }
    if (result?.status === "FAILED") {
      return {
        kind: "failed",
        retryable: false,
        error: result.lastError ?? this.lastError ?? "unknown",
      }
    }
    // PENDING means the delivery failed but will be retried.
    return {
      kind: "failed",
      retryable: true,
      error: this.lastError ?? "delivery pending",
    }
  }
}