/**
 * D-4 Pure Reducer Tests — standalone runner
 * Run with: bun run packages/core/src/crypto/run-reducer-tests.ts
 */

import {
  reducePolicyState,
  reduceRevocationState,
  reduceOfflineState,
  reduceNodeRuntimeState,
  INITIAL_POLICY_STATE,
  INITIAL_NODE_STATE,
  type PolicySyncState,
  type VerifiedPolicyInput,
  type RevocationSyncState,
  type VerifiedRevocationInput,
  type OfflineRuntimeState,
  type NodeRuntimeState,
} from "./reducers"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(message)
    console.log(`  ✗ ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${expected}, got ${actual}`)
}

// ─── Policy Reducer ───────────────────────────────────────────────────

console.log("D-4A Policy reducer")

{
  // First input initializes
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(INITIAL_POLICY_STATE, input)
  assertEqual(r.status, "APPLIED", "first policy initializes")
  assertEqual(r.state.acceptedSequence, 1, "first policy sets sequence")
  assertEqual(r.state.status, "CURRENT", "first policy status is CURRENT")
}

{
  // Higher sequence applies
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 2,
    previousDigest: "abc123", digest: "def456", expiresAt: "2099-12-31T23:59:59.999Z",
    receivedAt: "2026-07-29T13:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "APPLIED", "higher sequence applies")
  assertEqual(r.state.acceptedSequence, 2, "sequence updated to 2")
}

{
  // Duplicate is idempotent
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "IDEMPOTENT", "duplicate is idempotent")
}

{
  // Sequence rollback rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 5,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "sequence rollback rejected")
  assertEqual(r.reason, "SEQUENCE_ROLLBACK", "rollback reason correct")
  assertEqual(r.state.acceptedSequence, 5, "state unchanged after rollback")
}

{
  // Epoch rollback rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 5, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 3, sequence: 2,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "epoch rollback rejected")
  assertEqual(r.reason, "EPOCH_ROLLBACK", "epoch rollback reason")
}

{
  // Issuer mismatch rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-evil", issuerEpoch: 1, sequence: 2,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "issuer mismatch rejected")
  assertEqual(r.reason, "ISSUER_MISMATCH", "issuer mismatch reason")
}

{
  // Same sequence different digest rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "DIFFERENT", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "same sequence different digest rejected")
  assertEqual(r.reason, "SEQUENCE_CONFLICT", "sequence conflict reason")
}

{
  // Expired input rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 2,
    digest: "def456", expiresAt: "2020-01-01T00:00:00.000Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "expired input rejected")
  assertEqual(r.reason, "EXPIRED", "expired reason")
}

{
  // Chain mismatch rejected
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc123", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 2,
    previousDigest: "WRONG_PREV", digest: "def456", expiresAt: "2099-12-31T23:59:59.999Z",
    receivedAt: "2026-07-29T13:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "chain mismatch rejected")
  assertEqual(r.reason, "CHAIN_MISMATCH", "chain mismatch reason")
}

// ─── Revocation Reducer ───────────────────────────────────────────────

console.log("D-4B Revocation reducer")

{
  // First input initializes
  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const state: RevocationSyncState = {
    ...{
      issuerId: "", issuerEpoch: 0, acceptedSequence: 0, emergencyEpoch: 0,
      revokedGrantIds: new Set(), revokedNodeIds: new Set(),
      revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
      status: "UNAVAILABLE" as const,
    },
  }
  const r = reduceRevocationState(state, input)
  assertEqual(r.status, "APPLIED", "first revocation initializes")
  assert(r.state.revokedGrantIds.has("grant-001"), "grant added to revoked set")
}

{
  // Duplicate is idempotent
  const current: RevocationSyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1, emergencyEpoch: 0,
    revokedGrantIds: new Set(["grant-001"]), revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
    status: "CURRENT",
  }
  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reduceRevocationState(current, input)
  assertEqual(r.status, "IDEMPOTENT", "duplicate revocation is idempotent")
}

{
  // Sequence rollback rejected
  const current: RevocationSyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 5, emergencyEpoch: 0,
    revokedGrantIds: new Set(), revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
    status: "CURRENT",
  }
  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
    subjectType: "GRANT", subjectId: "grant-002", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reduceRevocationState(current, input)
  assertEqual(r.status, "REJECTED", "revocation sequence rollback rejected")
  assertEqual(r.reason, "SEQUENCE_ROLLBACK", "rollback reason")
}

