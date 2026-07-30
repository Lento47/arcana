/**
 * D-6 Sync Protocol Tests
 * Run with: bun run packages/core/src/crypto/run-sync-tests.ts
 */

import {
  reduceSyncState,
  createInitialSyncState,
  validateSyncRequest,
  validateDeltaOperations,
  DEFAULT_SYNC_LIMITS,
  type SyncState,
  type SyncEvent,
  type PolicySyncRequest,
} from "./sync-protocol"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${expected}, got ${actual}`)
}

// ─── Sync State Machine ───────────────────────────────────────────────

console.log("D-6 Sync state machine")
{
  let state = createInitialSyncState("node-1", "arcana.local")
  assertEqual(state.phase, "IDLE", "initial phase is IDLE")

  // Policy sync flow: IDLE → REQUESTING → RECEIVING → REDUCING → PERSISTING → ACKNOWLEDGING → COMPLETED
  state = reduceSyncState(state, { kind: "POLICY_SYNC_REQUESTED", requestId: "req-1" })
  assertEqual(state.phase, "REQUESTING", "after request → REQUESTING")
  assertEqual(state.policySync.lastRequestId, "req-1", "request ID recorded")

  state = reduceSyncState(state, { kind: "POLICY_SYNC_RECEIVED", responseKind: "SNAPSHOT", requestId: "req-1" })
  assertEqual(state.phase, "RECEIVING", "after receive → RECEIVING")

  state = reduceSyncState(state, { kind: "POLICY_VERIFIED", sequence: 1, digest: "abc" })
  assertEqual(state.phase, "REDUCING", "after verify → REDUCING")

  state = reduceSyncState(state, { kind: "POLICY_REDUCED", status: "APPLIED" })
  assertEqual(state.phase, "PERSISTING", "after reduce → PERSISTING")

  state = reduceSyncState(state, { kind: "POLICY_PERSISTED", sequence: 1 })
  assertEqual(state.phase, "ACKNOWLEDGING", "after persist → ACKNOWLEDGING")
  assertEqual(state.policySync.acceptedSequence, 1, "sequence updated")

  state = reduceSyncState(state, { kind: "SYNC_COMPLETED" })
  assertEqual(state.phase, "COMPLETED", "after complete → COMPLETED")
}

{
  // Rejection flow
  let state = createInitialSyncState("node-1", "arcana.local")
  state = reduceSyncState(state, { kind: "POLICY_SYNC_REQUESTED", requestId: "req-2" })
  state = reduceSyncState(state, { kind: "POLICY_SYNC_RECEIVED", responseKind: "SNAPSHOT", requestId: "req-2" })
  state = reduceSyncState(state, { kind: "POLICY_VERIFIED", sequence: 1, digest: "abc" })
  state = reduceSyncState(state, { kind: "POLICY_REDUCED", status: "REJECTED" })
  assertEqual(state.phase, "REJECTED", "after rejected reduce → REJECTED")
  assertEqual(state.policySync.consecutiveFailures, 1, "failure count incremented")
}

{
  // Quarantine is terminal
  let state = createInitialSyncState("node-1", "arcana.local")
  state = reduceSyncState(state, { kind: "QUARANTINED", reason: "invalid signature" })
  assertEqual(state.phase, "QUARANTINED", "quarantined")
  assertEqual(state.quarantineReason, "invalid signature", "reason recorded")

  // Cannot escape quarantine
  state = reduceSyncState(state, { kind: "POLICY_SYNC_REQUESTED", requestId: "req-3" })
  assertEqual(state.phase, "QUARANTINED", "still quarantined after request")
}

{
  // Revocation sync flow
  let state = createInitialSyncState("node-1", "arcana.local")
  state = reduceSyncState(state, { kind: "REVOCATION_SYNC_REQUESTED", requestId: "req-4" })
  assertEqual(state.phase, "REQUESTING", "revocation request → REQUESTING")
  state = reduceSyncState(state, { kind: "REVOCATION_SYNC_RECEIVED", responseKind: "STATEMENT", requestId: "req-4" })
  assertEqual(state.phase, "RECEIVING", "revocation receive → RECEIVING")
  state = reduceSyncState(state, { kind: "REVOCATION_VERIFIED", sequence: 1 })
  assertEqual(state.phase, "REDUCING", "revocation verified → REDUCING")
  state = reduceSyncState(state, { kind: "REVOCATION_REDUCED", status: "APPLIED" })
  assertEqual(state.phase, "PERSISTING", "revocation reduced → PERSISTING")
  state = reduceSyncState(state, { kind: "REVOCATION_PERSISTED", sequence: 1 })
  assertEqual(state.phase, "ACKNOWLEDGING", "revocation persisted → ACKNOWLEDGING")
  state = reduceSyncState(state, { kind: "SYNC_COMPLETED" })
  assertEqual(state.phase, "COMPLETED", "revocation completed")
}

{
  // Failure escalation
  let state = createInitialSyncState("node-1", "arcana.local")
  for (let i = 0; i < 5; i++) {
    state = reduceSyncState(state, { kind: "SYNC_FAILED", reason: `failure ${i}` })
  }
  assertEqual(state.policySync.consecutiveFailures, 5, "5 consecutive failures")
}

// ─── Request Validation ───────────────────────────────────────────────

console.log("D-6 Request validation")
{
  const validRequest: PolicySyncRequest = {
    protocolVersion: 1,
    nodeId: "node-1",
    trustDomain: "arcana.local",
    acceptedIssuerEpoch: 1,
    acceptedSequence: 1,
    supportedPolicySchemas: [1],
    maximumResponseBytes: 65536,
    requestId: "req-1",
  }

  const r1 = validateSyncRequest(validRequest)
  assert(r1.valid === true, "valid request passes")

  const r2 = validateSyncRequest({ ...validRequest, protocolVersion: 99 as any })
  assert(r2.valid === false && r2.reason.includes("protocol version"), "wrong version rejected")

  const r3 = validateSyncRequest({ ...validRequest, nodeId: "" })
  assert(r3.valid === false && r3.reason.includes("nodeId"), "empty nodeId rejected")

  const r4 = validateSyncRequest({ ...validRequest, trustDomain: "" })
  assert(r4.valid === false && r4.reason.includes("trustDomain"), "empty trustDomain rejected")

  const r5 = validateSyncRequest({ ...validRequest, requestId: "" })
  assert(r5.valid === false && r5.reason.includes("requestId"), "empty requestId rejected")

  const r6 = validateSyncRequest({ ...validRequest, maximumResponseBytes: 999999999 })
  assert(r6.valid === false && r6.reason.includes("maximumResponseBytes"), "excessive response size rejected")
}

// ─── Delta Validation ─────────────────────────────────────────────────

console.log("D-6 Delta validation")
{
  const r1 = validateDeltaOperations([
    { op: "add", path: "/rules/0", value: { action: "read" } },
    { op: "remove", path: "/rules/1" },
  ])
  assert(r1.valid === true, "valid operations pass")

  const r2 = validateDeltaOperations(Array.from({ length: 300 }, (_, i) => ({
    op: "add" as const, path: `/rules/${i}`, value: {},
  })))
  assert(r2.valid === false && r2.reason.includes("exceed limit"), "too many operations rejected")

  const r3 = validateDeltaOperations([{ op: "invalid" as any, path: "/x" }])
  assert(r3.valid === false && r3.reason.includes("invalid delta"), "invalid op rejected")

  const r4 = validateDeltaOperations([{ op: "add", path: "" }])
  assert(r4.valid === false && r4.reason.includes("empty delta path"), "empty path rejected")

  const r5 = validateDeltaOperations([{ op: "add", path: "/x" }])
  assert(r5.valid === false && r5.reason.includes("requires value"), "add without value rejected")

  const r6 = validateDeltaOperations([{ op: "remove", path: "/x" }])
  assert(r6.valid === true, "remove without value is valid")
}

// ─── Limits ───────────────────────────────────────────────────────────

console.log("D-6 Resource limits")
{
  assert(DEFAULT_SYNC_LIMITS.maximumEnvelopeBytes === 65536, "64KB envelope limit")
  assert(DEFAULT_SYNC_LIMITS.maximumJsonDepth === 16, "16 level JSON depth")
  assert(DEFAULT_SYNC_LIMITS.maximumObjectFields === 64, "64 object fields")
  assert(DEFAULT_SYNC_LIMITS.maximumArrayItems === 1024, "1024 array items")
  assert(DEFAULT_SYNC_LIMITS.maximumStringBytes === 4096, "4096 string bytes")
  assert(DEFAULT_SYNC_LIMITS.maximumDeltaOperations === 256, "256 delta ops")
  assert(DEFAULT_SYNC_LIMITS.maximumBatchStatements === 128, "128 batch statements")
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
