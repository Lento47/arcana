/**
 * TUI-2I: Integration Test — SQLite Approval Lifecycle
 *
 * Tests the full approval lifecycle with durable SQLite storage.
 * Covers: approve → claim → PEP → consume, denial, concurrency, crash recovery.
 *
 * Run with: bun run packages/core/src/crypto/run-tui2i-tests.ts
 */

import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { processApprovalCommand, type AuthenticatedOperator, type ApprovalRecord } from "./approval-lifecycle"
import { SqliteApprovalStore } from "./approval-store-sqlite"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const TEST_DIR = join(import.meta.dir, ".test-tui2i")
const now = new Date("2026-07-30T12:00:00.000Z")

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
}

function createStore(name: string): SqliteApprovalStore {
  mkdirSync(TEST_DIR, { recursive: true })
  return new SqliteApprovalStore(join(TEST_DIR, `${name}.db`))
}

function createOperator(overrides?: Partial<AuthenticatedOperator>): AuthenticatedOperator {
  return {
    operatorId: "user:lejzer",
    authenticatedAt: now.toISOString(),
    roles: ["operator"],
    workspaceScope: ["arcana"],
    ...overrides,
  }
}

function createPending(store: SqliteApprovalStore, id: string, overrides?: Partial<ApprovalRecord>) {
  store.saveApproval({
    approvalId: id,
    version: 1,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// SQLite Durability
// ═══════════════════════════════════════════════════════════════════════

console.log("SQLite: PRAGMA verification")
{
  cleanup()
  const store = createStore("pragma")

  // Verify synchronous=FULL
  const db = (store as any).db
  const syncResult = db.query("PRAGMA synchronous").get() as any
  const syncVal = syncResult?.synchronous ?? syncResult?.[Object.keys(syncResult ?? {})[0]]
  assertEqual(syncVal, 2, "synchronous=FULL (value 2)")

  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Full lifecycle: approve → claim → PEP → consume
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Full approval lifecycle persists across restart")
{
  cleanup()
  const operator = createOperator()

  // Phase 1: Create and approve
  let store = createStore("lifecycle")
  createPending(store, "appr-1")

  const approveResult = processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-1", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:lejzer", sessionId: "session-1", workspaceId: "arcana" },
    store, operator, now,
  )
  assert(approveResult.success, "approve succeeds in SQLite")
  assertEqual(approveResult.approval?.state, "APPROVED", "state is APPROVED")
  store.close()

  // Phase 2: Reopen, claim
  store = createStore("lifecycle")
  const loadedApproval = store.loadApproval("appr-1")
  assert(loadedApproval !== null, "approval persists across restart")
  assertEqual(loadedApproval!.state, "APPROVED", "APPROVED state persists")

  const claimResult = processApprovalCommand(
    { kind: "CLAIM", approvalId: "appr-1", executionId: "exec-001", requestHash: "hash-abc" },
    store, operator, now,
  )
  assert(claimResult.success, "claim succeeds after restart")
  assertEqual(claimResult.approval?.state, "CLAIMED", "state is CLAIMED")
  store.close()

  // Phase 3: Reopen, consume
  store = createStore("lifecycle")
  const claimedApproval = store.loadApproval("appr-1")
  assertEqual(claimedApproval!.state, "CLAIMED", "CLAIMED persists")

  const consumeResult = processApprovalCommand(
    { kind: "CONSUME", approvalId: "appr-1", executionId: "exec-001", effectReceiptHash: "receipt-abc" },
    store, operator, now,
  )
  assert(consumeResult.success, "consume succeeds after restart")
  assertEqual(consumeResult.approval?.state, "CONSUMED", "state is CONSUMED")
  store.close()

  // Phase 4: Verify final state persists
  store = createStore("lifecycle")
  const consumedApproval = store.loadApproval("appr-1")
  assertEqual(consumedApproval!.state, "CONSUMED", "CONSUMED persists")

  // Verify execution record
  const execution = store.loadExecution("appr-1")
  assert(execution !== null, "execution record exists")
  assertEqual(execution!.state, "SUCCEEDED", "execution SUCCEEDED")
  assertEqual(execution!.effectReceiptHash, "receipt-abc", "receipt hash recorded")

  // Verify outbox
  const stats = store.getOutboxStats()
  assertEqual(stats.pending, 3, "3 pending outbox events")

  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Deny lifecycle
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Deny → no executor calls, persists")
{
  cleanup()
  const operator = createOperator()
  const store = createStore("deny")
  createPending(store, "appr-denied")

  const denyResult = processApprovalCommand(
    { kind: "DENY", approvalId: "appr-denied", operatorId: "user:lejzer", sessionId: "session-1", workspaceId: "arcana" },
    store, operator, now,
  )
  assert(denyResult.success, "deny succeeds")
  assertEqual(denyResult.approval?.state, "DENIED", "state is DENIED")

  // Try to claim — fails
  const claimResult = processApprovalCommand(
    { kind: "CLAIM", approvalId: "appr-denied", executionId: "exec-002", requestHash: "hash-abc" },
    store, operator, now,
  )
  assert(!claimResult.success, "claim after deny fails")

  // No execution record
  const exec = store.loadExecution("appr-denied")
  assert(exec === null, "no execution after deny")

  // Verify persists
  store.close()
  const store2 = createStore("deny")
  const persistedDenial = store2.loadApproval("appr-denied")
  assertEqual(persistedDenial!.state, "DENIED", "DENIAL persists across restart")
  store2.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Stale request → deny
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Request hash change → stale")
{
  cleanup()
  const operator = createOperator()
  const store = createStore("stale")
  createPending(store, "appr-stale")

  // Approve
  processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-stale", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:lejzer", sessionId: "session-1", workspaceId: "arcana" },
    store, operator, now,
  )

  // Claim with different hash
  const claimResult = processApprovalCommand(
    { kind: "CLAIM", approvalId: "appr-stale", executionId: "exec-stale", requestHash: "hash-CHANGED" },
    store, operator, now,
  )
  assert(!claimResult.success, "stale claim rejected")
  assert(claimResult.reason.includes("STALE"), "reason includes STALE")

  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Concurrent operators → one winner
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Two operators → one winner (SQLite)")
{
  cleanup()
  const store = createStore("concurrent")
  createPending(store, "appr-concurrent")

  const op1 = createOperator({ operatorId: "user:alice" })
  const op2 = createOperator({ operatorId: "user:bob" })

  const r1 = processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-concurrent", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:alice", sessionId: "session-1", workspaceId: "arcana" },
    store, op1, now,
  )
  assert(r1.success, "first approve succeeds")

  const r2 = processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-concurrent", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:bob", sessionId: "session-1", workspaceId: "arcana" },
    store, op2, now,
  )
  assert(!r2.success, "second approve fails")
  assert(r2.reason.includes("ALREADY_DECIDED"), "ALREADY_DECIDED")

  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Cross-workspace rejection
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Cross-workspace rejected (SQLite)")
{
  cleanup()
  const store = createStore("cross-ws")
  createPending(store, "appr-cross", { workspaceId: "workspace-B" })

  const operator = createOperator({ workspaceScope: ["workspace-A"] })
  const r = processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-cross", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:lejzer", sessionId: "session-1", workspaceId: "workspace-B" },
    store, operator, now,
  )
  assert(!r.success, "cross-workspace rejected")

  store.close()
}

