/**
 * D-7 Distributed PEP Vertical Slice Tests
 * Run with: bun run packages/core/src/crypto/run-d7-tests.ts
 *
 * Tests the full pipeline: signed authority → derived local grant → Phase C PDP/PEP → bounded effect.
 */

import {
  phaseC_pdp,
  phaseC_pep,
  verifyWorkspaceContainment,
  deriveLocalGrant,
  type DistributedGrantSource,
  type DerivedLocalGrant,
  type DistributedAction,
  type DistributedPepResult,
} from "./distributed-pep"
import {
  type DurableNodeSecurityState,
  createInitialDurableState,
} from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${expected}, got ${actual}`)
}

// ─── Test Fixtures ──────────────────────────────────────────────────

function createValidNodeState(overrides?: Partial<DurableNodeSecurityState>): DurableNodeSecurityState {
  return {
    nodeId: "node-local-01",
    trustDomain: "arcana.local",
    identityStatus: "VERIFIED",
    nodeKeyEpoch: 1,
    nodeCertificateFingerprint: "fp-1",
    acceptedPolicyIssuerId: "issuer-1",
    acceptedPolicyIssuerEpoch: 1,
    acceptedPolicySequence: 5,
    acceptedPolicyDigest: "policy-digest-abc",
    policyExpiresAt: "2099-12-31T23:59:59.999Z",
    acceptedRevocationSequence: 3,
    emergencyRevocationEpoch: 0,
    revocationDigest: "rev-digest-xyz",
    enforcementMode: "ONLINE",
    lastProofSequence: 0,
    lastAcknowledgedProofSequence: 0,
    version: 10,
    ...overrides,
  }
}

function createValidGrantSource(): DistributedGrantSource {
  return {
    envelope: { schemaVersion: 1, kind: "SIGNED_CAPABILITY" },
    envelopeBytes: new Uint8Array(0),
    issuerId: "issuer-1",
    issuerPublicKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    issuerTrusted: true,
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    principalId: "principal-1",
    sessionId: "session-1",
    trustDomain: "arcana.local",
    policySequence: 5,
    policyDigest: "policy-digest-abc",
    revocationSequence: 3,
    revocationDigest: "rev-digest-xyz",
    capabilityExpiresAt: "2099-12-31T23:59:59.999Z",
    action: "filesystem.read",
    resource: "docs/security/PHASE-C-MILESTONE.md",
  }
}

function createValidGrant(): DerivedLocalGrant {
  return deriveLocalGrant(createValidGrantSource(), "OS_OBSERVED")
}

function createValidAction(): DistributedAction {
  return {
    action: "filesystem.read",
    workspace: "arcana",
    resource: "docs/security/PHASE-C-MILESTONE.md",
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Workspace Containment
// ═══════════════════════════════════════════════════════════════════════

console.log("Workspace containment")
{
  const root = "/tmp/workspace"

  // Valid path
  const r1 = verifyWorkspaceContainment(root, "docs/readme.md")
  assert(r1.contained === true, "normal path contained")

  // Nested path
  const r2 = verifyWorkspaceContainment(root, "a/b/c/file.txt")
  assert(r2.contained === true, "nested path contained")

  // Path traversal
  const r3 = verifyWorkspaceContainment(root, "../../../etc/passwd")
  assert(r3.contained === false && r3.reason.includes("escapes"), "traversal rejected")

  // Absolute path
  const r4 = verifyWorkspaceContainment(root, "/etc/passwd")
  assert(r4.contained === false, "absolute path rejected")

  // Null byte
  const r5 = verifyWorkspaceContainment(root, "docs/readme.md\0.evil")
  assert(r5.contained === false && r5.reason.includes("null"), "null byte rejected")

  // Dot-dot in middle
  const r6 = verifyWorkspaceContainment(root, "docs/../../../etc/shadow")
  assert(r6.contained === false, "mid-path traversal rejected")
}

// ═══════════════════════════════════════════════════════════════════════
// Grant Derivation
// ═══════════════════════════════════════════════════════════════════════

console.log("Grant derivation")
{
  const source = createValidGrantSource()
  const grant = deriveLocalGrant(source, "OS_OBSERVED")

  assertEqual(grant.issuerId, "issuer-1", "issuer preserved")
  assertEqual(grant.nodeId, "node-local-01", "node preserved")
  assertEqual(grant.workloadId, "wl-abc", "workload preserved")
  assertEqual(grant.principalId, "principal-1", "principal preserved")
  assertEqual(grant.sessionId, "session-1", "session preserved")
  assertEqual(grant.action, "filesystem.read", "action preserved")
  assertEqual(grant.resource, "docs/security/PHASE-C-MILESTONE.md", "resource preserved")
  assertEqual(grant.policySequence, 5, "policy sequence preserved")
  assertEqual(grant.workloadAssurance, "OS_OBSERVED", "assurance level recorded")
  assert(grant.localGrantId.startsWith("local-"), "local grant ID generated")
  assert(grant.derivationId.startsWith("drv-"), "derivation ID generated")
  assert(grant.effectiveExpiresAt.length > 0, "effective expiry set")

  // Different source produces different local grant ID
  const source2 = { ...source, workloadId: "wl-OTHER" }
  const grant2 = deriveLocalGrant(source2, "OS_OBSERVED")
  assert(grant.localGrantId !== grant2.localGrantId, "different source → different grant ID")
}

// ═══════════════════════════════════════════════════════════════════════
// Phase C PDP
// ═══════════════════════════════════════════════════════════════════════

console.log("Phase C PDP: valid grant allows")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState()

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "ALLOW", "valid grant → ALLOW")
}

console.log("Phase C PDP: revoked identity denies")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState({ identityStatus: "REVOKED", enforcementMode: "QUARANTINED" })

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "revoked identity → DENY")
  assert(r.reason.includes("revoked"), "reason mentions revoked")
}

console.log("Phase C PDP: unregistered identity denies")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState({ identityStatus: "UNREGISTERED" })

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "unregistered → DENY")
}

console.log("Phase C PDP: quarantined node denies")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState({ enforcementMode: "QUARANTINED" })

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "quarantined → DENY")
}

console.log("Phase C PDP: expired grant denies")
{
  const source = createValidGrantSource()
  source.capabilityExpiresAt = "2020-01-01T00:00:00.000Z"
  const grant = deriveLocalGrant(source, "OS_OBSERVED")
  const action = createValidAction()
  const state = createValidNodeState()

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "expired grant → DENY")
  assert(r.reason.includes("expired"), "reason mentions expired")
}

console.log("Phase C PDP: action mismatch denies")
{
  const grant = createValidGrant()
  const action: DistributedAction = { action: "shell.execute" as any, workspace: "arcana", resource: "any" }
  const state = createValidNodeState()

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "wrong action → DENY")
}

console.log("Phase C PDP: resource mismatch denies")
{
  const grant = createValidGrant()
  const action: DistributedAction = { action: "filesystem.read", workspace: "arcana", resource: "etc/shadow" }
  const state = createValidNodeState()

  const r = phaseC_pdp(grant, action, state)
  assertEqual(r.decision, "DENY", "wrong resource → DENY")
}

// ═══════════════════════════════════════════════════════════════════════
// Phase C PEP (pre-effect recheck)
// ═══════════════════════════════════════════════════════════════════════

console.log("Phase C PEP: stable workload allows")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState()

  const identity: ObservedWorkloadIdentity = {
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    executablePath: "/usr/bin/bun",
    executableDigest: "digest-1",
    operatingSystemPrincipal: "user-1",
    processId: 1234,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "ARGV", authoritative: false },
    assurance: "OS_OBSERVED",
  }

  const r = phaseC_pep(grant, action, state, identity, identity)
  assertEqual(r.decision, "ALLOW", "stable workload → ALLOW")
}

console.log("Phase C PEP: workload change denies (TOCTOU)")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState()

  const admission: ObservedWorkloadIdentity = {
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    executablePath: "/usr/bin/bun",
    executableDigest: "digest-1",
    operatingSystemPrincipal: "user-1",
    processId: 1234,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "ARGV", authoritative: false },
    assurance: "OS_OBSERVED",
  }

  const current: ObservedWorkloadIdentity = {
    ...admission,
    workloadId: "wl-EVIL", // workload changed!
  }

  const r = phaseC_pep(grant, action, state, current, admission)
  assertEqual(r.decision, "DENY", "workload change → DENY")
  assert(r.reason.includes("stale"), "reason mentions stale")
}

console.log("Phase C PEP: revoked node denies at recheck")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState({ identityStatus: "REVOKED", enforcementMode: "QUARANTINED" })

  const identity: ObservedWorkloadIdentity = {
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    executablePath: "/usr/bin/bun",
    executableDigest: "digest-1",
    operatingSystemPrincipal: "user-1",
    processId: 1234,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "ARGV", authoritative: false },
    assurance: "OS_OBSERVED",
  }

  const r = phaseC_pep(grant, action, state, identity, identity)
  assertEqual(r.decision, "DENY", "revoked node at recheck → DENY")
}

console.log("Phase C PEP: executable digest change denies")
{
  const grant = createValidGrant()
  const action = createValidAction()
  const state = createValidNodeState()

  const admission: ObservedWorkloadIdentity = {
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    executablePath: "/usr/bin/bun",
    executableDigest: "digest-1",
    operatingSystemPrincipal: "user-1",
    processId: 1234,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "ARGV", authoritative: false },
    assurance: "OS_OBSERVED",
  }

  const current: ObservedWorkloadIdentity = {
    ...admission,
    executableDigest: "digest-EVIL",
    workloadId: "wl-different", // derived from different digest
  }

  const r = phaseC_pep(grant, action, state, current, admission)
  assertEqual(r.decision, "DENY", "executable change → DENY")
}

// ═══════════════════════════════════════════════════════════════════════
// Summary
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