{
  // New revocation applied
  const current: RevocationSyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1, emergencyEpoch: 0,
    revokedGrantIds: new Set(["grant-001"]), revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
    status: "CURRENT",
  }
  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 2,
    subjectType: "NODE", subjectId: "node-beta", receivedAt: "2026-07-29T13:00:00.000Z",
  }
  const r = reduceRevocationState(current, input)
  assertEqual(r.status, "APPLIED", "new revocation applied")
  assert(r.state.revokedNodeIds.has("node-beta"), "node added to revoked set")
  assert(r.state.revokedGrantIds.has("grant-001"), "previous grant still revoked")
}

{
  // No resurrection — old input cannot remove revocation
  const current: RevocationSyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 3, emergencyEpoch: 0,
    revokedGrantIds: new Set(["grant-001"]), revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(), revokedIssuerEpochs: new Map(),
    status: "CURRENT",
  }
  // Try to replay sequence 1 — should be rejected
  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reduceRevocationState(current, input)
  assertEqual(r.status, "REJECTED", "old sequence cannot modify state")
  assert(r.state.revokedGrantIds.has("grant-001"), "grant still revoked after old input")
}

// ─── Offline Reducer ─────────────────────────────────────────────────

console.log("D-4C Offline reducer")

{
  // Connection lost → OFFLINE_RESTRICTED
  const state: OfflineRuntimeState = {
    connectivity: "ONLINE", enforcement: "ONLINE",
    policyFreshnessMs: 1000, revocationFreshnessMs: 1000, offlineElapsedMs: 0,
  }
  const r = reduceOfflineState(state, { kind: "CONNECTION_LOST" })
  assertEqual(r.connectivity, "OFFLINE", "connection lost → offline")
  assertEqual(r.enforcement, "OFFLINE_RESTRICTED", "connection lost → restricted")
}

{
  // Monotonic time escalation → READ_ONLY after 10min
  const state: OfflineRuntimeState = {
    connectivity: "OFFLINE", enforcement: "OFFLINE_RESTRICTED",
    policyFreshnessMs: 1000, revocationFreshnessMs: 1000, offlineElapsedMs: 0,
  }
  const r = reduceOfflineState(state, { kind: "MONOTONIC_TIME_ELAPSED", milliseconds: 700_000 })
  assertEqual(r.enforcement, "OFFLINE_READ_ONLY", "10min offline → read-only")
  assertEqual(r.offlineElapsedMs, 700_000, "elapsed time tracked")
}

{
  // QUARANTINE after 1hr
  const state: OfflineRuntimeState = {
    connectivity: "OFFLINE", enforcement: "OFFLINE_READ_ONLY",
    policyFreshnessMs: 0, revocationFreshnessMs: 0, offlineElapsedMs: 500_000,
  }
  const r = reduceOfflineState(state, { kind: "MONOTONIC_TIME_ELAPSED", milliseconds: 4_000_000 })
  assertEqual(r.enforcement, "QUARANTINED", "1hr offline → quarantined")
}

{
  // Identity revoked → QUARANTINED
  const state: OfflineRuntimeState = {
    connectivity: "ONLINE", enforcement: "ONLINE",
    policyFreshnessMs: 1000, revocationFreshnessMs: 1000, offlineElapsedMs: 0,
  }
  const r = reduceOfflineState(state, { kind: "IDENTITY_REVOKED" })
  assertEqual(r.enforcement, "QUARANTINED", "identity revoked → quarantined")
}

{
  // Full sync → ONLINE
  const state: OfflineRuntimeState = {
    connectivity: "OFFLINE", enforcement: "OFFLINE_READ_ONLY",
    policyFreshnessMs: 0, revocationFreshnessMs: 0, offlineElapsedMs: 500_000,
  }
  const r = reduceOfflineState(state, { kind: "FULL_SYNC_COMPLETED" })
  assertEqual(r.connectivity, "ONLINE", "full sync → online")
  assertEqual(r.enforcement, "ONLINE", "full sync → online enforcement")
  assertEqual(r.offlineElapsedMs, 0, "elapsed reset")
}

{
  // Authority monotonicity: OFFLINE_READ_ONLY cannot go back to OFFLINE_RESTRICTED
  const state: OfflineRuntimeState = {
    connectivity: "OFFLINE", enforcement: "OFFLINE_READ_ONLY",
    policyFreshnessMs: 1000, revocationFreshnessMs: 1000, offlineElapsedMs: 700_000,
  }
  const r = reduceOfflineState(state, { kind: "MONOTONIC_TIME_ELAPSED", milliseconds: 100 })
  // Should still be OFFLINE_READ_ONLY or QUARANTINED, never back to OFFLINE_RESTRICTED
  assert(r.enforcement !== "OFFLINE_RESTRICTED", "authority never increases while offline")
  assert(r.enforcement !== "ONLINE", "authority never returns to ONLINE without sync")
}

