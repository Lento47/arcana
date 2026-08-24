// packages/core/src/capability/effect-claim.ts
//
// Authority Kernel K4 — Durable Effect Claims (P4: no silent disappearance).
// Storage: direct bun:sqlite against a kernel-owned file. Synchronous by
// design: claim writes are durable-before-dispatch (Output-Gate Principle)
// and restart-safe across store instances.
//
// Lifecycle:
//   CLAIMED ─> CANCELLED | FAILED (proven no effect) | DISPATCHED
//   DISPATCHED ─> SETTLED | AMBIGUOUS
//   FAILED ⇒ ProvenNoEffect · AMBIGUOUS ⇒ EffectTruthUnknown (never auto-retried)

import { Database as BunSqlite } from "bun:sqlite"
import { createHash } from "node:crypto"

export const EFFECT_CLAIM_DOMAIN = "arcana-effect-v1"

export type ClaimState =
  | "CLAIMED"
  | "CANCELLED"
  | "FAILED"
  | "DISPATCHED"
  | "SETTLED"
  | "AMBIGUOUS"

const TRANSITIONS: Record<ClaimState, ClaimState[]> = {
  CLAIMED: ["CANCELLED", "FAILED", "DISPATCHED"],
  // FAILED after DISPATCHED = downstream DEFINITIVELY rejected/errored
  // without executing (e.g., definitive HTTP status). Proven-no-effect.
  DISPATCHED: ["SETTLED", "AMBIGUOUS", "FAILED"],
  CANCELLED: [],
  FAILED: [],
  SETTLED: [],
  // Reconciliation may prove either outcome from AMBIGUOUS.
  AMBIGUOUS: ["SETTLED", "FAILED"],
}

export function canTransition(from: ClaimState, to: ClaimState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function deriveIdempotencyKey(effectId: string, requestHash: string): string {
  return createHash("sha256")
    .update(EFFECT_CLAIM_DOMAIN)
    .update(effectId)
    .update(requestHash)
    .digest("hex")
}

export function makeEffectId(): string {
  return `eff-${crypto.randomUUID()}`
}
const crypto = globalThis.crypto

export interface EffectClaimRecord {
  effectId: string
  idempotencyKey: string
  requestHash: string
  toolName: string
  destination: string | null
  principalId: string
  sessionId: string
  state: ClaimState
  receipt: string | null
  createdAt: number
  updatedAt: number
}

interface ClaimRow {
  effect_id: string
  idempotency_key: string
  request_hash: string
  tool_name: string
  destination: string | null
  principal_id: string
  session_id: string
  state: string
  receipt: string | null
  created_at: number
  updated_at: number
}

function rowToRecord(r: ClaimRow): EffectClaimRecord {
  return {
    effectId: r.effect_id,
    idempotencyKey: r.idempotency_key,
    requestHash: r.request_hash,
    toolName: r.tool_name,
    destination: r.destination,
    principalId: r.principal_id,
    sessionId: r.session_id,
    state: r.state as ClaimState,
    receipt: r.receipt,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS effect_claims (
  effect_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  destination TEXT,
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  state TEXT NOT NULL,
  receipt TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`

/**
 * Durable claim store over a kernel-owned SQLite file.
 * Accepts a path (opens its own connection) or an existing bun:sqlite handle.
 */
export class SqliteEffectClaimStore {
  private raw: InstanceType<typeof BunSqlite>

  constructor(target: string | InstanceType<typeof BunSqlite>) {
    this.raw = typeof target === "string" ? new BunSqlite(target) : target
    this.raw.exec(SCHEMA)
  }

  insertClaim(record: EffectClaimRecord): void {
    this.raw.prepare(`
      INSERT INTO effect_claims (
        effect_id, idempotency_key, request_hash, tool_name, destination,
        principal_id, session_id, state, receipt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.effectId, record.idempotencyKey, record.requestHash, record.toolName,
      record.destination, record.principalId, record.sessionId, record.state,
      record.receipt, record.createdAt, record.updatedAt,
    )
  }

  getClaim(effectId: string): EffectClaimRecord | null {
    const row = this.raw.prepare(`SELECT * FROM effect_claims WHERE effect_id = ? LIMIT 1`).get(effectId) as
      | ClaimRow
      | undefined
    return row ? rowToRecord(row) : null
  }

  getClaimByIdempotencyKey(key: string): EffectClaimRecord | null {
    const row = this.raw.prepare(`SELECT * FROM effect_claims WHERE idempotency_key = ? LIMIT 1`).get(key) as
      | ClaimRow
      | undefined
    return row ? rowToRecord(row) : null
  }

  transition(effectId: string, to: ClaimState, patch?: { receipt?: string }): void {
    const current = this.getClaim(effectId)
    if (!current) throw new Error(`claim not found: ${effectId}`)
    if (!canTransition(current.state, to)) {
      throw new Error(`illegal transition ${current.state} -> ${to} for ${effectId}`)
    }
    this.raw.prepare(`
      UPDATE effect_claims
      SET state = ?, receipt = COALESCE(?, receipt), updated_at = ?
      WHERE effect_id = ?
    `).run(to, patch?.receipt ?? null, Date.now(), effectId)
  }

  listUnresolved(): EffectClaimRecord[] {
    const rows = this.raw
      .prepare(`SELECT * FROM effect_claims WHERE state = 'AMBIGUOUS' ORDER BY updated_at ASC`)
      .all() as unknown as ClaimRow[]
    return rows.map(rowToRecord)
  }

  amendClaim(effectId: string, note: string, to?: ClaimState): void {
    const current = this.getClaim(effectId)
    if (!current) throw new Error(`claim not found: ${effectId}`)
    if (to && !canTransition(current.state, to)) {
      throw new Error(`illegal amendment transition ${current.state} -> ${to}`)
    }
    this.raw.prepare(`
      UPDATE effect_claims
      SET receipt = COALESCE(receipt, '') || ?, state = COALESCE(?, state), updated_at = ?
      WHERE effect_id = ?
    `).run(`\n[amend] ${note}`, to ?? null, Date.now(), effectId)
  }

  /** Release the file handle (Windows lock hygiene in tests). */
  close(): void {
    this.raw.close()
  }
}
