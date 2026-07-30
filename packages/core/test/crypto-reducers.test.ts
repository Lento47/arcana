import { describe, expect, test } from "bun:test"
import {
  reducePolicyState,
  reduceRevocationState,
  reduceOfflineState,
  reduceNodeRuntimeState,
  INITIAL_POLICY_STATE,
  INITIAL_NODE_STATE,
  type PolicySyncState,
  type RevocationSyncState,
  type OfflineRuntimeState,
  type NodeRuntimeState,
} from "../src/crypto/reducers"

// ─── D-4A: Policy Reducer ────────────────────────────────────────────

describe("policy reducer", () => {
  const baseInput = {
    kind: "SNAPSHOT" as const,
    issuerId: "issuer-alpha",
    issuerEpoch: 1,
    sequence: 1,
    digest: "abc123",
    expiresAt: "2026-12-31T23:59:59.999Z",
    receivedAt: "2026-07-29T12:00:00.000Z",
  }

  test("first input initializes state", () => {
    const result = reducePolicyState(INITIAL_POLICY_STATE, baseInput)
    expect(result.status).toBe("APPLIED")
    expect(result.state.acceptedSequence).toBe(1)
    expect(result.state.acceptedDigest).toBe("abc123")
    expect(result.state.status).toBe("CURRENT")
  })

  test("higher sequence applies", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, { ...baseInput, sequence: 2, digest: "def456" })
    expect(result.status).toBe("APPLIED")
    expect(result.state.acceptedSequence).toBe(2)
    expect(result.state.acceptedDigest).toBe("def456")
  })

  test("exact duplicate is idempotent", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, baseInput)
    expect(result.status).toBe("IDEMPOTENT")
    expect(result.state).toBe(state) // same reference
  })

  test("sequence rollback is rejected", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, { ...baseInput, sequence: 5 }).state
    const result = reducePolicyState(state, { ...baseInput, sequence: 3 })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("SEQUENCE_ROLLBACK")
    expect(result.state.acceptedSequence).toBe(5) // unchanged
  })

  test("epoch rollback is rejected", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, { ...baseInput, issuerEpoch: 5 }).state
    const result = reducePolicyState(state, { ...baseInput, issuerEpoch: 3 })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("EPOCH_ROLLBACK")
    expect(result.state.issuerEpoch).toBe(5) // unchanged
  })

  test("issuer mismatch is rejected", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, { ...baseInput, issuerId: "other-issuer" })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("ISSUER_MISMATCH")
  })

  test("same sequence different digest is rejected", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, { ...baseInput, digest: "tampered" })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("SEQUENCE_CONFLICT")
  })

  test("broken previous digest chain is rejected", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, {
      ...baseInput,
      kind: "SNAPSHOT",
      sequence: 2,
      digest: "new",
      previousDigest: "wrong-digest",
    })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("CHAIN_MISMATCH")
  })

  test("policy sequence never decreases (property)", () => {
    let state = INITIAL_POLICY_STATE
    const inputs = [
      { ...baseInput, sequence: 1 },
      { ...baseInput, sequence: 3 },
      { ...baseInput, sequence: 2 }, // rollback
      { ...baseInput, sequence: 5 },
      { ...baseInput, sequence: 4 }, // rollback
      { ...baseInput, sequence: 5 }, // duplicate
    ]
    for (const input of inputs) {
      const result = reducePolicyState(state, input)
      expect(result.state.acceptedSequence).toBeGreaterThanOrEqual(state.acceptedSequence)
      state = result.state
    }
    expect(state.acceptedSequence).toBe(5)
  })

  test("epoch never decreases (property)", () => {
    let state = INITIAL_POLICY_STATE
    const inputs = [
      { ...baseInput, issuerEpoch: 1, sequence: 1 },
      { ...baseInput, issuerEpoch: 3, sequence: 2 },
      { ...baseInput, issuerEpoch: 2, sequence: 3 }, // epoch rollback
      { ...baseInput, issuerEpoch: 5, sequence: 4 },
    ]
    for (const input of inputs) {
      const result = reducePolicyState(state, input)
      expect(result.state.issuerEpoch).toBeGreaterThanOrEqual(state.issuerEpoch)
      state = result.state
    }
    expect(state.issuerEpoch).toBe(5)
  })

  test("rejected transitions preserve state identity", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const result = reducePolicyState(state, { ...baseInput, sequence: 0 })
    expect(result.status).toBe("REJECTED")
    expect(result.state).toBe(state) // same reference, no mutation
  })

  test("reducer determinism: same input produces same output", () => {
    const state = reducePolicyState(INITIAL_POLICY_STATE, baseInput).state
    const a = reducePolicyState(state, { ...baseInput, sequence: 2, digest: "new" })
    const b = reducePolicyState(state, { ...baseInput, sequence: 2, digest: "new" })
    expect(a.status).toBe(b.status)
    expect(a.state.acceptedSequence).toBe(b.state.acceptedSequence)
    expect(a.state.acceptedDigest).toBe(b.state.acceptedDigest)
  })
})

