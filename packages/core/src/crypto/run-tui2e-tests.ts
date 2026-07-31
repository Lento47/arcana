/**
 * TUI-2E: Governed Approval Executor Tests (HARDENED)
 * Run with: bun run packages/core/src/crypto/run-tui2e-tests.ts
 *
 * Tests precise failure semantics:
 *   Authority denial → INVALIDATED (never retry)
 *   Effect definitely not started → RETRYABLE_FAILURE (may return to APPROVED)
 *   Effect may have occurred → RECOVERY_REQUIRED (never auto-retry)
 */

import {
  RealGovernedApprovalExecutor,
  type GovernedExecutorStore,
  type ProtectedRequest,
  type ProtectedRequestStore,
  type EffectDispatcher,
  type EffectResult,
} from "./governed-executor"
import type { ApprovalRecord, ApprovalExecutionRecord } from "./approval-lifecycle"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"
import type { DerivedLocalGrant, DistributedAction } from "./distributed-pep"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const now = new Date("2026-07-30T12:00:00.000Z").toISOString()

function createNodeState(overrides?: Partial<DurableNodeSecurityState>): DurableNodeSecurityState {
  return {
    nodeId: "node-local-01", trustDomain: "arcana.local",
    identityStatus: "TRUSTED", nodeKeyEpoch: 1, nodeCertificateFingerprint: "fp-1",
    acceptedPolicyIssuerId: "issuer-1", acceptedPolicyIssuerEpoch: 1,
    acceptedPolicySequence: 5, acceptedPolicyDigest: "pd-abc",
    policyExpiresAt: "2099-12-31T23:59:59.999Z",
    acceptedRevocationSequence: 3, emergencyRevocationEpoch: 0,
    revocationDigest: "rd-xyz", enforcementMode: "ONLINE",
    lastProofSequence: 0, lastAcknowledgedProofSequence: 0, version: 10,
    ...overrides,
  }
}

function createGrant(): DerivedLocalGrant {
  return {
    derivationId: "drv-1", sourceEnvelopeHash: "env-hash",
    issuerId: "issuer-1", issuerEpoch: 1,
    nodeId: "node-local-01", workloadId: "wl-abc",
    workloadAssurance: "OS_OBSERVED", principalId: "agent-1", sessionId: "session-1",
    policySequence: 5, policyDigest: "pd-abc",
    revocationSequence: 3, revocationDigest: "rd-xyz",
    localGrantId: "local-001", action: "filesystem.read",
    resource: "docs/test.md", effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    derivedAt: now,
  }
}

function createWorkloadIdentity(): ObservedWorkloadIdentity {
  return {
    nodeId: "node-local-01", workloadId: "wl-abc",
    executablePath: "/usr/bin/bun", executableDigest: "digest-1",
    operatingSystemPrincipal: "user-1", processId: 1234,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "ARGV", authoritative: false },
    assurance: "OS_OBSERVED",
  }
}

function createAction(): DistributedAction {
  return { action: "filesystem.read", workspace: "arcana", resource: "docs/test.md" }
}

class MemoryExecutorStore implements GovernedExecutorStore {
  approvals = new Map<string, ApprovalRecord>()
  executions = new Map<string, ApprovalExecutionRecord>()
  loadApproval(id: string) { return this.approvals.get(id) ?? null }
  saveApproval(r: ApprovalRecord) { this.approvals.set(r.approvalId, { ...r }) }
  saveExecution(r: ApprovalExecutionRecord) { this.executions.set(r.approvalId, { ...r }) }
  loadExecution(id: string) { return this.executions.get(id) ?? null }
}

class MemoryRequestStore implements ProtectedRequestStore {
  requests = new Map<string, ProtectedRequest>()
  loadRequest(hash: string) { return this.requests.get(hash) ?? null }
}

function setup() {
  const executorStore = new MemoryExecutorStore()
  const requestStore = new MemoryRequestStore()
  let effectCallCount = 0

  const effectDispatcher: EffectDispatcher = {
    async execute(): Promise<EffectResult> {
      effectCallCount++
      return { success: true, receiptHash: `receipt-${effectCallCount}`, detail: { bytesRead: 42 } }
    },
  }

  const request: ProtectedRequest = {
    action: createAction(),
    grant: createGrant(),
    nodeState: createNodeState(),
    workloadIdentity: createWorkloadIdentity(),
  }

  requestStore.requests.set("hash-abc", request)

  return { executorStore, requestStore, effectDispatcher, getEffectCalls: () => effectCallCount }
}

