/**
 * D-6/D-9 integration: governed distributed PEP tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteExecutionLedger } from "./execution-ledger-sqlite"
import {
  markUnknownAfterNetwork,
  type DistributedExecutionKey,
} from "./execution-ledger"
import {
  governedDistributedPep,
  type GovernedDistributedPepInput,
} from "./governed-distributed-pep"
import type { DerivedLocalGrant, DistributedAction } from "./distributed-pep"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"

const NOW = new Date("2026-08-02T12:00:00.000Z")

const GRANT: DerivedLocalGrant = {
  derivationId: "derivation-1",
  sourceEnvelopeHash: "envelope-hash",
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
  localGrantId: "local-grant-1",
  action: "filesystem.read",
  resource: "packages/arcana",
  effectiveExpiresAt: "2099-01-01T00:00:00.000Z",
  derivedAt: "2026-08-02T11:00:00.000Z",
}

const ACTION: DistributedAction = {
  action: "filesystem.read",
  workspace: "/workspace",
  resource: "packages/arcana",
}

function nodeState(overrides: Partial<DurableNodeSecurityState> = {}): DurableNodeSecurityState {
  return {
    nodeId: "node-alpha",
    trustDomain: "arcana.test",
    identityStatus: "TRUSTED",
    nodeKeyEpoch: 1,
    nodeCertificateFingerprint: "fingerprint-1",
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
    ...overrides,
  }
}

function workload(): ObservedWorkloadIdentity {
  return {
    nodeId: "node-alpha",
    workloadId: "workload-1",
    executablePath: "/bin/arcana",
    executableDigest: "digest-1",
    operatingSystemPrincipal: "operator",
    processId: 42,
    parentProcessId: 1,
    harness: "ARCANA",
    harnessDetection: { harness: "ARCANA", evidence: "CONFIGURED_MAPPING", authoritative: true },
    assurance: "OS_OBSERVED",
  }
}

function baseInput(overrides: Partial<GovernedDistributedPepInput> = {}): GovernedDistributedPepInput {
  const wl = workload()
  return {
    grant: GRANT,
    action: ACTION,
    nodeState: nodeState(),
    workloadIdentity: wl,
    admissionIdentity: wl,
    ...overrides,
  }
}

function executionKey(overrides: Partial<DistributedExecutionKey> = {}): DistributedExecutionKey {
  return {
    executionId: "exec-1",
    nodeId: "node-alpha",
    sessionId: "session-1",
    requestHash: "request-hash-1",
    grantId: "local-grant-1",
    nonce: "nonce-1",
    ...overrides,
  }
}

describe("governed distributed PEP: base and offline policy", () => {
  it("allows online reads without extra gates", () => {
    const result = governedDistributedPep(baseInput())
    expect(result).toMatchObject({ decision: "ALLOW" })
  })

  it("denies quarantined nodes", () => {
    const result = governedDistributedPep(
      baseInput({ nodeState: nodeState({ enforcementMode: "QUARANTINED" }) }),
    )
    expect(result).toMatchObject({ decision: "DENY", reason: expect.stringContaining("quarantined") })
  })

  it("denies offline-restricted requests without an offlineEnabled grant", () => {
    const result = governedDistributedPep(
      baseInput({
        nodeState: nodeState({ enforcementMode: "OFFLINE_RESTRICTED" }),
        offline: {
          nodeState: {
            connectivity: "OFFLINE",
            enforcement: "OFFLINE_RESTRICTED",
            offlineElapsedMs: 60_000,
            policyFreshnessMs: 1,
            revocationFreshnessMs: 1,
          },
          grant: { offlineEnabled: false, expiresAt: "2099-01-01T00:00:00.000Z" },
        },
      }),
    )
    expect(result).toMatchObject({ decision: "DENY", reason: expect.stringContaining("offline policy") })
  })

  it("allows offline-restricted reads with an offlineEnabled grant", () => {
    const result = governedDistributedPep(
      baseInput({
        nodeState: nodeState({ enforcementMode: "OFFLINE_RESTRICTED" }),
        offline: {
          nodeState: {
            connectivity: "OFFLINE",
            enforcement: "OFFLINE_RESTRICTED",
            offlineElapsedMs: 60_000,
            policyFreshnessMs: 1,
            revocationFreshnessMs: 1,
          },
          grant: { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z" },
        },
      }),
    )
    expect(result).toMatchObject({ decision: "ALLOW" })
  })
})

describe("governed distributed PEP: exactly-once execution", () => {
  it("claims and executes once; duplicates never re-execute", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const first = governedDistributedPep(
      baseInput({
        execution: { key: executionKey(), ledger, now: NOW },
      }),
    )
    expect(first).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })

    const second = governedDistributedPep(
      baseInput({
        execution: { key: executionKey(), ledger, now: NOW },
      }),
    )
    expect(second).toMatchObject({ decision: "DUPLICATE" })
  })

  it("denies identity conflicts (same executionId, different requestHash)", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    governedDistributedPep(baseInput({ execution: { key: executionKey(), ledger, now: NOW } }))
    const conflict = governedDistributedPep(
      baseInput({
        execution: { key: executionKey({ requestHash: "different-hash" }), ledger, now: NOW },
      }),
    )
    expect(conflict).toMatchObject({ decision: "DENY", reason: expect.stringContaining("conflict") })
  })

  it("forbids replay of irreversible effects after network ambiguity", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    governedDistributedPep(
      baseInput({
        execution: { key: executionKey(), ledger, now: NOW, irreversible: true },
      }),
    )
    markUnknownAfterNetwork("exec-1", ledger, NOW)
    const replay = governedDistributedPep(
      baseInput({
        execution: { key: executionKey(), ledger, now: NOW, irreversible: true },
      }),
    )
    expect(replay).toMatchObject({ decision: "REPLAY_FORBIDDEN" })
  })

  it("combines offline gating with exactly-once claiming", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const result = governedDistributedPep(
      baseInput({
        nodeState: nodeState({ enforcementMode: "OFFLINE_RESTRICTED" }),
        offline: {
          nodeState: {
            connectivity: "OFFLINE",
            enforcement: "OFFLINE_RESTRICTED",
            offlineElapsedMs: 60_000,
            policyFreshnessMs: 1,
            revocationFreshnessMs: 1,
          },
          grant: { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z" },
        },
        execution: { key: executionKey(), ledger, now: NOW },
      }),
    )
    expect(result).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })
  })
})