// ─── D-4B: Revocation Reducer ────────────────────────────────────────

describe("revocation reducer", () => {
  const baseInput = {
    issuerId: "issuer-alpha",
    issuerEpoch: 1,
    sequence: 1,
    subjectType: "GRANT" as const,
    subjectId: "grant-001",
    receivedAt: "2026-07-29T12:00:00.000Z",
  }

  test("first revocation initializes state", () => {
    const state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    const result = reduceRevocationState(state, baseInput)
    expect(result.status).toBe("APPLIED")
    expect(result.state.revokedGrantIds.has("grant-001")).toBe(true)
  })

  test("duplicate statement is idempotent", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, baseInput).state
    const result = reduceRevocationState(state, baseInput)
    expect(result.status).toBe("IDEMPOTENT")
  })

  test("older sequence is rejected", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, { ...baseInput, sequence: 5 }).state
    const result = reduceRevocationState(state, { ...baseInput, sequence: 3, subjectId: "grant-002" })
    expect(result.status).toBe("REJECTED")
    expect(result.reason).toBe("SEQUENCE_ROLLBACK")
  })

  test("revoked subject never resurrects", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, baseInput).state
    expect(state.revokedGrantIds.has("grant-001")).toBe(true)
    // Even after many more operations, grant-001 stays revoked
    state = reduceRevocationState(state, { ...baseInput, sequence: 2, subjectId: "grant-002" }).state
    state = reduceRevocationState(state, { ...baseInput, sequence: 3, subjectId: "grant-003" }).state
    expect(state.revokedGrantIds.has("grant-001")).toBe(true)
    expect(state.revokedGrantIds.has("grant-002")).toBe(true)
    expect(state.revokedGrantIds.has("grant-003")).toBe(true)
  })

  test("node revocation", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, { ...baseInput, subjectType: "NODE", subjectId: "node-beta" }).state
    expect(state.revokedNodeIds.has("node-beta")).toBe(true)
  })

  test("issuer-key revocation cascades emergency epoch", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, { ...baseInput, subjectType: "ISSUER_KEY", subjectId: "key-001", issuerEpoch: 5 }).state
    expect(state.emergencyEpoch).toBe(5)
    expect(state.revokedIssuerEpochs.get("key-001")).toBe(5)
  })

  test("emergency epoch only increases", () => {
    let state: RevocationSyncState = {
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE",
    }
    state = reduceRevocationState(state, { ...baseInput, subjectType: "ISSUER_KEY", subjectId: "k1", issuerEpoch: 5, sequence: 1 }).state
    expect(state.emergencyEpoch).toBe(5)
    state = reduceRevocationState(state, { ...baseInput, subjectType: "ISSUER_KEY", subjectId: "k2", issuerEpoch: 3, sequence: 2 }).state
    expect(state.emergencyEpoch).toBe(5) // not decreased
    state = reduceRevocationState(state, { ...baseInput, subjectType: "ISSUER_KEY", subjectId: "k3", issuerEpoch: 8, sequence: 3 }).state
    expect(state.emergencyEpoch).toBe(8) // increased
  })
})

