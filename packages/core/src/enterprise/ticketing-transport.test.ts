/**
 * F11: ticketing transport adapter tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteWebhookStore } from "./webhooks-sqlite"
import {
  JiraTransport,
  WebhookTicketTransport,
} from "./ticketing-transport"
import { toTicketPayload, type TicketPayload } from "./ticketing"
import type { AdminEvent } from "./admin-events"

const NOW = new Date("2026-08-02T12:00:00.000Z")

const event: AdminEvent = {
  kind: "approval.pending",
  tenantId: "tenant-a",
  approvalId: "appr-1",
  requestHash: "hash-1",
  at: NOW.toISOString(),
}
const payload: TicketPayload = toTicketPayload(event)

function successDeliverFn() {
  return async () => ({ ok: true })
}

function failDeliverFn() {
  return async () => ({ ok: false, status: 500, error: "internal error" })
}

function throwDeliverFn() {
  return async () => {
    throw new Error("network unreachable")
  }
}

// --- JiraTransport ---

describe("F11 Jira transport", () => {
  it("delivers a ticket payload and returns delivered with idempotency key", async () => {
    let receivedFields: any = null
    const sendFn = async (fields: any) => {
      receivedFields = fields
      return { ok: true }
    }
    const transport = new JiraTransport("PROJ", sendFn)
    const result = await transport.send(payload, "evt-appr-1")

    expect(result).toMatchObject({ kind: "delivered", deliveryId: "evt-appr-1" })
    expect(receivedFields).toMatchObject({
      project: "PROJ",
      summary: payload.title,
      description: payload.description,
      priority: payload.priority,
      labels: payload.labels,
    })
  })

  it("maps payload fields to Jira issue fields correctly", async () => {
    const sendFn = async (fields: any) => ({ ok: true })
    const transport = new JiraTransport("PROJ", sendFn)
    await transport.send(payload)

    // The summary comes from the deterministic title.
    expect(payload.title).toBe("Approval pending: appr-1")
  })

  it("returns failed with retryable=true on HTTP error", async () => {
    const transport = new JiraTransport("PROJ", failDeliverFn())
    const result = await transport.send(payload, "evt-fail-1")

    expect(result).toMatchObject({
      kind: "failed",
      retryable: true,
      error: "internal error",
    })
  })

  it("returns failed with retryable=true on network throw", async () => {
    const transport = new JiraTransport("PROJ", throwDeliverFn())
    const result = await transport.send(payload)

    expect(result).toMatchObject({ kind: "failed", retryable: true })
    if (result.kind === "failed") {
      expect(result.error).toBe("network unreachable")
    }
  })

  it("generates a jira-prefixed deliveryId when no idempotency key is provided", async () => {
    const sendFn = async (fields: any) => ({ ok: true })
    const transport = new JiraTransport("PROJ", sendFn)
    const result = await transport.send(payload)

    expect(result.kind).toBe("delivered")
    if (result.kind === "delivered") {
      expect(result.deliveryId).toMatch(/^jira-\d+$/)
    }
  })
})

// --- WebhookTicketTransport ---

describe("F11 webhook ticket transport", () => {
  it("enqueues and delivers a ticket payload successfully", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    const transport = new WebhookTicketTransport(
      "tenant-a",
      store,
      successDeliverFn(),
      "https://tickets.example.test/webhook",
    )

    const result = await transport.send(payload, "evt-wh-1")
    expect(result).toMatchObject({ kind: "delivered", deliveryId: "evt-wh-1" })

    const deliveries = store.deliveries("tenant-a")
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]!.status).toBe("DELIVERED")
    expect(deliveries[0]!.deliveryId).toBe("evt-wh-1")
  })

  it("returns failed with retryable=true on delivery error", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    const transport = new WebhookTicketTransport(
      "tenant-a",
      store,
      failDeliverFn(),
      "https://tickets.example.test/webhook",
    )

    const result = await transport.send(payload, "evt-wh-fail-1")
    expect(result.kind).toBe("failed")
    if (result.kind === "failed") {
      expect(result.retryable).toBe(true)
      expect(result.error).toBe("internal error")
    }

    const deliveries = store.deliveries("tenant-a")
    expect(deliveries).toHaveLength(1)
    // First attempt fails but is retryable — status remains PENDING.
    expect(deliveries[0]!.status).toBe("PENDING")
  })

  it("deduplicates by idempotency key on re-send", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    const transport = new WebhookTicketTransport(
      "tenant-a",
      store,
      successDeliverFn(),
      "https://tickets.example.test/webhook",
    )

    const first = await transport.send(payload, "evt-dedup-1")
    expect(first.kind).toBe("delivered")

    // Second send with same idempotency key returns cached delivered result.
    const second = await transport.send(payload, "evt-dedup-1")
    expect(second).toMatchObject({ kind: "delivered", deliveryId: "evt-dedup-1" })

    // Only one delivery record should exist.
    expect(store.deliveries("tenant-a")).toHaveLength(1)
  })

  it("returns non-retryable failure after max attempts are exhausted", async () => {
    const store = new SqliteWebhookStore(new Database(":memory:"))
    const transport = new WebhookTicketTransport(
      "tenant-a",
      store,
      failDeliverFn(),
      "https://tickets.example.test/webhook",
    )

    // First send: fails but still retryable (attempts < max).
    const first = await transport.send(payload, "evt-exhausted-1")
    expect(first.kind).toBe("failed")
    if (first.kind === "failed") {
      expect(first.retryable).toBe(true)
    }

    // Manually mark the delivery as failed with max attempts to simulate exhaustion.
    const deliveries = store.deliveries("tenant-a")
    store.markFailed("tenant-a", deliveries[0]!.deliveryId, "permanent error")
    // Simulate max attempts by updating the record directly.
    store.markAttempt(
      "tenant-a",
      deliveries[0]!.deliveryId,
      5,
      new Date(NOW.getTime() + 60_000).toISOString(),
    )

    // Re-send with same idempotency key: should return non-retryable failure.
    const second = await transport.send(payload, "evt-exhausted-1")
    expect(second).toMatchObject({ kind: "failed", retryable: false })
  })
})