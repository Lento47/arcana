/**
 * D-10: Hostile-Node Adversarial Evaluation (Phase D frozen matrix)
 *
 * The ten playbook adversarial categories, exercised over the implemented
 * Phase D stack. Every fixture must fail closed; the suite asserts zero
 * bypasses and reports the fixture/assertion totals.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "./canonical-serializer"
import { CAPABILITY_DOMAIN } from "./signed-envelopes"
import { JOIN_TOKEN_DOMAIN, signEnvelope, type JoinToken } from "./node-enrollment"
import { verifySignedCapability } from "./verifier"
import { audienceMatches, type DistributedGrantAudience } from "./identity-contracts"
import { enrollNode, rotateNodeKey, verifyNodeKey, type EnrollmentContext } from "./node-enrollment"
import { SqliteEnrollmentRegistry } from "./node-enrollment-sqlite"
import { SqliteExecutionLedger } from "./execution-ledger-sqlite"
import { claimExecution, completeExecution, type DistributedExecutionKey } from "./execution-ledger"
import { buildProofBatch } from "./proof-batching"
import {
  registerProofBatch,
  reconcileNodeProofs,
  signProofBatch,
  type ProofBatchEnvelope,
} from "./proof-registration"
import { SqliteProofBatchLedger } from "./proof-registration-sqlite"
import {
  reduceRevocationState,
  type RevocationSyncState,
  type VerifiedRevocationInput,
} from "./reducers"
import { evaluateOfflineRequest } from "./offline-policy"
import { governedDistributedPep, type GovernedDistributedPepInput } from "./governed-distributed-pep"
import type { DerivedLocalGrant, DistributedAction } from "./distributed-pep"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("41".repeat(32)))
const attackerKey = ed25519.keygen(hexToBytes("42".repeat(32)))
const nodeKey = ed25519.keygen(hexToBytes("43".repeat(32)))
const rotatedKey = ed25519.keygen(hexToBytes("44".repeat(32)))
const NOW = new Date("2026-08-02T12:00:00.000Z")
const ISSUER_KEYS = new Map([["issuer-arcana", issuerKey.publicKey]])

let fixtureCount = 0
let bypassCount = 0

function expectFailClosed(actual: boolean, label: string): void {
  fixtureCount++
  if (!actual) {
    bypassCount++
    console.error(`[D-10 BYPASS] ${label}`)
  }
  expect(actual).toBe(true)
}

function capabilityEnvelope(nodeId: string, overrides: Record<string, unknown> = {}) {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    audienceNodeId: nodeId,
    grant: {
      grantId: "grant-1",
      principal: { kind: "agent", id: "agent:build" },
      actions: ["filesystem.read"],
      resources: ["packages/**"],
      workspaceId: "workspace-1",
      contractId: "contract-1",
      contractRevision: 1,
      maxUses: 1,
      delegationDepth: 0,
    },
    issuedAt: "2026-08-02T11:00:00.000Z",
    expiresAt: "2026-08-02T23:00:00.000Z",
    nonce: "nonce-1",
    ...overrides,
  }
  return signEnvelope(CAPABILITY_DOMAIN, payload, issuerKey.secretKey)
}

function revokedState(): RevocationSyncState {
  return {
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    acceptedSequence: 0,
    emergencyEpoch: 0,
    revokedGrantIds: new Set(),
    revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(),
    revokedIssuerEpochs: new Map(),
    status: "UNAVAILABLE",
  }
}

function verifiedInput(sequence: number, subjectType: VerifiedRevocationInput["subjectType"], subjectId: string): VerifiedRevocationInput {
  return {
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType,
    subjectId,
    receivedAt: NOW.toISOString(),
  }
}

function grantFixture(): DerivedLocalGrant {
  return {
    derivationId: "derivation-1",
    sourceEnvelopeHash: "hash",
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    nodeId: "node-alpha",
    workloadId: "workload-1",
    workloadAssurance: "OS_OBSERVED",
    principalId: "agent:build",
    sessionId: "session-1",
    policySequence: 1,
    policyDigest: "policy-1",
    revocationSequence: 1,
    revocationDigest: "revocation-1",
    localGrantId: "grant-1",
    action: "filesystem.read",
    resource: "packages/arcana",
    effectiveExpiresAt: "2099-01-01T00:00:00.000Z",
    derivedAt: NOW.toISOString(),
  }
}

function pepInput(overrides: Partial<GovernedDistributedPepInput> = {}): GovernedDistributedPepInput {
  const wl: ObservedWorkloadIdentity = {
    nodeId: "node-alpha",
    workloadId: "workload-1",
    executablePath: "/bin/arcana",
    executableDigest: "digest",
    operatingSystemPrincipal: "operator",
    processId: 1,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "CONFIGURED_MAPPING", authoritative: true },
    assurance: "OS_OBSERVED",
  }
  const nodeState: DurableNodeSecurityState = {
    nodeId: "node-alpha",
    trustDomain: "arcana.test",
    identityStatus: "TRUSTED",
    nodeKeyEpoch: 1,
    nodeCertificateFingerprint: "fp",
    acceptedPolicyIssuerId: "issuer-arcana",
    acceptedPolicyIssuerEpoch: 1,
    acceptedPolicySequence: 1,
    acceptedPolicyDigest: "policy-1",
    policyExpiresAt: "2099-01-01T00:00:00.000Z",
    acceptedRevocationSequence: 1,
    emergencyRevocationEpoch: 0,
    revocationDigest: "revocation-1",
    enforcementMode: "ONLINE",
    lastProofSequence: 0,
    lastAcknowledgedProofSequence: 0,
    version: 1,
  }
  return {
    grant: grantFixture(),
    action: { action: "filesystem.read", workspace: "/workspace", resource: "packages/arcana" } as DistributedAction,
    nodeState,
    workloadIdentity: wl,
    admissionIdentity: wl,
    ...overrides,
  }
}

function executionKey(): DistributedExecutionKey {
  return {
    executionId: "exec-1",
    nodeId: "node-alpha",
    sessionId: "session-1",
    requestHash: "request-hash-1",
    grantId: "grant-1",
    nonce: "nonce-1",
  }
}

function proofEnvelope(nodeId = "node-alpha", secretKey = nodeKey.secretKey): ProofBatchEnvelope {
  const built = buildProofBatch(
    [1, 2].map((seq) => ({
      localSequence: seq,
      runProofHash: `h-${seq}`,
      evidenceHash: `e-${seq}`,
      traceHealth: "COMPLETE",
      timestamp: NOW.toISOString(),
    })),
    {
      trustDomain: "arcana.test",
      nodeId,
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      issuedAt: NOW.toISOString(),
    },
  )
  if (!built.success) throw new Error(built.reason)
  return signProofBatch(built.payload, secretKey)
}

describe("D-10 hostile-node adversarial matrix", () => {
  it("1. forged grants are never accepted", () => {
    const envelope = capabilityEnvelope("node-alpha")
    envelope.signature = encodeBase64url(new Uint8Array(64).fill(1))
    const result = verifySignedCapability(envelope, ISSUER_KEYS, { now: NOW.getTime() })
    expectFailClosed(result.valid === false, "forged grant accepted")
  })

  it("2. wrong-audience grants are never accepted", () => {
    const envelope = capabilityEnvelope("node-beta")
    const result = verifySignedCapability(envelope, ISSUER_KEYS, {
      now: NOW.getTime(),
      expectedAudienceNodeId: "node-alpha",
    })
    expectFailClosed(result.valid === false, "wrong-audience grant accepted")

    const audience: DistributedGrantAudience = {
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      workloadId: "workload-1",
      principalId: "agent:build",
      sessionId: "session-1",
    }
    const mismatch = audienceMatches(
      audience,
      { trustDomain: "arcana.test", nodeId: "node-alpha", nodeCertificateFingerprint: "fp", nodeKeyEpoch: 1, attestationMethod: "DECLARED" },
      { nodeId: "node-alpha", workloadId: "workload-2", harness: "ARCANA", assurance: "DECLARED" },
      { workloadId: "workload-1", principalId: "agent:build", sessionId: "session-1" },
    )
    expectFailClosed(mismatch.match === false, "wrong workload audience accepted")
  })

  it("3. replays are never accepted", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const first = claimExecution(executionKey(), ledger, NOW)
    expect(first.kind).toBe("CLAIMED")
    completeExecution("exec-1", ledger, JSON.stringify({ ok: true }), NOW)
    const replay = claimExecution(executionKey(), ledger, NOW)
    expectFailClosed(replay.kind === "DUPLICATE", "execution replay executed twice")

    const proofLedger = new SqliteProofBatchLedger(new Database(":memory:"))
    const envelope = proofEnvelope()
    registerProofBatch(envelope, proofLedger, {
      acceptedTrustDomain: "arcana.test",
      nodePublicKeys: new Map([["node-alpha", nodeKey.publicKey]]),
      now: NOW,
    })
    const duplicateProof = registerProofBatch(envelope, proofLedger, {
      acceptedTrustDomain: "arcana.test",
      nodePublicKeys: new Map([["node-alpha", nodeKey.publicKey]]),
      now: NOW,
    })
    expectFailClosed(duplicateProof.kind === "DUPLICATE", "proof batch replay accepted")
  })

  it("4. clock-skewed envelopes are never accepted", () => {
    const expired = capabilityEnvelope("node-alpha", {
      issuedAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-08-01T01:00:00.000Z",
    })
    const expiredResult = verifySignedCapability(expired, ISSUER_KEYS, { now: NOW.getTime() })
    expectFailClosed(expiredResult.valid === false, "expired grant accepted")

    const future = capabilityEnvelope("node-alpha", { issuedAt: "2026-08-03T00:00:00.000Z" })
    const futureResult = verifySignedCapability(future, ISSUER_KEYS, { now: NOW.getTime() })
    expectFailClosed(futureResult.valid === false, "future-dated grant accepted")
  })

  it("5. rotated keys are never accepted", () => {
    const reg = new SqliteEnrollmentRegistry(new Database(":memory:"))
    const context: EnrollmentContext = {
      issuerId: "issuer-arcana",
      issuerSecretKey: issuerKey.secretKey,
      issuerPublicKeys: ISSUER_KEYS,
      certificateDurationMs: 86_400_000,
      now: NOW,
    }
    const token = signEnvelope(JOIN_TOKEN_DOMAIN, {
      schemaVersion: 1,
      tokenId: "t1",
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    }, issuerKey.secretKey)
    enrollNode(token as unknown as JoinToken, nodeKey.publicKey, reg, context)
    rotateNodeKey("node-alpha", rotatedKey.publicKey, reg, context)
    const oldKey = verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg)
    expectFailClosed(oldKey.valid === false, "rotated (superseded) key accepted")
    const newKey = verifyNodeKey("node-alpha", rotatedKey.publicKey, 2, "arcana.test", reg)
    expect(newKey.valid).toBe(true)
  })

  it("6. delayed revocation blocks later effects", () => {
    let state = revokedState()
    const applied = reduceRevocationState(state, verifiedInput(1, "GRANT", "grant-1"))
    expect(applied.status).toBe("APPLIED")
    if (applied.status === "APPLIED") state = applied.state
    expectFailClosed(state.revokedGrantIds.has("grant-1"), "revoked grant not recorded")

    const denied = governedDistributedPep(pepInput({ revokedGrantIds: state.revokedGrantIds }))
    expectFailClosed(denied.decision === "DENY", "effect executed for a revoked grant")
  })

  it("7. partition never increases authority", () => {
    const offline = {
      connectivity: "OFFLINE" as const,
      enforcement: "OFFLINE_RESTRICTED" as const,
      offlineElapsedMs: 61 * 60 * 1000,
      policyFreshnessMs: 1,
      revocationFreshnessMs: 1,
    }
    const decision = evaluateOfflineRequest(
      { riskClass: "HIGH", consequential: true, approvalRequired: false },
      { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z" },
      offline,
      NOW,
    )
    expectFailClosed(decision.decision === "DENY", "consequential effect allowed after offline window")
  })

  it("8. duplicate delivery never produces a second protected effect", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const result = governedDistributedPep(
      pepInput({ execution: { key: executionKey(), ledger, now: NOW } }),
    )
    expect(result.decision).toBe("ALLOW")
    completeExecution("exec-1", ledger, JSON.stringify({ ok: true }), NOW)
    const duplicate = governedDistributedPep(
      pepInput({ execution: { key: executionKey(), ledger, now: NOW } }),
    )
    expectFailClosed(duplicate.decision === "DUPLICATE", "duplicate delivery produced a second effect")
  })

  it("9. proof omission is detected by reconciliation", () => {
    const ledger = new SqliteProofBatchLedger(new Database(":memory:"))
    const first = registerProofBatch(proofEnvelope(), ledger, {
      acceptedTrustDomain: "arcana.test",
      nodePublicKeys: new Map([["node-alpha", nodeKey.publicKey]]),
      now: NOW,
    })
    if (first.kind !== "REGISTERED") throw new Error("fixture")
    const late = proofEnvelope()
    const lateBuilt = buildProofBatch(
      [5, 6].map((seq) => ({
        localSequence: seq,
        runProofHash: `h-${seq}`,
        evidenceHash: `e-${seq}`,
        traceHealth: "COMPLETE",
        timestamp: NOW.toISOString(),
      })),
      {
        trustDomain: "arcana.test",
        nodeId: "node-alpha",
        nodeKeyEpoch: 1,
        policySequence: 1,
        policyDigest: "policy-1",
        revocationSequence: 0,
        revocationDigest: "revocation-0",
        emergencyEpoch: 0,
        previousBatchRoot: first.record.batchRoot,
        issuedAt: NOW.toISOString(),
      },
    )
    if (!lateBuilt.success) throw new Error("fixture")
    const lateEnv = signProofBatch(lateBuilt.payload, nodeKey.secretKey)
    ledger.append({
      batchRoot: lateEnv.batchRoot,
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      firstLocalSequence: 5,
      lastLocalSequence: 6,
      previousBatchRoot: first.record.batchRoot,
      eventMerkleRoot: lateEnv.payload.eventMerkleRoot,
      runProofHashes: lateEnv.payload.runProofHashes,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      issuedAt: NOW.toISOString(),
      receivedAt: NOW.toISOString(),
      signedEnvelope: JSON.stringify(lateEnv),
    })
    const reconciliation = reconcileNodeProofs(
      {
        nodeId: "node-alpha",
        firstLocalSequence: 1,
        lastLocalSequence: 6,
        lastBatchRoot: lateEnv.batchRoot,
      },
      ledger,
    )
    expectFailClosed(reconciliation.status === "GAPS_DETECTED", "omitted proof range reported complete")
  })

  it("10. node replacement/impersonation is never accepted", () => {
    const reg = new SqliteEnrollmentRegistry(new Database(":memory:"))
    const context: EnrollmentContext = {
      issuerId: "issuer-arcana",
      issuerSecretKey: issuerKey.secretKey,
      issuerPublicKeys: ISSUER_KEYS,
      certificateDurationMs: 86_400_000,
      now: NOW,
    }
    const token = signEnvelope(JOIN_TOKEN_DOMAIN, {
      schemaVersion: 1,
      tokenId: "t2",
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    }, issuerKey.secretKey)
    enrollNode(token as unknown as JoinToken, nodeKey.publicKey, reg, context)

    const impersonator = verifyNodeKey("node-beta", nodeKey.publicKey, 1, "arcana.test", reg)
    expectFailClosed(impersonator.valid === false, "impersonating node accepted")

    const proofLedger = new SqliteProofBatchLedger(new Database(":memory:"))
    const result = registerProofBatch(proofEnvelope("node-beta", attackerKey.secretKey), proofLedger, {
      acceptedTrustDomain: "arcana.test",
      nodePublicKeys: new Map([["node-alpha", nodeKey.publicKey]]),
      now: NOW,
    })
    expectFailClosed(result.kind === "REJECTED", "unregistered node proof accepted")
  })

  it("reports the frozen matrix totals with zero bypasses", () => {
    expect(bypassCount).toBe(0)
    expect(fixtureCount).toBeGreaterThanOrEqual(15)
    console.log(`[D-10] hostile-node matrix: ${fixtureCount} fail-closed fixtures, ${bypassCount} bypasses`)
  })
})
