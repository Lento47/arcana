/**
 * TUI-2E: Governed Approval Executor Tests
 * Run with: bun run packages/core/src/crypto/run-tui2e-tests.ts
 *
 * Tests the real Phase C PDP/PEP binding through the approval lifecycle.
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

// ─── Test Fixtures ──────────────────────────────────────────────────

const now = new Date("2026-07-30T12:00:00.000Z").toISOString()

function createNodeState(overrides?: Partial<DurableNodeSecurityState>): DurableNodeSecurityState {
  return {
    nodeId: "node-local-01", trustDomain: "arcana.local",
    identityStatus: "VERIFIED", nodeKeyEpoch: 1, nodeCertificateFingerprint: "fp-1",
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

// ─── In-Memory Stores ───────────────────────────────────────────────

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
    async execute(request: ProtectedRequest): Promise<EffectResult> {
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

// ═══════════════════════════════════════════════════════════════════════
// Approved → real PEP → effect once
// ═══════════════════════════════════════════════════════════════════════

console.log("Approved → real PDP/PEP → effect once → consumed")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  // Create approved approval
  executorStore.saveApproval({
    approvalId: "appr-1", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-001", approvalId: "appr-1", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "SUCCEEDED", "execution succeeds")
  assert(result.status === "SUCCEEDED" && result.effectReceiptHash.startsWith("receipt-"), "receipt hash present")
  assert(result.status === "SUCCEEDED" && result.runProof !== undefined, "RunProof present")
  assert(result.status === "SUCCEEDED" && result.runProof.traceHealth === "COMPLETE", "RunProof COMPLETE")
  assert(getEffectCalls() === 1, "effect called exactly once")

  // Verify approval consumed
  const approval = executorStore.loadApproval("appr-1")
  assertEqual(approval!.state, "CONSUMED", "approval consumed")

  // Verify execution record
  const exec = executorStore.loadExecution("appr-1")
  assertEqual(exec!.state, "SUCCEEDED", "execution succeeded")
  assert(exec!.effectReceiptHash !== undefined, "receipt hash on execution")
}

// ═══════════════════════════════════════════════════════════════════════
// Denied approval → executor calls 0
// ═══════════════════════════════════════════════════════════════════════

console.log("Denied approval → executor calls 0")
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

  assertEqual(result.status, "DENIED", "returns DENIED")
  assert(getEffectCalls() === 0, "zero effect calls")
}

// ═══════════════════════════════════════════════════════════════════════
// Quarantined node → PDP deny after approval
// ═══════════════════════════════════════════════════════════════════════

console.log("Node quarantined after approval → PDP deny")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  // Update request to quarantined state
  requestStore.requests.set("hash-abc", {
    action: createAction(),
    grant: createGrant(),
    nodeState: createNodeState({ enforcementMode: "QUARANTINED" }),
    workloadIdentity: createWorkloadIdentity(),
  })

  executorStore.saveApproval({
    approvalId: "appr-qn", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-003", approvalId: "appr-qn", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "DENIED", "quarantined → DENIED")
  assert(getEffectCalls() === 0, "zero effect calls")
  assert(result.status === "DENIED" && result.reason.includes("quarantined"), "reason mentions quarantined")

  // Approval returned to APPROVED for re-evaluation
  const approval = executorStore.loadApproval("appr-qn")
  assertEqual(approval!.state, "APPROVED", "approval returned to APPROVED")
}

// ═══════════════════════════════════════════════════════════════════════
// Request hash changed → STALE
// ═══════════════════════════════════════════════════════════════════════

console.log("Request hash changed → STALE")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  executorStore.saveApproval({
    approvalId: "appr-stale", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-004", approvalId: "appr-stale", approvalVersion: 1, requestHash: "hash-CHANGED",
  })

  assertEqual(result.status, "FAILED", "stale request → FAILED")
  assert(result.status === "FAILED" && result.reason.includes("STALE"), "reason mentions STALE")
  assert(getEffectCalls() === 0, "zero effect calls")
}

// ═══════════════════════════════════════════════════════════════════════
// Two workers claim → one winner
// ═══════════════════════════════════════════════════════════════════════

console.log("Two workers claim → one winner")
{
  const { executorStore, requestStore, effectDispatcher, getEffectCalls } = setup()

  executorStore.saveApproval({
    approvalId: "appr-dual", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  // First succeeds
  const r1 = await executor.execute({
    executionId: "exec-100", approvalId: "appr-dual", approvalVersion: 1, requestHash: "hash-abc",
  })
  assertEqual(r1.status, "SUCCEEDED", "first worker succeeds")

  // Second fails (already consumed)
  const r2 = await executor.execute({
    executionId: "exec-101", approvalId: "appr-dual", approvalVersion: 1, requestHash: "hash-abc",
  })
  assertEqual(r2.status, "FAILED", "second worker fails")
  assert(r2.status === "FAILED" && r2.reason.includes("consumed"), "reason mentions consumed")
  assert(getEffectCalls() === 1, "effect called exactly once total")
}

// ═══════════════════════════════════════════════════════════════════════
// Effect fails → approval returned to APPROVED
// ═══════════════════════════════════════════════════════════════════════

console.log("Effect fails → approval returned to APPROVED")
{
  const { executorStore, requestStore } = setup()

  const failingDispatcher: EffectDispatcher = {
    async execute(): Promise<EffectResult> {
      return { success: false, reason: "disk read error" }
    },
  }

  executorStore.saveApproval({
    approvalId: "appr-fail", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, failingDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-fail", approvalId: "appr-fail", approvalVersion: 1, requestHash: "hash-abc",
  })

  assertEqual(result.status, "FAILED", "effect failure → FAILED")
  assert(result.status === "FAILED" && result.reason.includes("disk read error"), "reason includes disk error")

  // Approval returned to APPROVED
  const approval = executorStore.loadApproval("appr-fail")
  assertEqual(approval!.state, "APPROVED", "approval returned to APPROVED after effect failure")
}

// ═══════════════════════════════════════════════════════════════════════
// RunProof agreement with approval database
// ═══════════════════════════════════════════════════════════════════════

console.log("RunProof agrees with approval database")
{
  const { executorStore, requestStore, effectDispatcher } = setup()

  executorStore.saveApproval({
    approvalId: "appr-proof", version: 1, sessionId: "session-1", workspaceId: "arcana",
    requestHash: "hash-abc", contractRevision: 1, state: "APPROVED",
    approvedBy: "user:lejzer", expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now, updatedAt: now,
  })

  const executor = new RealGovernedApprovalExecutor(
    executorStore, requestStore, effectDispatcher, "node-local-01", "session-1",
  )

  const result = await executor.execute({
    executionId: "exec-proof", approvalId: "appr-proof", approvalVersion: 1, requestHash: "hash-abc",
  })

  assert(result.status === "SUCCEEDED", "execution succeeds")
  if (result.status === "SUCCEEDED" && result.runProof) {
    assertEqual(result.runProof.traceHealth, "COMPLETE", "RunProof trace COMPLETE")
    assert(result.runProof.events.some(e => e.kind === "LOCAL_PDP_ALLOW"), "RunProof has PDP allow")
    assert(result.runProof.events.some(e => e.kind === "PEP_RECHECK_PASSED"), "RunProof has PEP pass")
    assert(result.runProof.events.some(e => e.kind === "EFFECT_EXECUTED"), "RunProof has effect")
    assert(result.runProof.events.some(e => e.kind === "EFFECT_RECEIPT"), "RunProof has receipt")
    assert(result.runProof.integrityStatus === "VALID", "RunProof integrity valid")
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