// ─── Composite Node Reducer ───────────────────────────────────────────

console.log("D-4D Composite node reducer")

{
  // Identity TRUSTED + policy CURRENT + revocation CURRENT + ONLINE → enforcement ONLINE
  const state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_REGISTERED" })
  const state2 = reduceNodeRuntimeState(state, { kind: "IDENTITY_TRUSTED" })
  const state3 = reduceNodeRuntimeState(state2, { kind: "POLICY_CURRENT" })
  const state4 = reduceNodeRuntimeState(state3, { kind: "REVOCATION_CURRENT" })
  const state5 = reduceNodeRuntimeState(state4, { kind: "CONNECTION_RESTORED" })
  assertEqual(state5.enforcement, "ONLINE", "all green → online enforcement")
}

{
  // Identity REVOKED → enforcement QUARANTINED
  const state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_REVOKED" })
  assertEqual(state.enforcement, "QUARANTINED", "identity revoked → quarantined")
}

{
  // Policy INVALID → enforcement QUARANTINED
  let state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "IDENTITY_TRUSTED" })
  state = reduceNodeRuntimeState(state, { kind: "CONNECTION_RESTORED" })
  state = reduceNodeRuntimeState(state, { kind: "REVOCATION_CURRENT" })
  state = reduceNodeRuntimeState(state, { kind: "POLICY_INVALID" })
  assertEqual(state.enforcement, "QUARANTINED", "policy invalid → quarantined")
}

{
  // Full sync → ONLINE + policy CURRENT + revocation CURRENT
  const state = reduceNodeRuntimeState(INITIAL_NODE_STATE, { kind: "FULL_SYNC_COMPLETED" })
  assertEqual(state.connectivity, "ONLINE", "full sync → online")
  assertEqual(state.policy, "CURRENT", "full sync → policy current")
  assertEqual(state.revocation, "CURRENT", "full sync → revocation current")
}

// ─── Property Tests ───────────────────────────────────────────────────

console.log("Property tests")

{
  // Policy sequence never decreases
  let state = INITIAL_POLICY_STATE
  const inputs: VerifiedPolicyInput[] = [
    { kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1, digest: "a", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z" },
    { kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 3, digest: "b", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T13:00:00.000Z" },
    { kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 2, digest: "c", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T14:00:00.000Z" }, // rollback
    { kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 5, digest: "d", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T15:00:00.000Z" },
  ]
  for (const input of inputs) {
    const r = reducePolicyState(state, input)
    if (r.status !== "REJECTED") {
      state = r.state
    }
    // Invariant: sequence never decreases
    assert(state.acceptedSequence >= 1, `policy sequence >= 1: ${state.acceptedSequence}`)
  }
  assertEqual(state.acceptedSequence, 5, "final sequence is 5 (rollback at 2 rejected)")
}

{
  // Rejected transitions preserve state exactly
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 5,
    acceptedDigest: "abc", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
    digest: "xyz", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r = reducePolicyState(current, input)
  assertEqual(r.status, "REJECTED", "rollback rejected")
  assert(r.state === current, "state reference preserved on rejection")
}

{
  // Determinism: same state + same input → same result
  const current: PolicySyncState = {
    issuerId: "node-alpha", issuerEpoch: 1, acceptedSequence: 1,
    acceptedDigest: "abc", acceptedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2099-12-31T23:59:59.999Z", status: "CURRENT",
  }
  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 2,
    digest: "def", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T13:00:00.000Z",
  }
  const r1 = reducePolicyState(current, input)
  const r2 = reducePolicyState(current, input)
  assertEqual(r1.status, r2.status, "deterministic: same status")
  assertEqual(r1.state.acceptedSequence, r2.state.acceptedSequence, "deterministic: same sequence")
  assertEqual(r1.state.acceptedDigest, r2.state.acceptedDigest, "deterministic: same digest")
}

// ═══════════════════════════════════════════════════════════════════════

console.log(`\n═══════════════════════════════════════════`)
console.log(`Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`)
if (failures.length > 0) {
  console.log(`\nFailures:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log(`✓ All tests passed`)
}
