/**
 * F11: webhook delivery sink tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteWebhookStore } from "./webhooks-sqlite"
import {
  deliverPendingWebhooks,
  enqueueWebhookDeliveries,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookEndpoint,
} from "./webhooks"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function endpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    tenantId: "tenant-a",
    webhookId: "wh-1",
    url: "https://hooks.example.test/arcana",
    active: true,
    createdAt: NOW.toISOString(),
    ...overrides,
  }
}

describe("F11 webhook delivery sink", () => {
  it("enqueues one delivery per active endpoint only", () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    store.putEndpoint(endpoint())
    store.putEndpoint(endpoint({ webhookId: "wh-inactive", active: false }))

    const deliveries = enqueueWebhookDeliveries(
      "tenant-a",
      { kind: "alert.critical", at: NOW.toISOString() },
      store.listEndpoints("tenant-a"),
      store,
      NOW,
    )
    expect(deliveries).toHaveLength(1)
    expect(store.deliveries("tenant-a")).toHaveLength(1)
    expect(JSON.parse(store.deliveries("tenant-a")[0]!.payloadJson)).toMatchObject({
      kind: "alert.critical",
    })
  })

  it("delivers successfully and records delivered state", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    store.putEndpoint(endpoint())
    enqueueWebhookDeliveries(
      "tenant-a",
      { kind: "node.revoked", at: NOW.toISOString() },
      store.listEndpoints("tenant-a"),
      store,
      NOW,
    )

    const summary = await deliverPendingWebhooks("tenant-a", store, NOW, async () => ({ ok: true }))
    expect(summary).toEqual({ delivered: 1, failed: 0, pending: 0 })
    expect(store.deliveries("tenant-a")[0]?.status).toBe("DELIVERED")
  })

  it("retries failures with backoff and fails closed after max attempts", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    store.putEndpoint(endpoint())
    enqueueWebhookDeliveries(
      "tenant-a",
      { kind: "alert.critical", at: NOW.toISOString() },
      store.listEndpoints("tenant-a"),
      store,
      NOW,
    )

    let calls = 0
    const fail = async () => {
      calls++
      return { ok: false, status: 500 }
    }

    const first = await deliverPendingWebhooks("tenant-a", store, NOW, fail)
    expect(first).toEqual({ delivered: 0, failed: 0, pending: 1 })
    expect(store.deliveries("tenant-a")[0]?.attempts).toBe(1)

    const later = new Date(NOW.getTime() + 60_000)
    const second = await deliverPendingWebhooks("tenant-a", store, later, fail)
    expect(second.pending).toBe(1)
    expect(calls).toBe(2)

    // Force immediate failure after the retry budget is exhausted.
    const exhausted = await deliverPendingWebhooks(
      "tenant-a",
      store,
      new Date(later.getTime() + 60_000),
      fail,
      /* maxAttempts */ 2,
    )
    expect(exhausted.failed).toBe(1)
    expect(store.deliveries("tenant-a")[0]?.status).toBe("FAILED")
    expect(store.deliveries("tenant-a")[0]?.lastError).toBe("http 500")
  })

  it("fails closed when the endpoint is missing or inactive", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    store.putEndpoint(endpoint())
    enqueueWebhookDeliveries(
      "tenant-a",
      { kind: "alert.critical", at: NOW.toISOString() },
      store.listEndpoints("tenant-a"),
      store,
      NOW,
    )
    // Deactivate the endpoint after enqueue: delivery must fail closed.
    store.putEndpoint(endpoint({ active: false }))
    const summary = await deliverPendingWebhooks("tenant-a", store, NOW, async () => ({ ok: true }))
    expect(summary.failed).toBe(1)
    expect(store.deliveries("tenant-a")[0]?.status).toBe("FAILED")
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(5)
  })
})
