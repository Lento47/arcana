/**
 * D-6B-T/D-4: node-side durable sync state.
 *
 * Persists the node's accepted policy/revocation state so `arcana node sync`
 * resumes from the last accepted artifact, applies SNAPSHOT/DELTA responses
 * durably, and is idempotent across retries. Applying a delta requires the
 * persisted base to be exactly one step behind the carried target.
 */

import { Database } from "bun:sqlite"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"

export type SyncStateKind = "policy" | "revocation"

export type NodeSyncState = {
  kind: SyncStateKind
  sequence: number
  digest: string
  payloadJson: string
  updatedAt: string
}

export interface SyncStateStore {
  get(kind: SyncStateKind): NodeSyncState | undefined
  put(state: NodeSyncState): void
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS node_sync_state (
  kind TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

export class SqliteSyncStateStore implements SyncStateStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  get(kind: SyncStateKind): NodeSyncState | undefined {
    const row = this.db
      .query(`SELECT * FROM node_sync_state WHERE kind = $kind`)
      .get({ $kind: kind }) as
      | {
          sequence: number
          digest: string
          payload_json: string
          updated_at: string
        }
      | null
    return row
      ? {
          kind,
          sequence: row.sequence,
          digest: row.digest,
          payloadJson: row.payload_json,
          updatedAt: row.updated_at,
        }
      : undefined
  }

  put(state: NodeSyncState): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO node_sync_state (
          kind, sequence, digest, payload_json, updated_at
        ) VALUES ($kind, $sequence, $digest, $payloadJson, $updatedAt)`,
      )
      .run({
        $kind: state.kind,
        $sequence: state.sequence,
        $digest: state.digest,
        $payloadJson: state.payloadJson,
        $updatedAt: state.updatedAt,
      })
  }
}

export type SyncApplyResult = {
  applied: "SNAPSHOT" | "DELTA" | "IDEMPOTENT" | "NO_CHANGE"
  sequence: number
  digest: string
}

export function applyPolicySyncResponse(
  context: SyncResponseContext,
  store: SyncStateStore,
  now: Date = new Date(),
): SyncApplyResult {
  const current = store.get("policy")
  switch (context.responseKind) {
    case "NO_CHANGE":
      return {
        applied: "NO_CHANGE",
        sequence: current?.sequence ?? 0,
        digest: current?.digest ?? "",
      }
    case "POLICY_SNAPSHOT": {
      const sequence = context.policySequence ?? 0
      const digest = context.policyDigest ?? ""
      const payloadJson = JSON.stringify(context.envelope ?? {})
      store.put({ kind: "policy", sequence, digest, payloadJson, updatedAt: now.toISOString() })
      return { applied: "SNAPSHOT", sequence, digest }
    }
    case "POLICY_DELTA": {
      const sequence = context.policySequence ?? 0
      const digest = context.policyDigest ?? ""
      if (current && current.sequence >= sequence) {
        return { applied: "IDEMPOTENT", sequence: current.sequence, digest: current.digest }
      }
      if (current && current.sequence !== sequence - 1) {
        throw new Error(
          `policy delta base mismatch: persisted ${current.sequence}, target ${sequence}`,
        )
      }
      const payloadJson = JSON.stringify(context.envelope ?? {})
      store.put({ kind: "policy", sequence, digest, payloadJson, updatedAt: now.toISOString() })
      return { applied: "DELTA", sequence, digest }
    }
    default:
      throw new Error(`unsupported policy sync response kind: ${context.responseKind}`)
  }
}

export function applyRevocationSyncResponse(
  context: SyncResponseContext,
  store: SyncStateStore,
  now: Date = new Date(),
): SyncApplyResult {
  const current = store.get("revocation")
  switch (context.responseKind) {
    case "NO_CHANGE":
      return {
        applied: "NO_CHANGE",
        sequence: current?.sequence ?? 0,
        digest: current?.digest ?? "",
      }
    case "REVOCATION_SNAPSHOT": {
      const sequence = context.revocationSequence ?? 0
      const digest = context.revocationDigest ?? ""
      const payloadJson = JSON.stringify(context.envelope ?? {})
      store.put({ kind: "revocation", sequence, digest, payloadJson, updatedAt: now.toISOString() })
      return { applied: "SNAPSHOT", sequence, digest }
    }
    case "REVOCATION_DELTA": {
      const sequence = context.revocationSequence ?? 0
      const digest = context.revocationDigest ?? ""
      if (current && current.sequence >= sequence) {
        return { applied: "IDEMPOTENT", sequence: current.sequence, digest: current.digest }
      }
      const envelopes = context.envelopes ?? []
      const firstSequence = (envelopes[0] as { sequence?: unknown } | undefined)?.sequence
      if (typeof firstSequence !== "number") {
        throw new Error("revocation delta carries no statements")
      }
      if (current && current.sequence !== firstSequence - 1) {
        throw new Error(
          `revocation delta base mismatch: persisted ${current.sequence}, first statement ${firstSequence}`,
        )
      }
      const payloadJson = JSON.stringify(envelopes)
      store.put({ kind: "revocation", sequence, digest, payloadJson, updatedAt: now.toISOString() })
      return { applied: "DELTA", sequence, digest }
    }
    default:
      throw new Error(`unsupported revocation sync response kind: ${context.responseKind}`)
  }
}
