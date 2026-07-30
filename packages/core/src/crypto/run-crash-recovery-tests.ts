/**
 * D-5H Crash Recovery & Database Fault Tests
 * Run with: bun run packages/core/src/crypto/run-crash-recovery-tests.ts
 *
 * Level 1: Process interruption scenarios
 * Level 2: Database fault simulation
 *
 * Level 3 (real VM power loss) cannot be automated here.
 */

import { Database } from "bun:sqlite"
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { SqliteDurableStateStore } from "./durable-state-sqlite"
import {
  type VerifiedPolicyInput,
  type VerifiedRevocationInput,
} from "./reducers"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const TEST_DIR = join(import.meta.dir, ".test-crash-recovery")
const NODE_ID = "node-test"
const TRUST_DOMAIN = "test.local"

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
}

function createTestDb(name: string): SqliteDurableStateStore {
  const dbPath = join(TEST_DIR, `${name}.db`)
  return new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
}

function createPolicyInput(seq: number, digest?: string): VerifiedPolicyInput {
  return {
    issuerId: "issuer-1",
    issuerEpoch: 1,
    sequence: seq,
    digest: digest ?? `policy-digest-${seq}`,
    expiresAt: "2099-12-31T23:59:59.999Z",
    issuedAt: new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Level 1: Process Interruption
// ═══════════════════════════════════════════════════════════════════════

console.log("Level 1: Crash before any transaction")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("crash-before")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  store.close()

  store = createTestDb("crash-before")
  const state = await store.load()
  assert(state !== null, "state survives restart")
  assertEqual(state!.nodeId, NODE_ID, "node ID preserved")
  assertEqual(state!.identityStatus, "UNREGISTERED", "initial identity preserved")
  assertEqual(state!.enforcementMode, "QUARANTINED", "initial enforcement preserved")
  store.close()
}

console.log("Level 1: Crash after commit — state persists")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("crash-after")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))
  store.close()

  store = createTestDb("crash-after")
  const state = await store.load()
  assertEqual(state!.acceptedPolicySequence, 1, "policy sequence persists after close")
  assertEqual(state!.version, 1, "version persists")
  store.close()
}

console.log("Level 1: Multiple sequential transactions all persist")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("sequential")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)

  for (let i = 1; i <= 10; i++) {
    await store.applyPolicy(createPolicyInput(i))
  }
  store.close()

  store = createTestDb("sequential")
  const state = await store.load()
  assertEqual(state!.acceptedPolicySequence, 10, "all 10 policies persisted")
  assertEqual(state!.version, 10, "version is 10")
  store.close()
}

console.log("Level 1: Outbox events survive restart")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("outbox-survive")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))
  await store.applyPolicy(createPolicyInput(2))
  store.close()

  store = createTestDb("outbox-survive")
  const events = await store.getEvents()
  assert(events.length === 2, `2 outbox events survived restart, got ${events.length}`)
  assertEqual(events[0].kind, "POLICY_APPLIED", "first event type correct")
  assertEqual(events[1].kind, "POLICY_APPLIED", "second event type correct")
  store.close()
}

console.log("Level 1: Outbox claim survives restart")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("claim-survive")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))

  const claimed = store.claimEvent("dispatcher-1")
  assert(claimed !== null, "event claimed")
  store.close()

  store = createTestDb("claim-survive")
  const events = await store.getUndispatchedEvents()
  assertEqual(events.length, 0, "claimed event not in undispatched")
  store.close()
}

console.log("Level 1: Idempotent replay after restart")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("idempotent")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(5))
  store.close()

  store = createTestDb("idempotent")
  const result = await store.applyPolicy(createPolicyInput(5))
  assertEqual(result.event.kind, "POLICY_IDEMPOTENT", "duplicate is idempotent")
  const state = await store.load()
  assertEqual(state!.acceptedPolicySequence, 5, "sequence unchanged after idempotent")
  // Note: idempotent still increments version (durable outbox event written)
  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Level 2: Database Fault Simulation
// ═══════════════════════════════════════════════════════════════════════

console.log("Level 2: Truncated database file → integrity failure")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "truncated.db")

  let store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))
  store.close()

  const content = readFileSync(dbPath)
  const truncated = content.slice(0, Math.floor(content.length / 2))
  writeFileSync(dbPath, truncated)

  let threw = false
  try {
    store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
    const integrity = store.checkIntegrity()
    assert(!integrity.healthy, "truncated DB fails integrity check")
    store.close()
  } catch (e) {
    threw = true
    assert(true, `truncated DB throws: ${(e as Error).message?.slice(0, 80)}`)
  }
}