// ─── D-4C: Offline Authority Reducer ─────────────────────────────────

describe("offline authority reducer", () => {
  const onlineState: OfflineRuntimeState = {
    connectivity: "ONLINE",
    enforcement: "ONLINE",
    policyFreshnessMs: 1000,
    revocationFreshnessMs: 1000,
    offlineElapsedMs: 0,
  }

  test("connection loss moves to OFFLINE_RESTRICTED", () => {
    const result = reduceOfflineState(onlineState, { kind: "CONNECTION_LOST" })
    expect(result.connectivity).toBe("OFFLINE")
    expect(result.enforcement).toBe("OFFLINE_RESTRICTED")
  })

  test("time elapsed escalates enforcement", () => {
    let state = reduceOfflineState(onlineState, { kind: "CONNECTION_LOST" })
    // After 10 minutes + 1ms: escalates to OFFLINE_READ_ONLY
    state = reduceOfflineState(state, { kind: "MONOTONIC_TIME_ELAPSED", milliseconds: 600_001 })
    expect(state.enforcement).toBe("OFFLINE_READ_ONLY")
  })

  test("identity revoked immediately quarantines", () => {
    const result = reduceOfflineState(onlineState, { kind: "IDENTITY_REVOKED" })
    expect(result.enforcement).toBe("QUARANTINED")
  })

  test("full sync restores ONLINE", () => {
    let state = reduceOfflineState(onlineState, { kind: "CONNECTION_LOST" })
    state = reduceOfflineState(state, { kind: "MONOTONIC_TIME_ELAPSED", milliseconds: 600_000 })
    expect(state.enforcement).not.toBe("ONLINE")
    state = reduceOfflineState(state, { kind: "FULL_SYNC_COMPLETED" })
    expect(state.connectivity).toBe("ONLINE")
    expect(state.enforcement).toBe("ONLINE")
    expect(state.offlineElapsedMs).toBe(0)
  })

  test("offline authority never increases (property)", () => {
    const enforcementRank = (e: string) => {
      if (e === "ONLINE") return 3
      if (e === "OFFLINE_RESTRICTED") return 2
      if (e === "OFFLINE_READ_ONLY") return 1
      return 0 // QUARANTINED
    }

    let state = reduceOfflineState(onlineState, { kind: "CONNECTION_LOST" })
    const events = [
      { kind: "MONOTONIC_TIME_ELAPSED" as const, milliseconds: 100_000 },
      { kind: "POLICY_EXPIRED" as const },
      { kind: "MONOTONIC_TIME_ELAPSED" as const, milliseconds: 500_000 },
      { kind: "REVOCATION_LEASE_EXPIRED" as const },
      { kind: "MONOTONIC_TIME_ELAPSED" as const, milliseconds: 3_600_001 },
    ]
    for (const event of events) {
      const prev = enforcementRank(state.enforcement)
      state = reduceOfflineState(state, event)
      const next = enforcementRank(state.enforcement)
      expect(next).toBeLessThanOrEqual(prev)
    }
    expect(state.enforcement).toBe("QUARANTINED")
  })
})

// ─── D-4D: Composite Node Reducer ────────────────────────────────────

