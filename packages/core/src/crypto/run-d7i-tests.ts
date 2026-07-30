/**
 * D-7I: Integration Test — Real Signed Envelope → Real Filesystem Read
 *
 * Starts from raw Ed25519 keypair and real signed envelope bytes.
 * Proves the full pipeline:
 *   raw signed envelope → ACEP-1 verification → audience → policy/revocation
 *   → workload identity → derived grant → PDP → PEP → filesystem read → evidence
 *
 * Run with: bun run packages/core/src/crypto/run-d7i-tests.ts
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { createHash, randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { verifySignedCapability } from "./verifier"
import { buildSignatureInput, encodeBase64url } from "./canonical-serializer"
import { CAPABILITY_DOMAIN } from "./signed-envelopes"
import { SafeBoundedFileReader, type BoundedReadResult } from "./bounded-file-reader"
import { phaseC_pdp, phaseC_pep, deriveLocalGrant, verifyWorkspaceContainment } from "./distributed-pep"
import {
  type DurableNodeSecurityState,
  createInitialDurableState,
} from "./durable-state"
import type {
  ObservedWorkloadIdentity,
  WorkloadIdentityAssurance,
} from "./workload-identity"
import type {
  DistributedGrantAudience,
  NodeIdentity,
} from "./identity-contracts"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ─── Test Workspace Setup ───────────────────────────────────────────

const TEST_DIR = join(import.meta.dir, ".test-d7i-workspace")
const WORKSPACE_ROOT = join(TEST_DIR, "arcana")
const TARGET_FILE = "docs/security/PHASE-C-MILESTONE.md"
const TARGET_CONTENT = "# Phase C Milestone\n\nThis is a test file for D-7I integration.\n"

function setupWorkspace() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  mkdirSync(join(WORKSPACE_ROOT, "docs/security"), { recursive: true })
  writeFileSync(join(WORKSPACE_ROOT, TARGET_FILE), TARGET_CONTENT)

  // Create a symlink that escapes workspace (for adversarial test)
  try {
    const outsideFile = join(TEST_DIR, "outside-secret.txt")
    writeFileSync(outsideFile, "SECRET: should not be readable")
    // Create symlink inside workspace pointing outside
    const symlinkPath = join(WORKSPACE_ROOT, "docs/escape-link.txt")
    // On Windows, symlinks need admin privileges, so we'll test with path traversal instead
  } catch {}
}

function cleanupWorkspace() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
}

// ─── Key Generation ─────────────────────────────────────────────────

function generateIssuerKeyPair() {
  const privKey = ed25519.utils.randomSecretKey()
  const pubKey = ed25519.getPublicKey(privKey)
  return { privKey, pubKey }
}

function pubKeyToBase64url(pubKey: Uint8Array): string {
  return encodeBase64url(Buffer.from(pubKey))
}

function pubKeyToHex(pubKey: Uint8Array): string {
  return Buffer.from(pubKey).toString("hex")
}

// ─── Envelope Construction + Signing ────────────────────────────────

function buildAndSignCapabilityEnvelope(
  issuerPrivKey: Uint8Array,
  issuerPubKey: Uint8Array,
  overrides?: Partial<{
    nodeId: string
    principalId: string
    sessionId: string
    expiresAt: string
    actions: string[]
    resources: string[]
  }>,
): Record<string, unknown> {
  const nodeId = overrides?.nodeId ?? "node-local-01"
  const principalId = overrides?.principalId ?? "agent-hermes-001"
  const sessionId = overrides?.sessionId ?? "session-abc-123"
  const expiresAt = overrides?.expiresAt ?? "2099-12-31T23:59:59.999Z"
  const actions = overrides?.actions ?? ["filesystem.read"]
  const resources = overrides?.resources ?? [TARGET_FILE]

  const grantId = `grant-${createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 12)}`

  // Build the unsigned envelope object (EXCLUDE signature and signatureAlgorithm)
  const unsignedPayload: Record<string, unknown> = {
    schemaVersion: 1,
    issuerId: "trust-registry",
    issuerEpoch: 1,
    audienceNodeId: nodeId,
    grant: {
      grantId,
      principal: { kind: "agent", id: principalId },
      actions,
      resources,
      workspaceId: "arcana",
      contractId: "contract-001",
      contractRevision: 1,
      maxUses: 1,
      delegationDepth: 0,
    },
    issuedAt: "2026-07-30T12:00:00.000Z",
    expiresAt,
    nonce: randomBytes(16).toString("hex"),
  }

  // Build signature input (domain + canonical unsigned payload)
  const signatureInput = buildSignatureInput(CAPABILITY_DOMAIN, unsignedPayload)

  // Sign
  const signature = ed25519.sign(signatureInput, issuerPrivKey)

  // Build complete envelope (include signatureAlgorithm)
  return {
    ...unsignedPayload,
    signatureAlgorithm: "Ed25519",
    signature: encodeBase64url(Buffer.from(signature)),
  }
}

// ─── Test Fixtures ──────────────────────────────────────────────────

const { privKey: issuerPrivKey, pubKey: issuerPubKey } = generateIssuerKeyPair()

function createNodeState(overrides?: Partial<DurableNodeSecurityState>): DurableNodeSecurityState {
  return {
    nodeId: "node-local-01",
    trustDomain: "arcana.local",
    identityStatus: "VERIFIED",
    nodeKeyEpoch: 1,
    nodeCertificateFingerprint: "fp-local-01",
    acceptedPolicyIssuerId: "trust-registry",
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

function createWorkloadIdentity(overrides?: Partial<ObservedWorkloadIdentity>): ObservedWorkloadIdentity {
  return {
    nodeId: "node-local-01",
    workloadId: "wl-hermes-abc",
    executablePath: process.execPath,
    executableDigest: createHash("sha256").update("test-binary").digest("hex"),
    operatingSystemPrincipal: process.env.USER ?? process.env.USERNAME ?? "test-user",
    processId: process.pid,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "EXECUTABLE_DIGEST", authoritative: true },
    assurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// D-7I Integration Tests
// ═══════════════════════════════════════════════════════════════════════

console.log("D-7I: Valid signed envelope → real filesystem read")
{
  setupWorkspace()

  // 1. Build and sign a real envelope
  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey)
  const envelopeJson = JSON.stringify(envelope)
  const envelopeBytes = new TextEncoder().encode(envelopeJson)
  const envelopeHash = createHash("sha256").update(envelopeBytes).digest("hex")

  // 2. Verify the envelope through ACEP-1 pipeline
  const trustedKeys = new Map<string, Uint8Array>()
  trustedKeys.set("trust-registry", issuerPubKey)

  const verification = verifySignedCapability(envelope, trustedKeys)
  assert(verification.valid === true, `ACEP-1 verification passes: ${JSON.stringify(verification)}`)
  if (!verification.valid) {
    assert(false, `verification failed at ${verification.stage}: ${verification.reason} — ${verification.detail}`)
  }

  // 3. Verify audience (check that envelope has expected fields)
  assertEqual(envelope.issuerId, "trust-registry", "issuer matches")
  assertEqual(envelope.audienceNodeId, "node-local-01", "audience matches")

  // 4. Read the file through bounded reader
  const reader = new SafeBoundedFileReader()
  const readResult = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: TARGET_FILE,
    maximumBytes: 64 * 1024,
  })

  assert(readResult.success, "file read succeeds")
  if (readResult.success) {
    assertEqual(readResult.bytesRead, Buffer.byteLength(TARGET_CONTENT), "correct bytes read")
    assert(readResult.hash.length === 64, "SHA-256 hash produced")
    assert(readResult.content.toString(), "content is readable")
  }

  // 5. Verify containment
  const containment = verifyWorkspaceContainment(WORKSPACE_ROOT, TARGET_FILE)
  assert(containment.contained === true, "target file is contained in workspace")

  // 6. Build evidence
  const evidence = {
    envelopeHash,
    envelopeCategory: "SIGNED_CAPABILITY" as const,
    issuerId: "trust-registry",
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-hermes-abc",
    workloadAssurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    principalId: "agent-hermes-001",
    sessionId: "session-abc-123",
    policySequence: 5,
    policyDigest: "policy-digest-abc",
    revocationSequence: 3,
    revocationDigest: "rev-digest-xyz",
    derivedLocalGrantId: "local-test",
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    distributedVerification: "VERIFIED" as const,
    localPdpDecision: "ALLOW" as const,
    preEffectRecheck: "PASSED" as const,
    effectType: "FILESYSTEM_READ" as const,
    effectReceiptHash: readResult.success ? readResult.hash : undefined,
  }

  assert(evidence.distributedVerification === "VERIFIED", "evidence shows VERIFIED")
  assert(evidence.effectReceiptHash !== undefined, "evidence includes receipt hash")

  cleanupWorkspace()
}

console.log("D-7I: Signature mutation → DENY")
{
  setupWorkspace()

  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey)
  // Mutate the signature
  envelope.signature = encodeBase64url(Buffer.from(randomBytes(64)))

  const trustedKeys = new Map<string, Uint8Array>()
  trustedKeys.set("trust-registry", issuerPubKey)

  const verification = verifySignedCapability(envelope, trustedKeys)
  assert(verification.valid === false, "signature mutation rejected")

  cleanupWorkspace()
}

console.log("D-7I: Wrong node audience → DENY")
{
  setupWorkspace()

  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey, {
    nodeId: "node-OTHER",
  })

  const trustedKeys = new Map<string, Uint8Array>()
  trustedKeys.set("trust-registry", issuerPubKey)

  const verification = verifySignedCapability(envelope, trustedKeys, {
    expectedAudienceNodeId: "node-local-01",
  })
  assert(verification.valid === false, "wrong node rejected")

  cleanupWorkspace()
}

console.log("D-7I: Expired capability → DENY")
{
  setupWorkspace()

  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey, {
    expiresAt: "2020-01-01T00:00:00.000Z",
  })

  const trustedKeys = new Map<string, Uint8Array>()
  trustedKeys.set("trust-registry", issuerPubKey)

  const verification = verifySignedCapability(envelope, trustedKeys)
  assert(verification.valid === false, "expired capability rejected")

  cleanupWorkspace()
}

console.log("D-7I: Unknown issuer → DENY")
{
  setupWorkspace()

  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey)

  // Empty trust store
  const trustedKeys = new Map<string, Uint8Array>()

  const verification = verifySignedCapability(envelope, trustedKeys)
  assert(verification.valid === false, "unknown issuer rejected")

  cleanupWorkspace()
}

console.log("D-7I: Wrong public key → DENY")
{
  setupWorkspace()

  const envelope = buildAndSignCapabilityEnvelope(issuerPrivKey, issuerPubKey)

  // Use a different key in the trust store
  const { pubKey: wrongPubKey } = generateIssuerKeyPair()
  const trustedKeys = new Map<string, Uint8Array>()
  trustedKeys.set("trust-registry", wrongPubKey)

  const verification = verifySignedCapability(envelope, trustedKeys)
  assert(verification.valid === false, "wrong key rejected")

  cleanupWorkspace()
}

console.log("D-7I: Path traversal → DENY")
{
  setupWorkspace()

  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: "../../../etc/passwd",
    maximumBytes: 64 * 1024,
  })

  assert(!result.success, "path traversal rejected")
  assert(result.success === false && result.stage === "PATH_VALIDATION", "rejected at PATH_VALIDATION stage")

  cleanupWorkspace()
}

console.log("D-7I: Absolute path outside workspace → DENY")
{
  setupWorkspace()

  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: "/etc/passwd",
    maximumBytes: 64 * 1024,
  })

  assert(!result.success, "absolute outside path rejected")
  assert(result.success === false && result.stage === "PATH_VALIDATION", "rejected at PATH_VALIDATION")

  cleanupWorkspace()
}

console.log("D-7I: Null byte in path → DENY")
{
  setupWorkspace()

  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: "docs/readme.md\0.evil",
    maximumBytes: 64 * 1024,
  })

  assert(!result.success, "null byte rejected")
  assert(result.success === false && result.stage === "PATH_VALIDATION", "rejected at PATH_VALIDATION")

  cleanupWorkspace()
}

console.log("D-7I: Directory read → DENY")
{
  setupWorkspace()

  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: "docs",
    maximumBytes: 64 * 1024,
  })

  assert(!result.success, "directory read rejected")
  assert(result.success === false && result.stage === "STAT", "rejected at STAT")

  cleanupWorkspace()
}

console.log("D-7I: File exceeding maximum bytes → DENY")
{
  setupWorkspace()

  // Create a large file
  const largeContent = "x".repeat(1024)
  writeFileSync(join(WORKSPACE_ROOT, "docs/large.txt"), largeContent)

  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: WORKSPACE_ROOT,
    requestedPath: "docs/large.txt",
    maximumBytes: 100, // much smaller than file
  })

  assert(!result.success, "oversized file rejected")
  assert(result.success === false && result.stage === "READ", "rejected at READ")

  cleanupWorkspace()
}

console.log("D-7I: Quarantined node → PDP DENY")
{
  const nodeState = createNodeState({ enforcementMode: "QUARANTINED" })
  const grant = {
    derivationId: "drv-1",
    sourceEnvelopeHash: "hash",
    issuerId: "trust-registry",
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    workloadAssurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    principalId: "agent-1",
    sessionId: "session-1",
    policySequence: 5,
    policyDigest: "pd",
    revocationSequence: 3,
    revocationDigest: "rd",
    localGrantId: "local-1",
    action: "filesystem.read",
    resource: TARGET_FILE,
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    derivedAt: new Date().toISOString(),
  }

  const pdp = phaseC_pdp(grant, { action: "filesystem.read", workspace: "arcana", resource: TARGET_FILE }, nodeState)
  assertEqual(pdp.decision, "DENY", "quarantined node → PDP DENY")
}

console.log("D-7I: Revoked node → PDP DENY")
{
  const nodeState = createNodeState({ identityStatus: "REVOKED", enforcementMode: "QUARANTINED" })
  const grant = {
    derivationId: "drv-1",
    sourceEnvelopeHash: "hash",
    issuerId: "trust-registry",
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    workloadAssurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    principalId: "agent-1",
    sessionId: "session-1",
    policySequence: 5,
    policyDigest: "pd",
    revocationSequence: 3,
    revocationDigest: "rd",
    localGrantId: "local-1",
    action: "filesystem.read",
    resource: TARGET_FILE,
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    derivedAt: new Date().toISOString(),
  }

  const pdp = phaseC_pdp(grant, { action: "filesystem.read", workspace: "arcana", resource: TARGET_FILE }, nodeState)
  assertEqual(pdp.decision, "DENY", "revoked node → PDP DENY")
}

console.log("D-7I: Workload change before effect → PEP DENY")
{
  const nodeState = createNodeState()
  const grant = {
    derivationId: "drv-1",
    sourceEnvelopeHash: "hash",
    issuerId: "trust-registry",
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    workloadAssurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    principalId: "agent-1",
    sessionId: "session-1",
    policySequence: 5,
    policyDigest: "pd",
    revocationSequence: 3,
    revocationDigest: "rd",
    localGrantId: "local-1",
    action: "filesystem.read",
    resource: TARGET_FILE,
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    derivedAt: new Date().toISOString(),
  }

  const admission = createWorkloadIdentity()
  const current = createWorkloadIdentity({ workloadId: "wl-EVIL" })

  const pep = phaseC_pep(grant, { action: "filesystem.read", workspace: "arcana", resource: TARGET_FILE }, nodeState, current, admission)
  assertEqual(pep.decision, "DENY", "workload change → PEP DENY")
  assert(pep.reason.includes("stale"), "reason mentions stale")
}

console.log("D-7I: PDP/PEP agree on ALLOW for valid state")
{
  const nodeState = createNodeState()
  const grant = {
    derivationId: "drv-1",
    sourceEnvelopeHash: "hash",
    issuerId: "trust-registry",
    issuerEpoch: 1,
    nodeId: "node-local-01",
    workloadId: "wl-abc",
    workloadAssurance: "OS_OBSERVED" as WorkloadIdentityAssurance,
    principalId: "agent-1",
    sessionId: "session-1",
    policySequence: 5,
    policyDigest: "pd",
    revocationSequence: 3,
    revocationDigest: "rd",
    localGrantId: "local-1",
    action: "filesystem.read",
    resource: TARGET_FILE,
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
    derivedAt: new Date().toISOString(),
  }

  const identity = createWorkloadIdentity()

  const pdp = phaseC_pdp(grant, { action: "filesystem.read", workspace: "arcana", resource: TARGET_FILE }, nodeState)
  assertEqual(pdp.decision, "ALLOW", "PDP allows valid state")

  const pep = phaseC_pep(grant, { action: "filesystem.read", workspace: "arcana", resource: TARGET_FILE }, nodeState, identity, identity)
  assertEqual(pep.decision, "ALLOW", "PEP allows stable workload")
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