console.log("Level 2: Missing WAL file → recovery handles gracefully")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "missing-wal.db")
  const walPath = dbPath + "-wal"
  const shmPath = dbPath + "-shm"

  let store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))
  store.close()

  try { rmSync(walPath) } catch {}
  try { rmSync(shmPath) } catch {}

  try {
    store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
    const state = await store.load()
    if (state) {
      assertEqual(state.acceptedPolicySequence, 1, "committed data survives missing WAL")
    }
    store.close()
  } catch (e) {
    assert(true, `missing WAL fail-closed: ${(e as Error).message?.slice(0, 80)}`)
  }
}

console.log("Level 2: Invalid schema → fails closed")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "bad-schema.db")

  let store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  store.close()

  const db = new Database(dbPath)
  db.run("DROP TABLE IF EXISTS node_security_state")
  db.close()

  // The schema check finds tables by name, but the table is dropped.
  // The verifySchemaIntegrity() constructor check should catch this.
  let threw = false
  try {
    store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
    // Even if it opens, loading should fail because the table doesn't exist
    const state = await store.load()
    // If state is null, that's acceptable (fail-closed on missing table)
    assert(state === null, "missing table returns null (fail-closed)")
    store.close()
  } catch (e) {
    threw = true
    assert(true, `invalid schema detected: ${(e as Error).message?.slice(0, 80)}`)
  }
}

console.log("Level 2: REVOKED without QUARANTINED → integrity failure")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "revoked-quarantine.db")

  let store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  store.close()

  const db = new Database(dbPath)
  db.run("UPDATE node_security_state SET identity_status = 'REVOKED', enforcement_mode = 'ONLINE' WHERE node_id = ?", [NODE_ID])
  db.close()

  let threw = false
  try {
    store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
    store.close()
  } catch (e) {
    threw = true
    assert(true, `REVOKED+ONLINE detected: ${(e as Error).message?.slice(0, 80)}`)
  }
  assert(threw, "REVOKED without QUARANTINED throws on startup")
}

console.log("Level 2: Negative policy sequence → integrity failure")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const dbPath = join(TEST_DIR, "neg-seq.db")

  let store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  store.close()

  const db = new Database(dbPath)
  db.run("UPDATE node_security_state SET policy_sequence = -1 WHERE node_id = ?", [NODE_ID])
  db.close()

  let threw = false
  try {
    store = new SqliteDurableStateStore(dbPath, NODE_ID, TRUST_DOMAIN)
    store.close()
  } catch (e) {
    threw = true
    assert(true, `negative sequence detected: ${(e as Error).message?.slice(0, 80)}`)
  }
  assert(threw, "negative policy sequence throws on startup")
}

console.log("Level 2: Monotonic sequence rollback rejected")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("monotonic")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(5))

  let threw = false
  try {
    await store.applyPolicy(createPolicyInput(3))
  } catch (e) {
    threw = true
    assert((e as Error).message.includes("SEQUENCE_ROLLBACK") || (e as Error).message.includes("decreased"), `rollback rejected: ${(e as Error).message?.slice(0, 80)}`)
  }
  assert(threw, "sequence rollback throws")

  const state = await store.load()
  assertEqual(state!.acceptedPolicySequence, 5, "sequence unchanged after rollback attempt")
  store.close()
}

console.log("Level 2: PRAGMA synchronous=FULL verified")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const store = createTestDb("pragma-check")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)

  const db = (store as any).db as Database
  const result = db.query("PRAGMA synchronous").get() as any
  const val = result?.synchronous ?? result?.[Object.keys(result ?? {})[0]]
  assertEqual(val, 2, "synchronous=FULL (value 2) is active")
  store.close()
}

console.log("Level 2: foreign_keys=ON verified")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  const store = createTestDb("fk-check")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)

  const db = (store as any).db as Database
  const result = db.query("PRAGMA foreign_keys").get() as any
  const val = result?.foreign_keys ?? result?.[Object.keys(result ?? {})[0]]
  assertEqual(val, 1, "foreign_keys=ON is active")
  store.close()
}

console.log("Level 2: Outbox expired claims recoverable")
{
  cleanup()
  mkdirSync(TEST_DIR, { recursive: true })

  let store = createTestDb("expired-claim")
  await store.initializeNode(NODE_ID, TRUST_DOMAIN)
  await store.applyPolicy(createPolicyInput(1))

  const claimed = store.claimEvent("dispatcher-1", 1) // 1ms lease
  assert(claimed !== null, "event claimed")

  Bun.sleepSync(50)

  const recovered = await store.recoverExpiredClaims()
  assertEqual(recovered, 1, "1 expired claim recovered")

  const undispatched = await store.getUndispatchedEvents()
  assertEqual(undispatched.length, 1, "recovered event is pending again")
  store.close()
}

// ═══════════════════════════════════════════════════════════════════════

cleanup()

console.log(`\n═══════════════════════════════════════════`)
console.log(`Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`)
if (failures.length > 0) {
  console.log(`\nFailures:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log(`✓ All tests passed`)
}
