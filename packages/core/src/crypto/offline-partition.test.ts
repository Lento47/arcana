/**
 * D-9: node-level partition tests through the governed distributed PEP.
 *
 * Proves that the D-9 offline policy (`offline-policy.ts`) is enforced on the
 * real distributed PEP effect path (`governedDistributedPep`: base PEP
 * recheck → revoked-grant check → D-9 offline gate → D-6 exactly-once claim),
 * and that reconnection reconciliation restores normal decisions without
 * re-executing work claimed before the partition.
 *
 * Table-driven per the D-10 style: explicit fixtures with stable IDs, no
 * silent fallbacks, suite-level invariants, and unknown fixture IDs failing
 * at load time. The 15 unit tests in `offline-policy.test.ts` are the policy
 * oracle; every row here asserts the same semantics through the PEP.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteExecutionLedger } from "./execution-ledger-sqlite"
import {
  completeExecution,
  type DistributedExecutionKey,
  type ExecutionLedger,
} from "./execution-ledger"
import {
  computeEffectiveOfflineExpiry,
  DEFAULT_OFFLINE_LEASE_CONFIG,
  evaluateOfflineRequest,
  type OfflineCapableGrant,
  type OfflineLeaseConfig,
  type OfflineNodeState,
} from "./offline-policy"
import {
  governedDistributedPep,
  type GovernedDistributedPepInput,
  type GovernedPepResult,
} from "./governed-distributed-pep"
import type { DerivedLocalGrant, DistributedAction } from "./distributed-pep"
import type { DurableNodeSecurityState, Enforcement } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"

const T0 = new Date("2026-08-02T12:00:00.000Z")
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

// ─── Fixture builders ───────────────────────────────────────────────────────

function grantFixture(actionId: string): DerivedLocalGrant {
  return {
    derivationId: `derivation-${actionId}`,
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
    action: actionId,
    resource: "packages/arcana",
    effectiveExpiresAt: "2099-01-01T00:00:00.000Z",
    derivedAt: T0.toISOString(),
  }
}

function actionFixture(actionId: string): DistributedAction {
  if (actionId === "filesystem.read") {
    return { action: "filesystem.read", workspace: "/workspace", resource: "packages/arcana" }
  }
  // The D-7 action union only models filesystem.read; unknown action ids are
  // exercised explicitly to prove the offline gate fails closed on them.
  return { action: actionId, workspace: "/workspace", resource: "packages/arcana" } as unknown as DistributedAction
}

function nodeState(enforcement: Enforcement): DurableNodeSecurityState {
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
    enforcementMode: enforcement,
    lastProofSequence: 0,
    lastAcknowledgedProofSequence: 0,
    version: 1,
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
    grant: grantFixture("filesystem.read"),
    action: actionFixture("filesystem.read"),
    nodeState: nodeState("ONLINE"),
    workloadIdentity: wl,
    admissionIdentity: wl,
    ...overrides,
  }
}

function offlineInput(
  overrides: {
    nodeState?: OfflineNodeState
    grant?: Partial<OfflineCapableGrant>
    config?: OfflineLeaseConfig
  } = {},
): NonNullable<GovernedDistributedPepInput["offline"]> {
  return {
    nodeState: {
      connectivity: "OFFLINE",
      enforcement: "OFFLINE_RESTRICTED",
      offlineElapsedMs: 60_000,
      policyFreshnessMs: 1,
      revocationFreshnessMs: 1,
      ...overrides.nodeState,
    },
    grant: { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z", ...overrides.grant },
    ...(overrides.config ? { config: overrides.config } : {}),
  }
}

function executionKey(executionId: string): DistributedExecutionKey {
  return {
    executionId,
    nodeId: "node-alpha",
    sessionId: "session-1",
    requestHash: executionId,
    grantId: "local-grant-1",
    nonce: executionId,
  }
}

// ─── Partition enforcement-state matrix ─────────────────────────────────────

type StateFixture = {
  id: string
  description: string
  /** Durable node enforcement (drives the base PEP recheck). */
  nodeEnforcement: Enforcement
  /** D-9 offline snapshot; rows without it are pure ONLINE requests. */
  offline?: {
    nodeState: OfflineNodeState
    grant?: Partial<OfflineCapableGrant>
    config?: OfflineLeaseConfig
  }
  actionId: string
  expectDecision: GovernedPepResult["decision"]
  expectReason?: RegExp
}