function createApproved(store: MemoryExecutorStore, id: string) {
  store.saveApproval({
    approvalId: id, version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Approved → real PDP/PEP → effect once → CONSUMED
// ═══════════════════════════════════════════════════════════════════════

console.log("Approved → real PDP/PEP → effect once → CONSUMED")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()
  createApproved(executorStore, "appr-1")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-001", approvalId: "appr-1", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "SUCCEEDED", "execution succeeds")
  assertEqual(result.approvalState, "CONSUMED", "approval CONSUMED")
  assert(result.status === "SUCCEEDED" && result.effectReceiptHash.startsWith("receipt-"), "receipt present")
  assert(result.status === "SUCCEEDED" && result.runProof.traceHealth === "COMPLETE", "RunProof COMPLETE")
  assert(getEffectCalls() === 1, "effect called exactly once")

  const approval = executorStore.loadApproval("appr-1")
  assertEqual(approval!.state, "CONSUMED", "approval state CONSUMED in store")
}

// ═══════════════════════════════════════════════════════════════════════
// Denied approval → executor calls 0
// ═══════════════════════════════════════════════════════════════════════

console.log("Denied approval → zero executor calls")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  executorStore.saveApproval({
    approvalId: "appr-denied", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "DENIED",
    expiresAt: "2099-12-31T23:59:59.999Z", createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-002", approvalId: "appr-denied", approvalVersion: 1, requestHash: "hash-abc",
  })

  assert(result.status !== "SUCCEEDED", "not succeeded")
  assert(getEffectCalls() === 0, "zero effect calls")
}

// ═══════════════════════════════════════════════════════════════════════
// Node quarantined after approval → INVALIDATED (not back to APPROVED)
// ═══════════════════════════════════════════════════════════════════════

console.log("Node quarantined after approval → INVALIDATED")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  requestStore.requests.set("hash-abc", {
    action: createAction(),
    grant: createGrant(),
    nodeState: createNodeState({ enforcementMode: "QUARANTINED" }),
    workloadIdentity: createWorkloadIdentity(),
  })

  createApproved(executorStore, "appr-qn")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-003", approvalId: "appr-qn", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "DENIED", "quarantined → DENIED")
  assertEqual(result.approvalState, "INVALIDATED", "approval INVALIDATED")
  assert(result.status === "DENIED" && result.reason === "NODE_QUARANTINED", "reason is NODE_QUARANTINED")
  assert(getEffectCalls() === 0, "zero effect calls")

  // Approval is INVALIDATED, NOT APPROVED
  const approval = executorStore.loadApproval("appr-qn")
  assertEqual(approval!.state, "INVALIDATED", "approval INVALIDATED in store, not APPROVED")
}

// ═══════════════════════════════════════════════════════════════════════
// Capability revoked after approval → INVALIDATED
// ═══════════════════════════════════════════════════════════════════════

console.log("Capability revoked after approval → INVALIDATED")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  requestStore.requests.set("hash-abc", {
    action: createAction(),
    grant: createGrant(),
    nodeState: createNodeState({ identityStatus: "REVOKED", enforcementMode: "QUARANTINED" }),
    workloadIdentity: createWorkloadIdentity(),
  })

  createApproved(executorStore, "appr-revoked")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-004", approvalId: "appr-revoked", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "DENIED", "revoked → DENIED")
  assertEqual(result.approvalState, "INVALIDATED", "INVALIDATED")
  assert(result.status === "DENIED" && result.reason === "CAPABILITY_REVOKED", "reason is CAPABILITY_REVOKED")
  assert(getEffectCalls() === 0, "zero effect calls")
}

// ═══════════════════════════════════════════════════════════════════════
// Request hash changed → INVALIDATED (STALE)
// ═══════════════════════════════════════════════════════════════════════

console.log("Request hash changed → INVALIDATED")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()
  createApproved(executorStore, "appr-stale")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-005", approvalId: "appr-stale", approvalVersion: 1, requestHash: "hash-CHANGED",
  })

  assertEqual(result.status, "DENIED", "stale → DENIED")
  assertEqual(result.approvalState, "INVALIDATED", "INVALIDATED")
  assert(result.status === "DENIED" && result.reason === "REQUEST_STALE", "reason is REQUEST_STALE")
  assert(getEffectCalls() === 0, "zero effect calls")

  const approval = executorStore.loadApproval("appr-stale")
  assertEqual(approval!.state, "INVALIDATED", "approval INVALIDATED in store")
}

// ═══════════════════════════════════════════════════════════════════════
// Effect definitely not started → RETRYABLE_FAILURE → back to APPROVED
// ═══════════════════════════════════════════════════════════════════════