// ═══════════════════════════════════════════════════════════════════════
// Outbox event persistence
// ═══════════════════════════════════════════════════════════════════════

console.log("TUI-2I: Outbox events persist and can be delivered")
{
  cleanup()
  const operator = createOperator()
  const store = createStore("outbox")

  createPending(store, "appr-outbox")
  processApprovalCommand(
    { kind: "APPROVE", approvalId: "appr-outbox", requestHash: "hash-abc", contractRevision: 1, operatorId: "user:lejzer", sessionId: "session-1", workspaceId: "arcana" },
    store, operator, now,
  )

  // Check outbox
  const pending = store.getPendingOutbox()
  assertEqual(pending.length, 1, "1 pending event")
  assertEqual(pending[0].kind, "APPROVAL_DECIDED", "correct event kind")
  assertEqual(pending[0].detail.decision, "APPROVED", "correct decision")

  // Mark delivered
  store.markOutboxDelivered(pending[0].eventId)
  const stats = store.getOutboxStats()
  assertEqual(stats.pending, 0, "0 pending after delivery")
  assertEqual(stats.delivered, 1, "1 delivered")

  // Verify persists
  store.close()
  const store2 = createStore("outbox")
  const stats2 = store2.getOutboxStats()
  assertEqual(stats2.delivered, 1, "delivery state persists")
  store2.close()
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
