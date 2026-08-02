import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { decodeCanonicalBase64url } from "@arcana/core/crypto/canonical-serializer"
import { SqliteProofBatchLedger } from "@arcana/core/crypto/proof-registration-sqlite"
import { SqliteEnrollmentRegistry } from "@arcana/core/crypto/node-enrollment-sqlite"
import { SqliteSyncReplayStore } from "@arcana/core/crypto/sync-replay-store-sqlite"
import { SqlitePolicyBundleStore } from "@arcana/core/crypto/policy-bundle-store-sqlite"
import { SqliteExecutionLedger } from "@arcana/core/crypto/execution-ledger-sqlite"
import { SqliteRevocationStore } from "@arcana/core/crypto/revocation-store-sqlite"
import { SqliteTenantStore } from "@arcana/core/enterprise/tenant-sqlite"
import { SqliteIdentityStore } from "@arcana/core/enterprise/identity-sqlite"
import { SqliteFleetStore } from "@arcana/core/enterprise/fleet-sqlite"
import { SqliteCentralApprovalStore } from "@arcana/core/enterprise/approvals-sqlite"
import { SqliteAuditArchiveStore } from "@arcana/core/enterprise/audit-archive-sqlite"
import { SqliteSecurityOpsStore } from "@arcana/core/enterprise/security-ops-sqlite"
import { SqliteReliabilityStore } from "@arcana/core/enterprise/reliability-sqlite"
import { SqliteFederationStore } from "@arcana/core/enterprise/federation-sqlite"
import { SqliteEscalationStore } from "@arcana/core/enterprise/escalation-sqlite"
import { SqliteMeteringStore } from "@arcana/core/enterprise/metering-sqlite"
import { SqliteAdminEventStore } from "@arcana/core/enterprise/admin-events-sqlite"
import { SqliteCrossOrgApprovalStore } from "@arcana/core/enterprise/federation-approvals-sqlite"
import { SqliteUpgradeRingStore } from "@arcana/core/enterprise/upgrade-rings-sqlite"
import { SqliteFederationTransportStore } from "@arcana/core/enterprise/federation-transport-sqlite"
import { SqliteWebhookStore } from "@arcana/core/enterprise/webhooks-sqlite"
import type { EnrollmentContext } from "@arcana/core/crypto/node-enrollment"

/**
 * Per-workspace co-located control-plane state: one SQLite database backing
 * both the proof-batch ledger (D-8B) and the node enrollment registry (D-1).
 */
export type ControlPlaneState = {
  ledger: SqliteProofBatchLedger
  registry: SqliteEnrollmentRegistry
  replayStore: SqliteSyncReplayStore
  policyStore: SqlitePolicyBundleStore
  executionLedger: SqliteExecutionLedger
  revocationStore: SqliteRevocationStore
  tenants: SqliteTenantStore
  identity: SqliteIdentityStore
  fleet: SqliteFleetStore
  approvals: SqliteCentralApprovalStore
  auditArchive: SqliteAuditArchiveStore
  securityOps: SqliteSecurityOpsStore
  reliability: SqliteReliabilityStore
  federation: SqliteFederationStore
  escalations: SqliteEscalationStore
  metering: SqliteMeteringStore
  adminEvents: SqliteAdminEventStore
  crossOrgApprovals: SqliteCrossOrgApprovalStore
  upgradeRings: SqliteUpgradeRingStore
  federationTransport: SqliteFederationTransportStore
  webhooks: SqliteWebhookStore
}

const stateCache = new Map<string, ControlPlaneState>()
const targetPolicyCache = new Map<string, SqlitePolicyBundleStore>()

export function controlStateFor(directory: string): ControlPlaneState {
  let state = stateCache.get(directory)
  if (!state) {
    const stateDir = join(directory, ".arcana")
    mkdirSync(stateDir, { recursive: true })
    const db = new Database(join(stateDir, "control-plane.db"))
    state = {
      ledger: new SqliteProofBatchLedger(db),
      registry: new SqliteEnrollmentRegistry(db),
      replayStore: new SqliteSyncReplayStore(db),
      policyStore: new SqlitePolicyBundleStore(db),
      executionLedger: new SqliteExecutionLedger(db),
      revocationStore: new SqliteRevocationStore(db),
      tenants: new SqliteTenantStore(db),
      identity: new SqliteIdentityStore(db),
      fleet: new SqliteFleetStore(db),
      approvals: new SqliteCentralApprovalStore(db),
      auditArchive: new SqliteAuditArchiveStore(db),
      securityOps: new SqliteSecurityOpsStore(db),
      reliability: new SqliteReliabilityStore(db),
      federation: new SqliteFederationStore(db),
      escalations: new SqliteEscalationStore(db),
      metering: new SqliteMeteringStore(db),
      adminEvents: new SqliteAdminEventStore(db),
      crossOrgApprovals: new SqliteCrossOrgApprovalStore(db),
      upgradeRings: new SqliteUpgradeRingStore(db),
      federationTransport: new SqliteFederationTransportStore(db),
      webhooks: new SqliteWebhookStore(db),
    }
    stateCache.set(directory, state)
  }
  return state
}

/**
 * Per-environment policy target store for F3 promotion. Each environment
 * gets its own SQLite database so promotion re-validates the signed bundle
 * and chain continuity against an independent target chain.
 */
export function policyTargetStoreFor(
  directory: string,
  environment: string,
): SqlitePolicyBundleStore {
  const key = `${directory}|${environment}`
  let store = targetPolicyCache.get(key)
  if (!store) {
    const stateDir = join(directory, ".arcana")
    mkdirSync(stateDir, { recursive: true })
    const safeEnv = environment.replace(/[^a-zA-Z0-9_-]/g, "_")
    store = new SqlitePolicyBundleStore(new Database(join(stateDir, `policy-target-${safeEnv}.db`)))
    targetPolicyCache.set(key, store)
  }
  return store
}

/**
 * Issuer configuration from the environment (shared by enrollment and sync
 * response signing). Missing material fails closed.
 */
export function issuerContext(): { ok: true; context: EnrollmentContext } | { ok: false; reason: string } {
  const seedB64 = process.env.ARCANA_CONTROL_ISSUER_SEED
  if (!seedB64) {
    return { ok: false, reason: "ARCANA_CONTROL_ISSUER_SEED is not configured" }
  }
  const decoded = decodeCanonicalBase64url(seedB64)
  if (!decoded || (decoded.length !== 32 && decoded.length !== 64)) {
    return { ok: false, reason: "ARCANA_CONTROL_ISSUER_SEED must be a 32-byte seed (base64url)" }
  }
  const seed = decoded.length === 32 ? decoded : decoded.slice(0, 32)
  const keys = ed25519.keygen(seed)
  const issuerId = process.env.ARCANA_CONTROL_ISSUER_ID ?? "issuer-arcana"
  return {
    ok: true,
    context: {
      issuerId,
      issuerSecretKey: keys.secretKey,
      issuerPublicKeys: new Map([[issuerId, keys.publicKey]]),
      certificateDurationMs: Number(
        process.env.ARCANA_CONTROL_CERT_DURATION_MS ?? 365 * 24 * 60 * 60 * 1000,
      ),
    },
  }
}