console.log("Effect definitely not started → RETRYABLE_FAILURE → APPROVED")
{
  const { executorStore, requestStore } = setup()

  const retryableDispatcher: EffectDispatcher = {
    async execute(): Promise<EffectResult> {
      return { success: false, reason: "file not found", effectDefinitelyNotStarted: true }
    },
  }

  createApproved(executorStore, "appr-retry")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, retryableDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-006", approvalId: "appr-retry", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "RETRYABLE_FAILURE", "effect not started → RETRYABLE_FAILURE")
  assertEqual(result.approvalState, "APPROVED", "approval returned to APPROVED")
  assert(result.status === "RETRYABLE_FAILURE" && result.effectDefinitelyNotStarted === true, "effectDefinitelyNotStarted flag")

  const approval = executorStore.loadApproval("appr-retry")
  assertEqual(approval!.state, "APPROVED", "approval APPROVED in store")
}

// ═══════════════════════════════════════════════════════════════════════
// Effect may have occurred → RECOVERY_REQUIRED → stays CLAIMED
// ═══════════════════════════════════════════════════════════════════════

console.log("Effect may have occurred → RECOVERY_REQUIRED → stays CLAIMED")
{
  const { executorStore, requestStore } = setup()

  const uncertainDispatcher: EffectDispatcher = {
    async execute(): Promise<EffectResult> {
      return { success: false, reason: "write timeout", effectDefinitelyNotStarted: false }
    },
  }

  createApproved(executorStore, "appr-uncertain")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, uncertainDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-007", approvalId: "appr-uncertain", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "RECOVERY_REQUIRED", "uncertain → RECOVERY_REQUIRED")
  assertEqual(result.approvalState, "CLAIMED", "stays CLAIMED")
  assert(result.status === "RECOVERY_REQUIRED" && result.effectMayHaveOccurred === true, "effectMayHaveOccurred flag")

  const approval = executorStore.loadApproval("appr-uncertain")
  assertEqual(approval!.state, "CLAIMED", "approval stays CLAIMED in store, not APPROVED")
}

// ═══════════════════════════════════════════════════════════════════════
// Effect throws → RECOVERY_REQUIRED
// ═══════════════════════════════════════════════════════════════════════

console.log("Effect throws exception → RECOVERY_REQUIRED")
{
  const { executorStore, requestStore } = setup()

  const throwingDispatcher: EffectDispatcher = {
    async execute() { throw new Error("disk failure") },
  }

  createApproved(executorStore, "appr-throw")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, throwingDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-008", approvalId: "appr-throw", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "RECOVERY_REQUIRED", "exception → RECOVERY_REQUIRED")
  assert(result.status === "RECOVERY_REQUIRED" && result.effectMayHaveOccurred === true, "effectMayHaveOccurred")
}

// ═══════════════════════════════════════════════════════════════════════
// Two workers claim → one winner
// ═══════════════════════════════════════════════════════════════════════

console.log("Two workers claim → one winner")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()
  createApproved(executorStore, "appr-dual")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const r1 = await executor.execute({
    executionId: "exec-100", approvalId: "appr-dual", approvalVersion: 1, requestHash: "hash-abc",
  })
  assertEqual(r1.status, "SUCCEEDED", "first worker succeeds")

  const r2 = await executor.execute({
    executionId: "exec-101", approvalId: "appr-dual", approvalVersion: 1, requestHash: "hash-abc",
  })
  assert(r2.status !== "SUCCEEDED", "second worker fails")
  assert(getEffectCalls() === 1, "effect called exactly once total")
}

// ═══════════════════════════════════════════════════════════════════════
// INVALIDATED approval cannot be reactivated
// ═══════════════════════════════════════════════════════════════════════

console.log("INVALIDATED approval cannot be reactivated")
{
  const { executorStore, requestStore, effectDispatcher } = setup()

  executorStore.saveApproval({
    approvalId: "appr-inv", version: 2, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "INVALIDATED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-009", approvalId: "appr-inv", approvalVersion: 2, requestHash: "hash-abc",
  })

  assert(result.status !== "SUCCEEDED", "INVALIDATED cannot succeed")
  assert(result.approvalState !== "CONSUMED", "cannot be consumed")
}

// ═══════════════════════════════════════════════════════════════════════
// RunProof agreement
// ═══════════════════════════════════════════════════════════════════════

console.log("RunProof agrees with approval database")
{
  const { executorStore, requestStore, effectDispatcher } = setup()
  createApproved(executorStore, "appr-proof")

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-proof", approvalId: "appr-proof", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "SUCCEEDED", "succeeds")
  assert(result.status === "SUCCEEDED" && result.runProof.traceHealth === "COMPLETE", "RunProof COMPLETE")
  assert(result.status === "SUCCEEDED" && result.runProof.integrityStatus === "VALID", "integrity VALID")

  // Verify approval database agrees
  const approval = executorStore.loadApproval("appr-proof")
  assertEqual(approval!.state, "CONSUMED", "database shows CONSUMED")
  const exec = executorStore.loadExecution("appr-proof")
  assertEqual(exec!.state, "SUCCEEDED", "execution SUCCEEDED")
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
