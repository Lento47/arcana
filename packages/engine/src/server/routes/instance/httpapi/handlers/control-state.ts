import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { SqliteProofBatchLedger } from "@arcana/core/crypto/proof-registration-sqlite"
import { SqliteEnrollmentRegistry } from "@arcana/core/crypto/node-enrollment-sqlite"

/**
 * Per-workspace co-located control-plane state: one SQLite database backing
 * both the proof-batch ledger (D-8B) and the node enrollment registry (D-1).
 */
export type ControlPlaneState = {
  ledger: SqliteProofBatchLedger
  registry: SqliteEnrollmentRegistry
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
    }
    stateCache.set(directory, state)
  }
  return state
}
