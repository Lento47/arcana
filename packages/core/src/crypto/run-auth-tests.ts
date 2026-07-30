/**
 * D-6B + Workload Identity Tests
 * Run with: bun run packages/core/src/crypto/run-auth-tests.ts
 */

import {
  checkReplay,
  validateSyncResponse,
  type SyncResponseContext,
  type SyncReplayRecord,
  type SyncRequestContext,
} from "./sync-auth"
import {
  deriveWorkloadId,
  verifyWorkloadStable,
  type ObservedWorkloadIdentity,
} from "./workload-identity"
import {
  audienceMatches,
  assuranceMeetsMinimum,
  calculateEffectiveExpiry,
  type DistributedGrantAudience,
  type NodeIdentity,
  type WorkloadIdentity,
  type AgentExecutionIdentity,
} from "./identity-contracts"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${expected}, got ${actual}`)
}

// ═══════════════════════════════════════════════════════════════════════
// D-6B: Authenticated Sync Control
// ═══════════════════════════════════════════════════════════════════════

console.log("D-6B Sync response validation")
{
  const now = new Date("2026-07-29T12:00:00.000Z")
  const response: SyncResponseContext = {
    protocolVersion: 1,
    requestId: "req-1",
    clientNonce: "nonce-abc",
    serverNonce: "nonce-xyz",
    nodeId: "node-1",
    serverIdentity: "server-alpha",
    responseKind: "NO_CHANGE",
    policySequence: 1,
    issuedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2026-07-29T12:05:00.000Z",
  }

  const r1 = validateSyncResponse(response, "node-1", "req-1", "nonce-abc", now)
  assert(r1.valid === true, "valid response passes")

  const r2 = validateSyncResponse({ ...response, requestId: "wrong" }, "node-1", "req-1", "nonce-abc", now)
  assert(r2.valid === false && r2.reason.includes("requestId"), "wrong requestId rejected")

  const r3 = validateSyncResponse({ ...response, clientNonce: "wrong" }, "node-1", "req-1", "nonce-abc", now)
  assert(r3.valid === false && r3.reason.includes("clientNonce"), "wrong clientNonce rejected")

  const r4 = validateSyncResponse({ ...response, nodeId: "wrong" }, "node-1", "req-1", "nonce-abc", now)
  assert(r4.valid === false && r4.reason.includes("nodeId"), "wrong nodeId rejected")

  const r5 = validateSyncResponse({ ...response, serverIdentity: "" }, "node-1", "req-1", "nonce-abc", now)
  assert(r5.valid === false && r5.reason.includes("serverIdentity"), "empty serverIdentity rejected")

  // Expired response
  const r6 = validateSyncResponse(
    { ...response, expiresAt: "2026-07-29T11:00:00.000Z" },
    "node-1", "req-1", "nonce-abc", now,
  )
  assert(r6.valid === false && r6.reason.includes("expired"), "expired response rejected")

  // Future-dated response
  const r7 = validateSyncResponse(
    { ...response, issuedAt: "2026-07-29T13:00:00.000Z" },
    "node-1", "req-1", "nonce-abc", now,
  )
  assert(r7.valid === false && r7.reason.includes("future"), "future-dated response rejected")
}

console.log("D-6B Replay protection")
{
  const response: SyncResponseContext = {
    protocolVersion: 1,
    requestId: "req-1",
    clientNonce: "nonce-abc",
    serverNonce: "nonce-xyz",
    nodeId: "node-1",
    serverIdentity: "server-alpha",
    responseKind: "NO_CHANGE",
    issuedAt: "2026-07-29T12:00:00.000Z",
    expiresAt: "2026-07-29T12:05:00.000Z",
  }

  // Fresh response
  const r1 = checkReplay(response, "digest-1", [], new Date())
  assert(r1.status === "OK", "fresh response accepted")

  // Idempotent retry (same digest)
  const existing: SyncReplayRecord = {
    serverIdentity: "server-alpha",
    requestId: "req-1",
    clientNonce: "nonce-abc",
    responseDigest: "digest-1",
    expiresAt: "2026-07-29T12:05:00.000Z",
    receivedAt: "2026-07-29T12:00:00.000Z",
  }
  const r2 = checkReplay(response, "digest-1", [existing], new Date())
  assert(r2.status === "IDEMPOTENT", "same digest = idempotent")

  // Security conflict (different digest)
  const r3 = checkReplay(response, "digest-DIFFERENT", [existing], new Date())
  assert(r3.status === "SECURITY_CONFLICT", "different digest = security conflict")
}

// ═══════════════════════════════════════════════════════════════════════
// Workload Identity
// ═══════════════════════════════════════════════════════════════════════

console.log("Workload identity derivation")
{
  const id1 = deriveWorkloadId("node-1", "digest-a", "user-1", 1000)
  const id2 = deriveWorkloadId("node-1", "digest-a", "user-1", 1000)
  assertEqual(id1, id2, "same inputs produce same workload ID")

  const id3 = deriveWorkloadId("node-1", "digest-B", "user-1", 1000)
  assert(id1 !== id3, "different digest produces different workload ID")

  const id4 = deriveWorkloadId("node-2", "digest-a", "user-1", 1000)
  assert(id1 !== id4, "different node produces different workload ID")

  const id5 = deriveWorkloadId("node-1", "digest-a", "user-1", 2000)
  assert(id1 !== id5, "different start time produces different workload ID")
}

console.log("Workload TOCTOU defense")
{
  const admission: ObservedWorkloadIdentity = {
    nodeId: "node-1",
    workloadId: "wld-1",
    executablePath: "/usr/bin/bun",
    executableDigest: "abc123",
    operatingSystemPrincipal: "user-1",
    processId: 1234,
    harness: "CODEX",
    assurance: "OS_OBSERVED",
  }

  // Stable
  const current = { ...admission }
  const r1 = verifyWorkloadStable(admission, current)
  assert(r1.stable === true, "identical identity is stable")

  // Workload ID changed
  const r2 = verifyWorkloadStable(admission, { ...current, workloadId: "wld-2" })
  assert(r2.stale === false && r2.reason.includes("workloadId"), "workloadId change detected")

  // Executable digest changed
  const r3 = verifyWorkloadStable(admission, { ...current, executableDigest: "evil" })
  assert(r3.stale === false && r3.reason.includes("executableDigest"), "executableDigest change detected")

  // PID changed
  const r4 = verifyWorkloadStable(admission, { ...current, processId: 9999 })
  assert(r4.stale === false && r4.reason.includes("processId"), "processId change detected")

  // OS principal changed
  const r5 = verifyWorkloadStable(admission, { ...current, operatingSystemPrincipal: "evil" })
  assert(r5.stale === false && r5.reason.includes("osPrincipal"), "osPrincipal change detected")
}

// ═══════════════════════════════════════════════════════════════════════
// Identity Contracts
// ═══════════════════════════════════════════════════════════════════════

console.log("Identity contracts: audience matching")
{
  const node: NodeIdentity = {
    trustDomain: "arcana.local",
    nodeId: "node-1",
    nodeCertificateFingerprint: "fp-1",
    nodeKeyEpoch: 1,
    attestationMethod: "MANUAL_CERTIFICATE",
  }
  const workload: WorkloadIdentity = {
    nodeId: "node-1",
    workloadId: "wld-1",
    harness: "CODEX",
    assurance: "OS_OBSERVED",
  }
  const agent: AgentExecutionIdentity = {
    workloadId: "wld-1",
    principalId: "principal-1",
    sessionId: "session-1",
  }
  const audience: DistributedGrantAudience = {
    trustDomain: "arcana.local",
    nodeId: "node-1",
    workloadId: "wld-1",
    principalId: "principal-1",
    sessionId: "session-1",
  }

  const r1 = audienceMatches(audience, node, workload, agent)
  assert(r1.match === true, "exact audience matches")

  const r2 = audienceMatches({ ...audience, trustDomain: "evil" }, node, workload, agent)
  assert(r2.match === false && r2.reason.includes("trustDomain"), "wrong trustDomain rejected")

  const r3 = audienceMatches({ ...audience, nodeId: "evil" }, node, workload, agent)
  assert(r3.match === false && r3.reason.includes("nodeId"), "wrong nodeId rejected")

  const r4 = audienceMatches({ ...audience, workloadId: "evil" }, node, workload, agent)
  assert(r4.match === false && r4.reason.includes("workloadId"), "wrong workloadId rejected")

  const r5 = audienceMatches({ ...audience, principalId: "evil" }, node, workload, agent)
  assert(r5.match === false && r5.reason.includes("principalId"), "wrong principalId rejected")

  const r6 = audienceMatches({ ...audience, sessionId: "evil" }, node, workload, agent)
  assert(r6.match === false && r6.reason.includes("sessionId"), "wrong sessionId rejected")
}

console.log("Identity contracts: assurance levels")
{
  assert(assuranceMeetsMinimum("HARDWARE_ATTESTED", "DECLARED") === true, "HARDWARE >= DECLARED")
  assert(assuranceMeetsMinimum("SIGNED_BINARY", "OS_OBSERVED") === true, "SIGNED >= OBSERVED")
  assert(assuranceMeetsMinimum("DECLARED", "HARDWARE_ATTESTED") === false, "DECLARED < HARDWARE")
  assert(assuranceMeetsMinimum("OS_OBSERVED", "SIGNED_BINARY") === false, "OBSERVED < SIGNED")
  assert(assuranceMeetsMinimum("SIGNED_BINARY", "SIGNED_BINARY") === true, "SIGNED = SIGNED")
}

console.log("Identity contracts: effective expiry")
{
  const e1 = calculateEffectiveExpiry(
    "2026-12-31T23:59:59.999Z",
    "2026-06-30T23:59:59.999Z",
    "2026-09-30T23:59:59.999Z",
    "2026-08-15T23:59:59.999Z",
  )
  assertEqual(e1, "2026-06-30T23:59:59.999Z", "minimum expiry is policy expiry")
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