describe("composite node runtime reducer", () => {
  test("unregistered node starts QUARANTINED", () => {
    expect(INITIAL_NODE_STATE.enforcement).toBe("QUARANTINED")
    expect(INITIAL_NODE_STATE.identity).toBe("UNREGISTERED")
  })

  test("identity REVOKED forces QUARANTINED", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
    state = reduceNodeRuntimeState(state, { kind: "FULL_SYNC_COMPLETED" })
    expect(state.enforcement).toBe("ONLINE")
    state = reduceNodeRuntimeState(state, { kind: "IDENTITY_REVOKED" })
    expect(state.enforcement).toBe("QUARANTINED")
    expect(state.identity).toBe("REVOKED")
  })

  test("policy INVALID forces QUARANTINED", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
    state = reduceNodeRuntimeState(state, { kind: "CONNECTION_RESTORED" })
    state = reduceNodeRuntimeState(state, { kind: "POLICY_CURRENT" })
    state = reduceNodeRuntimeState(state, { kind: "REVOCATION_CURRENT" })
    expect(state.enforcement).toBe("ONLINE")
    state = reduceNodeRuntimeState(state, { kind: "POLICY_INVALID" })
    expect(state.enforcement).toBe("QUARANTINED")
  })

  test("revocation INVALID forces QUARANTINED", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
    state = reduceNodeRuntimeState(state, { kind: "CONNECTION_RESTORED" })
    state = reduceNodeRuntimeState(state, { kind: "POLICY_CURRENT" })
    state = reduceNodeRuntimeState(state, { kind: "REVOCATION_CURRENT" })
    expect(state.enforcement).toBe("ONLINE")
    state = reduceNodeRuntimeState(state, { kind: "REVOCATION_INVALID" })
    expect(state.enforcement).toBe("QUARANTINED")
  })

  test("identity not TRUSTED means QUARANTINED", () => {
    const state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_REGISTERED" })
    expect(state.identity).toBe("PENDING")
    expect(state.enforcement).toBe("QUARANTINED")
  })

  test("full sync brings everything online if identity is trusted", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
    state = reduceNodeRuntimeState(state, { kind: "FULL_SYNC_COMPLETED" })
    expect(state.connectivity).toBe("ONLINE")
    expect(state.policy).toBe("CURRENT")
    expect(state.revocation).toBe("CURRENT")
    expect(state.enforcement).toBe("ONLINE")
  })

  test("offline + trusted = OFFLINE_RESTRICTED", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
    state = reduceNodeRuntimeState(state, { kind: "FULL_SYNC_COMPLETED" })
    expect(state.enforcement).toBe("ONLINE")
    state = reduceNodeRuntimeState(state, { kind: "CONNECTION_LOST" })
    expect(state.enforcement).toBe("OFFLINE_RESTRICTED")
  })

  test("quarantined nodes never gain consequential authority", () => {
    let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_REVOKED" })
    expect(state.enforcement).toBe("QUARANTINED")
    // Even with good policy and revocation, still quarantined
    state = reduceNodeRuntimeState(state, { kind: "POLICY_CURRENT" })
    state = reduceNodeRuntimeState(state, { kind: "REVOCATION_CURRENT" })
    state = reduceNodeRuntimeState(state, { kind: "CONNECTION_RESTORED" })
    expect(state.enforcement).toBe("QUARANTINED") // identity is REVOKED
  })

  test("reducer determinism: same state + same event = same result", () => {
    const state: NodeRuntimeState = {
      identity: "TRUSTED", connectivity: "ONLINE", enforcement: "ONLINE",
      policy: "CURRENT", revocation: "CURRENT",
    }
    const a = reduceNodeRuntimeState(state, { kind: "POLICY_STALE" })
    const b = reduceNodeRuntimeState(state, { kind: "POLICY_STALE" })
    expect(a).toEqual(b)
  })

  test("event replay produces same final state", () => {
    const events = [
      { kind: "IDENTITY_REGISTERED" as const },
      { kind: "CONNECTION_RESTORED" as const },
      { kind: "IDENTITY_TRUSTED" as const },
      { kind: "POLICY_CURRENT" as const },
      { kind: "REVOCATION_CURRENT" as const },
      { kind: "CONNECTION_LOST" as const },
      { kind: "POLICY_STALE" as const },
      { kind: "FULL_SYNC_COMPLETED" as const },
    ]

    let stateA = INITIAL_NODE_STATE
    for (const event of events) {
      stateA = reduceNodeRuntimeState(stateA, event)
    }

    let stateB = INITIAL_NODE_STATE
    for (const event of events) {
      stateB = reduceNodeRuntimeState(stateB, event)
    }

    expect(stateA).toEqual(stateB)
  })
})
