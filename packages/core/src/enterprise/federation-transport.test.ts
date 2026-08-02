/**
 * F8: federated revocation transport tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteFederationStore } from "./federation-sqlite"
import { SqliteFederationTransportStore } from "./federation-transport-sqlite"
import { queueRevocationDelivery, receiveRevocationDelivery } from "./federation-transport"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function agreements(agreementId = "agree-1") {
  const store = new SqliteFederationStore(new Database(":memory:"))
  store.putAgreement({
    agreementId,
    version: 1,
    orgA: "org-a",
    orgB: "org-b",
    audienceRestrictions: [],
    validFrom: new Date(NOW.getTime() - 60_000).toISOString(),
    validTo: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
  })
  return store
}

describe("F8 federated revocation transport", () => {
  it("queues deliveries only under active agreements", () => {
    const store = new SqliteFederationTransportStore(new Database(":memory:"))
    const queued = queueRevocationDelivery(
      {
        orgId: "org-a",
        agreementId: "agree-1",
        subjectId: "node-bad",
        reason: "compromised",
        now: NOW,
      },
      agreements(),
      store,
    )
    expect(queued.kind).toBe("QUEUED")
    if (queued.kind === "QUEUED") {
      expect(queued.record.subjectId).toBe("node-bad")
    }

    const rejected = queueRevocationDelivery(
      {
        orgId: "org-a",
        agreementId: "agree-unknown",
        subjectId: "node-bad",
        reason: "compromised",
        now: NOW,
      },
      agreements(),
      store,
    )
    expect(rejected).toMatchObject({ kind: "REJECTED" })
    expect(store.pending("org-a")).toHaveLength(1)
  })

  it("marks deliveries delivered or failed and tracks pending state", () => {
    const store = new SqliteFederationTransportStore(new Database(":memory:"))
    const queued = queueRevocationDelivery(
      {
        orgId: "org-a",
        agreementId: "agree-1",
        subjectId: "node-1",
        reason: "compromised",
        now: NOW,
      },
      agreements(),
      store,
    )
    if (queued.kind !== "QUEUED") throw new Error("expected queued")
    store.markDelivered("org-a", queued.record.deliveryId, NOW.toISOString())
    expect(store.pending("org-a")).toHaveLength(0)

    const second = queueRevocationDelivery(
      {
        orgId: "org-a",
        agreementId: "agree-1",
        subjectId: "node-2",
        reason: "compromised",
        now: NOW,
      },
      agreements(),
      store,
    )
    if (second.kind !== "QUEUED") throw new Error("expected queued")
    store.markFailed("org-a", second.record.deliveryId, "transport timeout")
    expect(store.pending("org-a")).toHaveLength(0)
  })

  it("receives and deduplicates inbound revocations", () => {
    const store = new SqliteFederationTransportStore(new Database(":memory:"))
    const first = receiveRevocationDelivery(
      {
        orgId: "org-b",
        agreementId: "agree-1",
        senderOrgId: "org-a",
        subjectId: "node-bad",
        reason: "compromised",
        now: NOW,
      },
      agreements(),
      store,
    )
    expect(first.kind).toBe("RECEIVED")
    expect(store.received("org-b")).toHaveLength(1)

    const duplicate = receiveRevocationDelivery(
      {
        orgId: "org-b",
        agreementId: "agree-1",
        senderOrgId: "org-a",
        subjectId: "node-bad",
        reason: "compromised",
        now: new Date(NOW.getTime() + 1000),
      },
      agreements(),
      store,
    )
    expect(duplicate.kind).toBe("RECEIVED")
    expect(store.received("org-b")).toHaveLength(1)

    const expiredStore = new SqliteFederationStore(new Database(":memory:"))
    expiredStore.putAgreement({
      agreementId: "agree-expired",
      version: 1,
      orgA: "org-a",
      orgB: "org-b",
      audienceRestrictions: [],
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-08-01T23:59:59.000Z",
      status: "ACTIVE",
    })
    const unvalidated = receiveRevocationDelivery(
      {
        orgId: "org-b",
        agreementId: "agree-expired",
        senderOrgId: "org-a",
        subjectId: "node-bad-2",
        reason: "compromised",
        now: NOW,
      },
      expiredStore,
      store,
    )
    expect(unvalidated.kind).toBe("REJECTED")
  })
})
