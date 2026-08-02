import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { Database } from "../database/database"
import {
  CapabilityGrantStoreError,
  type MutableIntentBindingStoreEffect,
} from "./grant-store"
import type {
  IntentBinding,
  IntentBindingCreatedBy,
  IntentBindingStatus,
  IntentJustification,
} from "./types"

interface IntentBindingRow {
  id: string
  request_hash: string
  session_id: string
  user_request_event_id: string
  contract_id: string | null
  contract_revision: string | null
  criterion_ids: string
  justification: string
  created_by: string
  status: string
  created_at: string
  expires_at: string | null
}

function decodeRow(row: IntentBindingRow) {
  return Effect.try({
    try: (): IntentBinding => ({
      id: row.id,
      requestHash: row.request_hash,
      sessionId: row.session_id,
      userRequestEventId: row.user_request_event_id,
      contractId: row.contract_id ?? undefined,
      contractRevision: row.contract_revision ?? undefined,
      criterionIds: JSON.parse(row.criterion_ids) as string[],
      justification: row.justification as IntentJustification,
      createdBy: row.created_by as IntentBindingCreatedBy,
      status: row.status as IntentBindingStatus,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
    }),
    catch: CapabilityGrantStoreError,
  })
}

/** SQLite-backed production intent store. Bindings are insert-only; revocation is explicit. */
export class SqliteIntentBindingStore implements MutableIntentBindingStoreEffect {
  constructor(private db: Database.Interface) {}

  getActiveBindingsForSession(sessionId: string) {
    return Effect.gen({ self: this }, function* () {
      const rows = yield* this.db.db
        .all<IntentBindingRow>(
          sql`SELECT b.* FROM intent_bindings b
              LEFT JOIN contracts c ON c.id = b.contract_id
              WHERE b.session_id = ${sessionId}
                AND b.status = 'ACTIVE'
                AND (
                  b.contract_id IS NULL
                  OR (
                    c.status = 'active'
                    AND CAST(c.revision AS TEXT) = b.contract_revision
                  )
                )
              ORDER BY b.created_at ASC, b.id ASC`,
        )
        .pipe(Effect.mapError(CapabilityGrantStoreError))
      return yield* Effect.forEach(rows, decodeRow)
    })
  }

  getActiveBindingsForRequest(sessionId: string, requestHash: string) {
    return Effect.gen({ self: this }, function* () {
      const rows = yield* this.db.db
        .all<IntentBindingRow>(
          sql`SELECT b.* FROM intent_bindings b
              LEFT JOIN contracts c ON c.id = b.contract_id
              WHERE b.session_id = ${sessionId}
                AND b.request_hash = ${requestHash}
                AND b.status = 'ACTIVE'
                AND (
                  b.contract_id IS NULL
                  OR (
                    c.status = 'active'
                    AND CAST(c.revision AS TEXT) = b.contract_revision
                  )
                )
              ORDER BY b.created_at ASC, b.id ASC`,
        )
        .pipe(Effect.mapError(CapabilityGrantStoreError))
      return yield* Effect.forEach(rows, decodeRow)
    })
  }

  putBinding(binding: IntentBinding) {
    return this.db.db
      .run(sql`INSERT INTO intent_bindings (
        id, request_hash, session_id, user_request_event_id,
        contract_id, contract_revision, criterion_ids, justification,
        created_by, status, created_at, expires_at
      ) VALUES (
        ${binding.id}, ${binding.requestHash}, ${binding.sessionId}, ${binding.userRequestEventId},
        ${binding.contractId ?? null}, ${binding.contractRevision ?? null}, ${JSON.stringify(binding.criterionIds)}, ${binding.justification},
        ${binding.createdBy}, ${binding.status}, ${binding.createdAt}, ${binding.expiresAt ?? null}
      )`).pipe(
        Effect.asVoid,
        Effect.mapError(CapabilityGrantStoreError),
      )
  }

  revokeBinding(bindingId: string) {
    return Effect.gen({ self: this }, function* () {
      const existing = yield* this.db.db
        .get<{ id: string }>(
          sql`SELECT id FROM intent_bindings WHERE id = ${bindingId} AND status = 'ACTIVE'`,
        )
        .pipe(Effect.mapError(CapabilityGrantStoreError))
      if (!existing) return false
      yield* this.db.db
        .run(sql`UPDATE intent_bindings SET status = 'REVOKED' WHERE id = ${bindingId} AND status = 'ACTIVE'`)
        .pipe(Effect.mapError(CapabilityGrantStoreError))
      return true
    })
  }
}

export * as IntentBindingStoreSqlite from "./intent-binding-store-sqlite"
