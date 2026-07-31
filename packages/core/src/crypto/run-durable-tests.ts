/**
 * D-5 Durable State Store Tests — standalone runner
 * Run with: bun run packages/core/src/crypto/run-durable-tests.ts
 */

import {
  InMemoryDurableStateStore,
  createInitialDurableState,
  MonotonicViolationError,
  type DurableNodeSecurityState,
  type TransitionEvent,
} from "./durable-state"
import type { VerifiedPolicyInput, VerifiedRevocationInput } from "./reducers"

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

async function assertThrows(fn: () => Promise<unknown>, message: string) {
  try {
    await fn()
    failed++
    failures.push(`${message} — expected throw but did not throw`)
    console.log(`  ✗ ${message} — expected throw but did not throw`)
  } catch {
    passed++
  }
}

// ─── Initial State ────────────────────────────────────────────────────

console.log("D-5 Initial state")
{
  const store = new InMemoryDurableStateStore()
  const state = await store.load()
  assert(state === null, "initial state is null")
}

// ─── Policy Application ───────────────────────────────────────────────

console.log("D-5 Policy application")
{
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  // Manually set state for testing
  ;(store as any).state = initial

  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }

  const { state, event } = await store.applyPolicy(input)
  assertEqual(state.acceptedPolicySequence, 1, "first policy sets sequence")
  assertEqual(state.acceptedPolicyDigest, "abc123", "first policy sets digest")
  assertEqual(state.version, 1, "version incremented to 1")
  assertEqual(event.kind, "POLICY_APPLIED", "event kind is POLICY_APPLIED")
  assertEqual(event.previousVersion, 0, "event previous version is 0")
  assertEqual(event.nextVersion, 1, "event next version is 1")
}

{
  // Duplicate policy is idempotent
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }

  await store.applyPolicy(input)
  const { state, event } = await store.applyPolicy(input)
  assertEqual(state.acceptedPolicySequence, 1, "sequence unchanged after idempotent")
  assertEqual(event.kind, "POLICY_IDEMPOTENT", "event kind is POLICY_IDEMPOTENT")
}

{
  // Sequence rollback rejected
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input1: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 5,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  await store.applyPolicy(input1)

  const input2: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
    digest: "def456", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T13:00:00.000Z",
  }
  await assertThrows(() => store.applyPolicy(input2), "sequence rollback throws")
  const state = await store.load()
  assertEqual(state!.acceptedPolicySequence, 5, "state unchanged after rollback")
  assertEqual(state!.version, 1, "version unchanged after rollback")
}

{
  // Epoch rollback rejected
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input1: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 5, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  await store.applyPolicy(input1)

  const input2: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 3, sequence: 2,
    digest: "def456", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T13:00:00.000Z",
  }
  await assertThrows(() => store.applyPolicy(input2), "epoch rollback throws")
}

// ─── Revocation Application ───────────────────────────────────────────

console.log("D-5 Revocation application")
{
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }

  const { state, event } = await store.applyRevocation(input)
  assertEqual(state.acceptedRevocationSequence, 1, "first revocation sets sequence")
  assertEqual(event.kind, "REVOCATION_APPLIED", "event kind is REVOCATION_APPLIED")
}

{
  // Revocation sequence rollback rejected
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input1: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 5,
    subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }
  await store.applyRevocation(input1)

  const input2: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
    subjectType: "GRANT", subjectId: "grant-002", receivedAt: "2026-07-29T13:00:00.000Z",
  }
  await assertThrows(() => store.applyRevocation(input2), "revocation sequence rollback throws")
}

{
  // Emergency epoch escalation
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const input: VerifiedRevocationInput = {
    issuerId: "node-alpha", issuerEpoch: 10, sequence: 1,
    subjectType: "ISSUER_KEY", subjectId: "key-001", receivedAt: "2026-07-29T12:00:00.000Z",
  }

  const { state } = await store.applyRevocation(input)
  assertEqual(state.emergencyRevocationEpoch, 10, "emergency epoch escalated")
}

// ─── Node Events ──────────────────────────────────────────────────────

console.log("D-5 Node events")
{
  // Identity trusted → enforcement depends on other axes
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const { state: s1 } = await store.applyNodeEvent({ kind: "IDENTITY_TRUSTED" })
  assertEqual(s1.identityStatus, "TRUSTED", "identity set to TRUSTED")
  // Still QUARANTINED because policy and revocation are UNAVAILABLE
  assertEqual(s1.enforcementMode, "QUARANTINED", "still quarantined without policy/revocation")
}