const STATE_FIXTURES: StateFixture[] = [
  {
    id: "online-no-offline-input",
    description: "an ONLINE request keeps the existing PEP behavior with no offline gate",
    nodeEnforcement: "ONLINE",
    actionId: "filesystem.read",
    expectDecision: "ALLOW",
  },
  {
    id: "online-snapshot-via-offline-input",
    description: "an ONLINE offline snapshot degrades to a plain grant-expiry check",
    nodeEnforcement: "ONLINE",
    offline: {
      nodeState: {
        connectivity: "ONLINE",
        enforcement: "ONLINE",
        offlineElapsedMs: 0,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "ALLOW",
  },
  {
    id: "quarantined-denies-bounded-read",
    description: "QUARANTINED denies a bounded read through the D-9 gate",
    nodeEnforcement: "ONLINE",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "QUARANTINED",
        offlineElapsedMs: 0,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /QUARANTINED/,
  },
  {
    id: "quarantined-denies-via-base-recheck",
    description: "QUARANTINED node enforcement is denied by the base PEP recheck before the offline gate",
    nodeEnforcement: "QUARANTINED",
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /quarantined/,
  },
  {
    id: "read-only-allows-fresh-bounded-read",
    description: "OFFLINE_READ_ONLY allows a non-consequential read with fresh policy and revocation leases",
    nodeEnforcement: "OFFLINE_READ_ONLY",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_READ_ONLY",
        offlineElapsedMs: 2 * HOUR,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
      // offlineEnabled is not required for bounded reads in READ_ONLY mode.
      grant: { offlineEnabled: false },
    },
    actionId: "filesystem.read",
    expectDecision: "ALLOW",
  },
  {
    id: "read-only-denies-consequential-effect",
    description: "OFFLINE_READ_ONLY denies any consequential (non-read) effect",
    nodeEnforcement: "OFFLINE_READ_ONLY",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_READ_ONLY",
        offlineElapsedMs: 2 * HOUR,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "process.execute",
    expectDecision: "DENY",
    expectReason: /READ_ONLY_MODE/,
  },
  {
    id: "read-only-denies-stale-policy-lease",
    description: "OFFLINE_READ_ONLY denies a read when the policy lease is stale",
    nodeEnforcement: "OFFLINE_READ_ONLY",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_READ_ONLY",
        offlineElapsedMs: 2 * HOUR,
        policyFreshnessMs: 0,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /POLICY_LEASE_STALE/,
  },
  {
    id: "read-only-denies-stale-revocation-lease",
    description: "OFFLINE_READ_ONLY denies a read when the revocation lease is stale",
    nodeEnforcement: "OFFLINE_READ_ONLY",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_READ_ONLY",
        offlineElapsedMs: 2 * HOUR,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 0,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /REVOCATION_LEASE_STALE/,
  },
  {
    id: "read-only-denies-expired-grant",
    description: "OFFLINE_READ_ONLY denies a read when the grant has expired",
    nodeEnforcement: "OFFLINE_READ_ONLY",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_READ_ONLY",
        offlineElapsedMs: 2 * HOUR,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
      grant: { expiresAt: "2026-01-01T00:00:00.000Z" },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /GRANT_EXPIRED/,
  },
  {
    id: "restricted-denies-non-offline-enabled-grant",
    description: "OFFLINE_RESTRICTED denies grants that are not offlineEnabled",
    nodeEnforcement: "OFFLINE_RESTRICTED",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        offlineElapsedMs: 60_000,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
      grant: { offlineEnabled: false },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /OFFLINE_GRANT_DISABLED/,
  },
  {
    id: "restricted-allows-offline-enabled-read",
    description: "OFFLINE_RESTRICTED allows an offlineEnabled bounded read within its lease",
    nodeEnforcement: "OFFLINE_RESTRICTED",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        offlineElapsedMs: 60_000,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "ALLOW",
  },
  {
    id: "restricted-denies-approval-required-effect",
    description: "OFFLINE_RESTRICTED denies an unknown (approval-requiring) effect",
    nodeEnforcement: "OFFLINE_RESTRICTED",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        offlineElapsedMs: 60_000,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "process.execute",
    expectDecision: "DENY",
    expectReason: /APPROVAL_REQUIRED_OFFLINE/,
  },
  {
    id: "restricted-denies-expired-grant",
    description: "OFFLINE_RESTRICTED denies an expired offlineEnabled grant",
    nodeEnforcement: "OFFLINE_RESTRICTED",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        offlineElapsedMs: 60_000,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
      grant: { expiresAt: "2026-01-01T00:00:00.000Z" },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /GRANT_EXPIRED/,
  },
  {
    id: "restricted-denies-exhausted-offline-duration",
    description: "OFFLINE_RESTRICTED denies once the offline duration cap is exhausted",
    nodeEnforcement: "OFFLINE_RESTRICTED",
    offline: {
      nodeState: {
        connectivity: "OFFLINE",
        enforcement: "OFFLINE_RESTRICTED",
        // > DEFAULT_OFFLINE_LEASE_CONFIG.maxOfflineDurationMs (24h)
        offlineElapsedMs: 25 * HOUR,
        policyFreshnessMs: 1,
        revocationFreshnessMs: 1,
      },
    },
    actionId: "filesystem.read",
    expectDecision: "DENY",
    expectReason: /OFFLINE_DURATION_EXCEEDED/,
  },
]

const FIXTURE_BY_ID = new Map(STATE_FIXTURES.map((fixture) => [fixture.id, fixture]))
if (FIXTURE_BY_ID.size !== STATE_FIXTURES.length) {
  throw new Error("duplicate partition fixture ids")
}

function fixtureById(id: string): StateFixture {
  const fixture = FIXTURE_BY_ID.get(id)
  if (!fixture) throw new Error(`unknown partition fixture id: ${id}`)
  return fixture
}

let fixtureCount = 0
let bypassCount = 0

function runStateFixture(fixture: StateFixture, ledger: ExecutionLedger): GovernedPepResult {
  fixtureCount++
  const grant = grantFixture(fixture.actionId)
  const input: GovernedDistributedPepInput = {
    grant,
    action: actionFixture(fixture.actionId),
    nodeState: nodeState(fixture.nodeEnforcement),
    workloadIdentity: workload(),
    admissionIdentity: workload(),
    execution: {
      key: executionKey(fixture.id),
      ledger,
      now: T0,
    },
    ...(fixture.offline
      ? {
          offline: {
            nodeState: fixture.offline.nodeState,
            grant: { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z", ...fixture.offline.grant },
            ...(fixture.offline.config ? { config: fixture.offline.config } : {}),
          },
        }
      : {}),
  }
  const result = governedDistributedPep(input)
  if (result.decision !== fixture.expectDecision) {
    bypassCount++
    console.error(
      `[PARTITION BYPASS] ${fixture.id}: expected ${fixture.expectDecision}, got ${result.decision} (${result.reason})`,
    )
  }
  return result
}

describe("D-9 partition enforcement states through the governed distributed PEP", () => {
  for (const fixture of STATE_FIXTURES) {
    it(`${fixture.id}: ${fixture.description}`, () => {
      const ledger = new SqliteExecutionLedger(new Database(":memory:"))
      const result = runStateFixture(fixture, ledger)
      expect(result.decision).toBe(fixture.expectDecision)
      if (fixture.expectReason) expect(result.reason).toMatch(fixture.expectReason)
      if (fixture.expectDecision === "ALLOW") {
        expect(result).toMatchObject({ executionStatus: "CLAIMED" })
        expect(ledger.get(fixture.id)).toBeDefined()
      } else {
        // Fail closed before any exactly-once claim: denied executions must
        // never leave a ledger record.
        expect(ledger.get(fixture.id)).toBeUndefined()
      }
    })
  }

  it("OFFLINE_RESTRICTED stale-lease denials: the PEP is at least as strict as the policy oracle", () => {
    const staleNode: OfflineNodeState = {
      connectivity: "OFFLINE",
      enforcement: "OFFLINE_RESTRICTED",
      offlineElapsedMs: 10 * MINUTE,
      policyFreshnessMs: 1,
      revocationFreshnessMs: 0,
    }
    // The policy oracle denies a consequential effect on a stale revocation
    // lease with REVOCATION_LEASE_STALE...
    const oracle = evaluateOfflineRequest(
      { riskClass: "MODERATE", consequential: true, approvalRequired: false },
      { offlineEnabled: true, expiresAt: "2099-01-01T00:00:00.000Z" },
      staleNode,
      T0,
      DEFAULT_OFFLINE_LEASE_CONFIG,
    )
    expect(oracle).toMatchObject({ decision: "DENY", reason: "REVOCATION_LEASE_STALE" })
    // ...and the PEP, whose D-7 model cannot prove an unknown effect is not
    // approval-requiring, denies it even earlier (APPROVAL_REQUIRED_OFFLINE).
    // It never denies later than the oracle would.
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const result = governedDistributedPep({
      ...baseInput(),
      grant: grantFixture("process.execute"),
      action: actionFixture("process.execute"),
      nodeState: nodeState("OFFLINE_RESTRICTED"),
      offline: offlineInput({ nodeState: staleNode }),
      execution: { key: executionKey("restricted-stale-lease-oracle-pair"), ledger, now: T0 },
    })
    expect(result).toMatchObject({
      decision: "DENY",
      reason: expect.stringContaining("APPROVAL_REQUIRED_OFFLINE"),
    })
    expect(ledger.get("restricted-stale-lease-oracle-pair")).toBeUndefined()
  })

})

// ─── TTL enforcement (effective expiry honored through the PEP) ─────────────

const TTL_LEASE: OfflineLeaseConfig = {
  maxOfflineDurationMs: HOUR,
  maxConsequentialOfflineMs: HOUR,
  policyLeaseMs: HOUR,
  revocationLeaseMs: 30 * MINUTE,
  leaseGraceMs: 5 * MINUTE,
}

type TtlFixture = {
  id: string
  description: string
  enforcement: OfflineNodeState["enforcement"]
  offlineElapsedMs: number
  now: Date
  grantOverrides: Partial<OfflineCapableGrant>
  config: OfflineLeaseConfig
  expectDecision: "ALLOW" | "DENY"
  expectReason?: RegExp
  /** Policy-oracle expected effective expiry for the fixture's inputs. */
  expectEffectiveExpiry?: string
}

function ttlParts(fixture: TtlFixture): { nodeState: OfflineNodeState; grant: OfflineCapableGrant } {
  return {
    nodeState: {
      connectivity: "OFFLINE",
      enforcement: fixture.enforcement,
      offlineElapsedMs: fixture.offlineElapsedMs,
      policyFreshnessMs: 1,
      revocationFreshnessMs: 1,
    },
    grant: {
      offlineEnabled: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      ...fixture.grantOverrides,
    },
  }
}

const TTL_FIXTURES: TtlFixture[] = [
  // Effective expiry = min(grant expiry, lease end, per-grant override).
  // 1. The global lease end binds: 1h < grant (2099) and no override.
  {
    id: "ttl-lease-allowed-at-t0",
    description: "ALLOW at t0 when the global offline lease is the binding bound",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 0,
    now: T0,
    grantOverrides: {},
    config: TTL_LEASE,
    expectDecision: "ALLOW",
    expectEffectiveExpiry: new Date(T0.getTime() + HOUR).toISOString(),
  },
  {
    id: "ttl-lease-allowed-before-bound",
    description: "still ALLOW just before the lease end (59 of 60 minutes elapsed)",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 59 * MINUTE,
    now: new Date(T0.getTime() + 59 * MINUTE),
    grantOverrides: {},
    config: TTL_LEASE,
    expectDecision: "ALLOW",
  },
  {
    id: "ttl-lease-denied-after-bound",
    description: "DENY once the elapsed time crosses the lease end",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 61 * MINUTE,
    now: new Date(T0.getTime() + 61 * MINUTE),
    grantOverrides: {},
    config: TTL_LEASE,
    expectDecision: "DENY",
    expectReason: /OFFLINE_DURATION_EXCEEDED/,
  },
  // 2. The per-grant override binds: 15min < global 1h < grant (2099).
  {
    id: "ttl-override-allowed-at-t0",
    description: "per-grant override is the binding bound at t0",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 0,
    now: T0,
    grantOverrides: { offlineMaxDurationMs: 15 * MINUTE },
    config: TTL_LEASE,
    expectDecision: "ALLOW",
    expectEffectiveExpiry: new Date(T0.getTime() + 15 * MINUTE).toISOString(),
  },
  {
    id: "ttl-override-allowed-before-bound",
    description: "still ALLOW at 14 of 15 override minutes",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 14 * MINUTE,
    now: new Date(T0.getTime() + 14 * MINUTE),
    grantOverrides: { offlineMaxDurationMs: 15 * MINUTE },
    config: TTL_LEASE,
    expectDecision: "ALLOW",
  },
  {
    id: "ttl-override-denied-after-bound",
    description: "DENY once the per-grant override is crossed (16 minutes)",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 16 * MINUTE,
    now: new Date(T0.getTime() + 16 * MINUTE),
    grantOverrides: { offlineMaxDurationMs: 15 * MINUTE },
    config: TTL_LEASE,
    expectDecision: "DENY",
    expectReason: /OFFLINE_DURATION_EXCEEDED/,
  },
  // 3. The grant expiry binds: 30min < lease 1h. Enforcement honors the
  // documented 5-minute clock-skew tolerance, so the denial lands at
  // expiry − 5min (the bound is never extended, only tightened).
  {
    id: "ttl-grant-expiry-allowed-at-t0",
    description: "grant expiry is the binding bound at t0",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 0,
    now: T0,
    grantOverrides: { expiresAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() },
    config: TTL_LEASE,
    expectDecision: "ALLOW",
    expectEffectiveExpiry: new Date(T0.getTime() + 30 * MINUTE).toISOString(),
  },
  {
    id: "ttl-grant-expiry-allowed-within-skew",
    description: "still ALLOW inside the clock-skew tolerance (24 of 30 minutes)",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 24 * MINUTE,
    now: new Date(T0.getTime() + 24 * MINUTE),
    grantOverrides: { expiresAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() },
    config: TTL_LEASE,
    expectDecision: "ALLOW",
  },
  {
    id: "ttl-grant-expiry-denied-at-skew-boundary",
    description: "DENY once now exceeds grant expiry minus the 5-minute skew tolerance",
    enforcement: "OFFLINE_RESTRICTED",
    offlineElapsedMs: 26 * MINUTE,
    now: new Date(T0.getTime() + 26 * MINUTE),
    grantOverrides: { expiresAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() },
    config: TTL_LEASE,
    expectDecision: "DENY",
    expectReason: /GRANT_EXPIRED/,
  },
  // 4. The same grant-expiry bound is honored in OFFLINE_READ_ONLY.
  {
    id: "read-only-ttl-grant-expiry-allowed-at-t0",
    description: "OFFLINE_READ_ONLY honors the grant-expiry bound at t0",
    enforcement: "OFFLINE_READ_ONLY",
    offlineElapsedMs: 30 * MINUTE,
    now: T0,
    grantOverrides: { expiresAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() },
    config: TTL_LEASE,
    expectDecision: "ALLOW",
    expectEffectiveExpiry: new Date(T0.getTime() + 30 * MINUTE).toISOString(),
  },
  {
    id: "read-only-ttl-grant-expiry-denied",
    description: "OFFLINE_READ_ONLY denies once the grant-expiry bound is crossed",
    enforcement: "OFFLINE_READ_ONLY",
    offlineElapsedMs: 30 * MINUTE + 26 * MINUTE,
    now: new Date(T0.getTime() + 26 * MINUTE),
    grantOverrides: { expiresAt: new Date(T0.getTime() + 30 * MINUTE).toISOString() },
    config: TTL_LEASE,
    expectDecision: "DENY",
    expectReason: /GRANT_EXPIRED/,
  },
]

function runTtlFixture(fixture: TtlFixture, ledger: ExecutionLedger): GovernedPepResult {
  fixtureCount++
  const { nodeState: offlineNodeState, grant: offlineGrant } = ttlParts(fixture)
  const input: GovernedDistributedPepInput = {
    grant: grantFixture("filesystem.read"),
    action: actionFixture("filesystem.read"),
    nodeState: nodeState(fixture.enforcement),
    workloadIdentity: workload(),
    admissionIdentity: workload(),
    offline: {
      nodeState: offlineNodeState,
      grant: offlineGrant,
      config: fixture.config,
    },
    execution: {
      key: executionKey(fixture.id),
      ledger,
      now: fixture.now,
    },
  }
  const result = governedDistributedPep(input)
  if (result.decision !== fixture.expectDecision) {
    bypassCount++
    console.error(
      `[TTL BYPASS] ${fixture.id}: expected ${fixture.expectDecision}, got ${result.decision} (${result.reason})`,
    )
  }
  return result
}

describe("D-9 TTL enforcement through the governed distributed PEP", () => {
  for (const fixture of TTL_FIXTURES) {
    it(`${fixture.id}: ${fixture.description}`, () => {
      const ledger = new SqliteExecutionLedger(new Database(":memory:"))
      const result = runTtlFixture(fixture, ledger)
      expect(result.decision).toBe(fixture.expectDecision)
      if (fixture.expectReason) expect(result.reason).toMatch(fixture.expectReason)
      if (fixture.expectDecision === "ALLOW") {
        expect(result).toMatchObject({ executionStatus: "CLAIMED" })
      } else {
        expect(ledger.get(fixture.id)).toBeUndefined()
      }
      if (fixture.expectEffectiveExpiry) {
        const { nodeState: offlineNodeState, grant: offlineGrant } = ttlParts(fixture)
        // The policy oracle computes the effective expiry as min(grant
        // expiry, lease end, per-grant override); the PEP rows above prove
        // ALLOW holds until that boundary and DENY after it.
        expect(
          computeEffectiveOfflineExpiry(offlineGrant, offlineNodeState, fixture.now, fixture.config),
        ).toBe(fixture.expectEffectiveExpiry)
      }
    })
  }
})

// ─── Reconnection reconciliation ────────────────────────────────────────────

describe("D-9 reconnection reconciliation through the governed distributed PEP", () => {
  it("partition restricts; reconnect resumes normal decisions with no lingering offline state", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))

    const online = governedDistributedPep(
      baseInput({ execution: { key: executionKey("exec-before-partition"), ledger, now: T0 } }),
    )
    expect(online).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })

    // Partition: the node drops to OFFLINE_RESTRICTED and the D-9 gate denies
    // grants that are not offlineEnabled.
    const partitioned = governedDistributedPep({
      ...baseInput({ nodeState: nodeState("OFFLINE_RESTRICTED") }),
      offline: offlineInput({
        nodeState: {
          connectivity: "OFFLINE",
          enforcement: "OFFLINE_RESTRICTED",
          offlineElapsedMs: 60_000,
          policyFreshnessMs: 1,
          revocationFreshnessMs: 1,
        },
        grant: { offlineEnabled: false },
      }),
      execution: { key: executionKey("exec-during-partition"), ledger, now: new Date(T0.getTime() + 60_000) },
    })
    expect(partitioned).toMatchObject({ decision: "DENY", reason: expect.stringContaining("offline policy") })
    expect(ledger.get("exec-during-partition")).toBeUndefined()

    // Reconnect: enforcement returns to ONLINE and a fresh execution claims
    // normally — no lingering offline restrictions.
    const resumed = governedDistributedPep(
      baseInput({
        execution: { key: executionKey("exec-after-reconnect"), ledger, now: new Date(T0.getTime() + 120_000) },
      }),
    )
    expect(resumed).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })

    // An ONLINE snapshot passed through the offline input is equally
    // unrestricted (plain grant-expiry check, no lease gating).
    const onlineSnapshot = governedDistributedPep({
      ...baseInput(),
      offline: offlineInput({
        nodeState: {
          connectivity: "ONLINE",
          enforcement: "ONLINE",
          offlineElapsedMs: 0,
          policyFreshnessMs: 1,
          revocationFreshnessMs: 1,
        },
      }),
      execution: { key: executionKey("exec-online-snapshot"), ledger, now: new Date(T0.getTime() + 120_000) },
    })
    expect(onlineSnapshot).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })
  })

  it("an execution claimed before the partition is never re-executed after reconnect", () => {
    const ledger = new SqliteExecutionLedger(new Database(":memory:"))
    const key = executionKey("exec-pre-partition")
    const outcome = JSON.stringify({ ok: true, bytes: 42 })

    // Claim + complete the effect while ONLINE, before the partition.
    const pre = governedDistributedPep(baseInput({ execution: { key, ledger, now: T0 } }))
    expect(pre).toMatchObject({ decision: "ALLOW", executionStatus: "CLAIMED" })
    completeExecution(key.executionId, ledger, outcome, T0)

    // During the partition, the same delivery is not re-executed: the offline
    // gate allows an offlineEnabled read, then the ledger answers DUPLICATE
    // with the recorded outcome.
    const during = governedDistributedPep({
      ...baseInput({ nodeState: nodeState("OFFLINE_RESTRICTED") }),
      offline: offlineInput({
        nodeState: {
          connectivity: "OFFLINE",
          enforcement: "OFFLINE_RESTRICTED",
          offlineElapsedMs: 60_000,
          policyFreshnessMs: 1,
          revocationFreshnessMs: 1,
        },
      }),
      execution: { key, ledger, now: new Date(T0.getTime() + 60_000) },
    })
    expect(during).toMatchObject({
      decision: "DUPLICATE",
      executionStatus: "COMPLETED",
      effectOutcomeJson: outcome,
    })

    // After reconnect, the retry still answers DUPLICATE with the same outcome
    // — ledger continuity across the partition.
    const after = governedDistributedPep(
      baseInput({ execution: { key, ledger, now: new Date(T0.getTime() + 120_000) } }),
    )
    expect(after).toMatchObject({
      decision: "DUPLICATE",
      executionStatus: "COMPLETED",
      effectOutcomeJson: outcome,
    })
  })
})

describe("D-9 partition suite invariants", () => {
  it("explicit fixtures, unique ids, unknown ids fail at load time, zero bypasses", () => {
    expect(bypassCount).toBe(0)
    expect(fixtureCount).toBe(STATE_FIXTURES.length + TTL_FIXTURES.length)
    expect(new Set(STATE_FIXTURES.map((fixture) => fixture.id)).size).toBe(STATE_FIXTURES.length)
    expect(new Set(TTL_FIXTURES.map((fixture) => fixture.id)).size).toBe(TTL_FIXTURES.length)
    expect(() => fixtureById("no-such-partition-fixture")).toThrow(/unknown partition fixture/)
    console.log(
      `[D-9 partition] ${STATE_FIXTURES.length} state fixtures + ${TTL_FIXTURES.length} TTL fixtures, ${bypassCount} bypasses`,
    )
  })
})
