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
}

const stateCache = new Map<string, ControlPlaneState>()

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
    }
    stateCache.set(directory, state)
  }
  return state
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