{
  // Full sync → policy current + revocation current + connectivity ONLINE
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  // First trust the identity
  await store.applyNodeEvent({ kind: "IDENTITY_TRUSTED" })

  // Set some policy/revocation state
  await store.applyPolicy({
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  })

  const { state } = await store.applyNodeEvent({ kind: "FULL_SYNC_COMPLETED" })
  assertEqual(state.enforcementMode, "ONLINE", "full sync → ONLINE enforcement")
}

{
  // Identity revoked → QUARANTINED
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const { state } = await store.applyNodeEvent({ kind: "IDENTITY_REVOKED" })
  assertEqual(state.identityStatus, "REVOKED", "identity set to REVOKED")
  assertEqual(state.enforcementMode, "QUARANTINED", "REVOKED → QUARANTINED")
}

{
  // Policy invalid → QUARANTINED
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const { state } = await store.applyNodeEvent({ kind: "POLICY_INVALID" })
  assertEqual(state.enforcementMode, "QUARANTINED", "POLICY_INVALID → QUARANTINED")
}

// ─── Identity Update ──────────────────────────────────────────────────

console.log("D-5 Identity update")
{
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  const { state } = await store.updateIdentity("PENDING", 1)
  assertEqual(state.identityStatus, "PENDING", "identity set to PENDING")
  assertEqual(state.nodeKeyEpoch, 1, "node key epoch set")
}

{
  // REVOKED identity forces QUARANTINED enforcement
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  initial.enforcementMode = "ONLINE"
  ;(store as any).state = initial

  const { state } = await store.updateIdentity("REVOKED")
  assertEqual(state.enforcementMode, "QUARANTINED", "REVOKED identity forces QUARANTINED")
}

// ─── Event Audit Trail ────────────────────────────────────────────────

console.log("D-5 Event audit trail")
{
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  await store.applyPolicy({
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  })
  await store.applyNodeEvent({ kind: "IDENTITY_TRUSTED" })

  const allEvents = await store.getEvents()
  assertEqual(allEvents.length, 2, "two events recorded")
  assertEqual(allEvents[0].kind, "POLICY_APPLIED", "first event is policy")
  assertEqual(allEvents[0].nextVersion, 1, "first event version 1")
  assertEqual(allEvents[1].kind, "NODE_IDENTITY_TRUSTED", "second event is identity")
  assertEqual(allEvents[1].nextVersion, 2, "second event version 2")

  const eventsSince1 = await store.getEventsSince(1)
  assertEqual(eventsSince1.length, 1, "eventsSince(1) returns event at version 2")
}

// ─── Version Monotonicity ─────────────────────────────────────────────

console.log("D-5 Version monotonicity")
{
  const store = new InMemoryDurableStateStore()
  const initial = createInitialDurableState("node-1", "arcana.local")
  ;(store as any).state = initial

  // Apply 5 policy updates
  for (let i = 1; i <= 5; i++) {
    await store.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: i,
      digest: `digest-${i}`, expiresAt: "2099-12-31T23:59:59.999Z",
      receivedAt: "2026-07-29T12:00:00.000Z",
    })
  }

  const state = await store.load()
  assertEqual(state!.version, 5, "version is 5 after 5 updates")
  assertEqual(state!.acceptedPolicySequence, 5, "sequence is 5")

  const events = await store.getEvents()
  assertEqual(events.length, 5, "5 events recorded")
  // Verify each event has sequential versions
  for (let i = 0; i < 5; i++) {
    assertEqual(events[i].previousVersion, i, `event ${i} previous version is ${i}`)
    assertEqual(events[i].nextVersion, i + 1, `event ${i} next version is ${i + 1}`)
  }
}

// ─── Determinism ──────────────────────────────────────────────────────

console.log("D-5 Determinism")
{
  const store1 = new InMemoryDurableStateStore()
  const store2 = new InMemoryDurableStateStore()
  const initial1 = createInitialDurableState("node-1", "arcana.local")
  const initial2 = createInitialDurableState("node-1", "arcana.local")
  ;(store1 as any).state = initial1
  ;(store2 as any).state = initial2

  const input: VerifiedPolicyInput = {
    kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
    digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
  }

  const r1 = await store1.applyPolicy(input)
  const r2 = await store2.applyPolicy(input)

  assertEqual(r1.state.acceptedPolicySequence, r2.state.acceptedPolicySequence, "deterministic: same sequence")
  assertEqual(r1.state.acceptedPolicyDigest, r2.state.acceptedPolicyDigest, "deterministic: same digest")
  assertEqual(r1.state.version, r2.state.version, "deterministic: same version")
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
