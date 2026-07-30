/**
 * D-5S SQLite Durable State Store Tests
 * Run with: bun run packages/core/src/crypto/run-sqlite-tests.ts
 *
 * Tests restart persistence, crash recovery, idempotent delivery,
 * and monotonic invariants with real SQLite.
 */

import { SqliteDurableStateStore } from "./durable-state-sqlite"
import type { VerifiedPolicyInput, VerifiedRevocationInput } from "./reducers"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

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

async function assertThrows(fn: () => Promise<void>, message: string) {
  try {
    await fn()
    failed++
    failures.push(`${message} — expected throw but did not throw`)
    console.log(`  ✗ ${message} — expected throw but did not throw`)
  } catch {
    passed++
  }
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "arcana-sqlite-test-"))
}

function tempDb(dir: string): string {
  return join(dir, "test.db")
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Basic persistence
// ═══════════════════════════════════════════════════════════════════════

console.log("1. Basic persistence")
{
  const dir = tempDir()
  try {
    // Open store, initialize, apply policy, close
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "abc123", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    // Reopen store — state should persist
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store2.load()
    assert(state !== null, "state persists after close/reopen")
    assertEqual(state!.acceptedPolicySequence, 1, "policy sequence persists")
    assertEqual(state!.acceptedPolicyDigest, "abc123", "policy digest persists")
    assertEqual(state!.version, 1, "version persists")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Policy accepted → restart → policy remains current
// ═══════════════════════════════════════════════════════════════════════

console.log("2. Policy restart persistence")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 5,
      digest: "policy-v5", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store2.load()
    assertEqual(state!.acceptedPolicySequence, 5, "policy sequence 5 persists across restart")
    assertEqual(state!.acceptedPolicyDigest, "policy-v5", "policy digest persists across restart")
    assertEqual(state!.acceptedPolicyIssuerEpoch, 1, "issuer epoch persists")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Revocation accepted → restart → revoked grant remains revoked
// ═══════════════════════════════════════════════════════════════════════

console.log("3. Revocation restart persistence")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyRevocation({
      issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
      subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store2.load()
    assertEqual(state!.acceptedRevocationSequence, 3, "revocation sequence 3 persists across restart")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Emergency epoch persists and cannot decrease
// ═══════════════════════════════════════════════════════════════════════

console.log("4. Emergency epoch persistence")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyRevocation({
      issuerId: "node-alpha", issuerEpoch: 10, sequence: 1,
      subjectType: "ISSUER_KEY", subjectId: "key-001", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store2.load()
    assertEqual(state!.emergencyRevocationEpoch, 10, "emergency epoch 10 persists across restart")

    // Try to apply lower emergency epoch — should be rejected by reducer
    await assertThrows(
      () => store2.applyRevocation({
        issuerId: "node-alpha", issuerEpoch: 5, sequence: 2,
        subjectType: "ISSUER_KEY", subjectId: "key-002", receivedAt: "2026-07-29T13:00:00.000Z",
      }),
      "lower epoch rejected after restart",
    )

    const state2 = await store2.load()
    assertEqual(state2!.emergencyRevocationEpoch, 10, "emergency epoch unchanged after rejected input")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Crash after commit before event dispatch → outbox recovered
// ═══════════════════════════════════════════════════════════════════════

console.log("5. Outbox recovery after restart")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    await store1.applyNodeEvent({ kind: "IDENTITY_TRUSTED" })

    // Simulate crash: close without dispatching events
    store1.close()

    // Reopen — events should be in outbox
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const undispatched = await store2.getUndispatchedEvents()
    assertEqual(undispatched.length, 2, "two undispatched events recovered")
    assertEqual(undispatched[0].kind, "POLICY_APPLIED", "first event is policy")
    assertEqual(undispatched[1].kind, "NODE_IDENTITY_TRUSTED", "second event is identity")

    // Mark first as dispatched
    await store2.markEventDispatched(undispatched[0].id)
    const remaining = await store2.getUndispatchedEvents()
    assertEqual(remaining.length, 1, "one event remaining after dispatch")
    assertEqual(remaining[0].kind, "NODE_IDENTITY_TRUSTED", "remaining is identity")

    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Duplicate delivery after restart → idempotent
// ═══════════════════════════════════════════════════════════════════════

console.log("6. Duplicate delivery idempotency")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    const input: VerifiedPolicyInput = {
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    }

    await store1.applyPolicy(input)
    store1.close()

    // Reopen and apply same input — should be idempotent
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const { event } = await store2.applyPolicy(input)
    assertEqual(event.kind, "POLICY_IDEMPOTENT", "duplicate delivery is idempotent")

    const state = await store2.load()
    assertEqual(state!.version, 2, "version increments even for idempotent (event recorded)")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Stale message after restart → rejected
// ═══════════════════════════════════════════════════════════════════════

console.log("7. Stale message rejection")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    // Apply sequence 5
    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 5,
      digest: "v5", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    // Reopen and try stale sequence 3
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await assertThrows(
      () => store2.applyPolicy({
        kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 3,
        digest: "v3", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T13:00:00.000Z",
      }),
      "stale sequence rejected after restart",
    )

    const state = await store2.load()
    assertEqual(state!.acceptedPolicySequence, 5, "state unchanged after stale rejection")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 8. REVOKED identity persists and forces QUARANTINED
// ═══════════════════════════════════════════════════════════════════════

console.log("8. REVOKED identity persists as QUARANTINED")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    // Set identity to TRUSTED first
    await store1.updateIdentity("TRUSTED", 1)
    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })

    // Revoke
    await store1.updateIdentity("REVOKED")
    store1.close()

    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store2.load()
    assertEqual(state!.identityStatus, "REVOKED", "REVOKED persists across restart")
    assertEqual(state!.enforcementMode, "QUARANTINED", "QUARANTINED persists across restart")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 9. Monotonic version across restarts
// ═══════════════════════════════════════════════════════════════════════

console.log("9. Monotonic version across restarts")
{
  const dir = tempDir()
  try {
    for (let i = 0; i < 5; i++) {
      const store = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
      if (i === 0) {
        await store.initializeNode("node-1", "arcana.local")
      }
      await store.applyPolicy({
        kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: i + 1,
        digest: `v${i + 1}`, expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
      })
      store.close()
    }

    const store = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state = await store.load()
    assertEqual(state!.version, 5, "version is 5 after 5 restart cycles")
    assertEqual(state!.acceptedPolicySequence, 5, "sequence is 5 after 5 restart cycles")

    const events = await store.getEvents()
    assertEqual(events.length, 5, "5 events across 5 restarts")
    store.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 10. Artifact persistence
// ═══════════════════════════════════════════════════════════════════════

console.log("10. Artifact persistence")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "abc", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })
    store1.close()

    // Reopen and check artifact table
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const db = (store2 as any).db
    const artifact = db.query("SELECT * FROM accepted_policy_artifacts WHERE node_id = ?").get("node-1") as any
    assert(artifact !== null, "policy artifact persisted")
    assertEqual(artifact.issuer_id, "node-alpha", "artifact issuer correct")
    assertEqual(artifact.sequence, 1, "artifact sequence correct")
    assertEqual(artifact.digest, "abc", "artifact digest correct")
    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 11. Full lifecycle: init → trust → policy → revoke → restart → verify
// ═══════════════════════════════════════════════════════════════════════

console.log("11. Full lifecycle across restart")
{
  const dir = tempDir()
  try {
    const store1 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    await store1.initializeNode("node-1", "arcana.local")

    // Trust identity
    await store1.updateIdentity("TRUSTED", 1)

    // Apply policy
    await store1.applyPolicy({
      kind: "SNAPSHOT", issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      digest: "policy-v1", expiresAt: "2099-12-31T23:59:59.999Z", receivedAt: "2026-07-29T12:00:00.000Z",
    })

    // Apply revocation
    await store1.applyRevocation({
      issuerId: "node-alpha", issuerEpoch: 1, sequence: 1,
      subjectType: "GRANT", subjectId: "grant-001", receivedAt: "2026-07-29T12:00:00.000Z",
    })

    // Full sync → ONLINE
    await store1.applyNodeEvent({ kind: "FULL_SYNC_COMPLETED" })

    const state1 = await store1.load()
    assertEqual(state1!.identityStatus, "TRUSTED", "trusted before restart")
    assertEqual(state1!.enforcementMode, "ONLINE", "online before restart")
    assertEqual(state1!.version, 4, "version 4 before restart")

    store1.close()

    // Reopen — everything should persist
    const store2 = new SqliteDurableStateStore(tempDb(dir), "node-1", "arcana.local")
    const state2 = await store2.load()
    assertEqual(state2!.identityStatus, "TRUSTED", "trusted after restart")
    assertEqual(state2!.enforcementMode, "ONLINE", "online after restart")
    assertEqual(state2!.acceptedPolicySequence, 1, "policy sequence after restart")
    assertEqual(state2!.acceptedRevocationSequence, 1, "revocation sequence after restart")
    assertEqual(state2!.version, 4, "version 4 after restart")

    // Outbox should have 4 events
    const events = await store2.getEvents()
    assertEqual(events.length, 4, "4 events in outbox after restart")
    assertEqual(events[0].kind, "IDENTITY_UPDATED", "event 1: identity")
    assertEqual(events[1].kind, "POLICY_APPLIED", "event 2: policy")
    assertEqual(events[2].kind, "REVOCATION_APPLIED", "event 3: revocation")
    assertEqual(events[3].kind, "NODE_FULL_SYNC_COMPLETED", "event 4: sync")

    store2.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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
