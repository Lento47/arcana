import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import {
  applyPolicySyncResponse,
  applyRevocationSyncResponse,
  SqliteSyncStateStore,
} from "../../src/node/sync-state"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function baseContext(overrides: Partial<SyncResponseContext> = {}): SyncResponseContext {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    clientNonce: "nonce-1",
    serverNonce: "server-nonce-1",
    nodeId: "node-alpha",
    serverIdentity: "issuer-arcana",
    responseKind: "NO_CHANGE",
    issuedAt: NOW.toISOString(),
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("D-6B-T node sync state persistence", () => {
  it("applies and persists a policy snapshot", () => {
    const store = new SqliteSyncStateStore(new Database(":memory:"))
    const result = applyPolicySyncResponse(
      baseContext({
        responseKind: "POLICY_SNAPSHOT",
        policySequence: 1,
        policyDigest: "digest-1",
        envelope: { sequence: 1, policyDigest: "digest-1" },
      }),
      store,
      NOW,
    )
    expect(result).toEqual({ applied: "SNAPSHOT", sequence: 1, digest: "digest-1" })
    expect(store.get("policy")).toMatchObject({ sequence: 1, digest: "digest-1" })
  })

  it("applies a contiguous policy delta and is idempotent on retry", () => {
    const store = new SqliteSyncStateStore(new Database(":memory:"))
    applyPolicySyncResponse(
      baseContext({
        responseKind: "POLICY_SNAPSHOT",
        policySequence: 1,
        policyDigest: "digest-1",
        envelope: { sequence: 1, policyDigest: "digest-1" },
      }),
      store,
      NOW,
    )
    const delta = applyPolicySyncResponse(
      baseContext({
        responseKind: "POLICY_DELTA",
        policySequence: 2,
        policyDigest: "digest-2",
        delta: { sequence: 2, basePolicyDigest: "digest-1", resultPolicyDigest: "digest-2" },
        envelope: { sequence: 2, policyDigest: "digest-2", previousPolicyDigest: "digest-1" },
      }),
      store,
      NOW,
    )
    expect(delta).toEqual({ applied: "DELTA", sequence: 2, digest: "digest-2" })

    const retry = applyPolicySyncResponse(
      baseContext({
        responseKind: "POLICY_DELTA",
        policySequence: 2,
        policyDigest: "digest-2",
        delta: { sequence: 2, basePolicyDigest: "digest-1", resultPolicyDigest: "digest-2" },
        envelope: { sequence: 2, policyDigest: "digest-2", previousPolicyDigest: "digest-1" },
      }),
      store,
      NOW,
    )
    expect(retry.applied).toBe("IDEMPOTENT")
  })

  it("rejects a policy delta whose base does not match persisted state", () => {
    const store = new SqliteSyncStateStore(new Database(":memory:"))
    applyPolicySyncResponse(
      baseContext({
        responseKind: "POLICY_SNAPSHOT",
        policySequence: 1,
        policyDigest: "digest-1",
        envelope: { sequence: 1, policyDigest: "digest-1" },
      }),
      store,
      NOW,
    )
    expect(() =>
      applyPolicySyncResponse(
        baseContext({
          responseKind: "POLICY_DELTA",
          policySequence: 3,
          policyDigest: "digest-3",
          delta: { sequence: 3, basePolicyDigest: "digest-2", resultPolicyDigest: "digest-3" },
          envelope: { sequence: 3, policyDigest: "digest-3", previousPolicyDigest: "digest-2" },
        }),
        store,
        NOW,
      ),
    ).toThrow(/base mismatch/)
  })

  it("applies revocation snapshots and contiguous deltas, and no-ops on NO_CHANGE", () => {
    const store = new SqliteSyncStateStore(new Database(":memory:"))
    const noChange = applyRevocationSyncResponse(
      baseContext({ responseKind: "NO_CHANGE" }),
      store,
      NOW,
    )
    expect(noChange.applied).toBe("NO_CHANGE")

    applyRevocationSyncResponse(
      baseContext({
        responseKind: "REVOCATION_SNAPSHOT",
        revocationSequence: 1,
        revocationDigest: "rev-1",
        envelope: { sequence: 1 },
      }),
      store,
      NOW,
    )
    const delta = applyRevocationSyncResponse(
      baseContext({
        responseKind: "REVOCATION_DELTA",
        revocationSequence: 2,
        revocationDigest: "rev-2",
        envelopes: [{ sequence: 2 }],
      }),
      store,
      NOW,
    )
    expect(delta).toEqual({ applied: "DELTA", sequence: 2, digest: "rev-2" })

    const retry = applyRevocationSyncResponse(
      baseContext({
        responseKind: "REVOCATION_DELTA",
        revocationSequence: 2,
        revocationDigest: "rev-2",
        envelopes: [{ sequence: 2 }],
      }),
      store,
      NOW,
    )
    expect(retry.applied).toBe("IDEMPOTENT")
  })
})
