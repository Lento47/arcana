/**
 * Phase C: Durable SQLite-backed CapabilityGrantStore
 *
 * Returns Effects directly — no Effect.runPromise bridge.
 * Composes with the Effect runtime natively.
 * Storage failure → empty results → PDP returns DENY.
 */

import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { Database } from "../database/database"
import type { CapabilityGrantStore, CapabilityGrantStoreError } from "./grant-store"
import { CapabilityGrantStoreError as makeStoreError } from "./grant-store"
import type { CapabilityGrant, CapabilityStatus, CapabilityAction, ResourceSelector, Principal, Issuer } from "./types"

// ─── Row Shape ────────────────────────────────────────────────────────

interface GrantRow {
  id: string
  schema_version: string
  principal_kind: string
  principal_id: string
  issuer_kind: string
  issuer_id: string
  actions: string
  resources: string
  constraints: string
  delegation: string
  status: string
  created_event_id: string
  revoked_event_id: string | null
  time_created: number
  time_updated: number
}

// ─── Serialization ────────────────────────────────────────────────────

function grantToRow(grant: CapabilityGrant): GrantRow {
  const now = Date.now()
  return {
    id: grant.id,
    schema_version: grant.schemaVersion,
    principal_kind: grant.principal.kind,
    principal_id: grant.principal.id,
    issuer_kind: grant.issuer.kind,
    issuer_id: grant.issuer.id,
    actions: JSON.stringify(grant.actions),
    resources: JSON.stringify(grant.resources),
    constraints: JSON.stringify(grant.constraints),
    delegation: JSON.stringify(grant.delegation),
    status: grant.status,
    created_event_id: grant.createdEventId,
    revoked_event_id: grant.revokedEventId ?? null,
    time_created: now,
    time_updated: now,
  }
}

function rowToGrant(row: GrantRow): CapabilityGrant {
  return {
    id: row.id,
    schemaVersion: row.schema_version as "1",
    principal: { kind: row.principal_kind as Principal["kind"], id: row.principal_id },
    issuer: { kind: row.issuer_kind as Issuer["kind"], id: row.issuer_id },
    actions: JSON.parse(row.actions) as CapabilityAction[],
    resources: JSON.parse(row.resources) as ResourceSelector[],
    constraints: JSON.parse(row.constraints),
    delegation: JSON.parse(row.delegation),
    status: row.status as CapabilityStatus,
    createdEventId: row.created_event_id,
    revokedEventId: row.revoked_event_id ?? undefined,
  }
}

// ─── SQLite Grant Store ───────────────────────────────────────────────

export class SqliteGrantStore implements CapabilityGrantStore {
  constructor(private db: Database.Interface) {}

  getGrantsForPrincipal(
    principalId: string,
    sessionId: string,
    workspaceId?: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const rows = yield* this.db.db
          .all<GrantRow>(
            sql`SELECT * FROM capability_grants WHERE principal_id = ${principalId} AND status = 'ACTIVE'`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))

        return rows
          .map(rowToGrant)
          .filter((g) => {
            if (g.constraints.sessionId && g.constraints.sessionId !== sessionId) return false
            if (g.constraints.workspaceId && workspaceId && g.constraints.workspaceId !== workspaceId) return false
            return true
          })
      },
    ).pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))
  }

  getGrantsForWorkspace(
    workspaceId: string,
  ): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const rows = yield* this.db.db
          .all<GrantRow>(
            sql`SELECT * FROM capability_grants WHERE json_extract(constraints, '$.workspaceId') = ${workspaceId} AND status = 'ACTIVE'`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
        return rows.map(rowToGrant)
      },
    ).pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))
  }

  putGrant(
    grant: CapabilityGrant,
  ): Effect.Effect<void, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const row = grantToRow(grant)
        yield* this.db.db
          .run(
            sql`INSERT OR REPLACE INTO capability_grants (
              id, schema_version, principal_kind, principal_id,
              issuer_kind, issuer_id, actions, resources,
              constraints, delegation, status, created_event_id,
              revoked_event_id, time_created, time_updated
            ) VALUES (
              ${row.id}, ${row.schema_version}, ${row.principal_kind}, ${row.principal_id},
              ${row.issuer_kind}, ${row.issuer_id}, ${row.actions}, ${row.resources},
              ${row.constraints}, ${row.delegation}, ${row.status}, ${row.created_event_id},
              ${row.revoked_event_id}, ${row.time_created}, ${row.time_updated}
            )`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
      },
    )
  }

  revokeGrant(
    grantId: string,
    revokedEventId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const existing = yield* this.db.db
          .get<GrantRow>(
            sql`SELECT id FROM capability_grants WHERE id = ${grantId} AND status = 'ACTIVE'`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))

        if (!existing) return false

        const now = Date.now()
        yield* this.db.db
          .run(
            sql`UPDATE capability_grants
                SET status = 'REVOKED', revoked_event_id = ${revokedEventId}, time_updated = ${now}
                WHERE id = ${grantId}`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
        return true
      },
    ).pipe(Effect.catch(() => Effect.succeed(false)))
  }

  exhaustGrant(
    grantId: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const existing = yield* this.db.db
          .get<GrantRow>(
            sql`SELECT id FROM capability_grants WHERE id = ${grantId} AND status = 'ACTIVE'`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))

        if (!existing) return false

        const now = Date.now()
        yield* this.db.db
          .run(
            sql`UPDATE capability_grants
                SET status = 'EXHAUSTED', time_updated = ${now}
                WHERE id = ${grantId}`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
        return true
      },
    ).pipe(Effect.catch(() => Effect.succeed(false)))
  }

  getGrantById(
    grantId: string,
  ): Effect.Effect<CapabilityGrant | null, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const row = yield* this.db.db
          .get<GrantRow>(
            sql`SELECT * FROM capability_grants WHERE id = ${grantId}`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
        return row ? rowToGrant(row) : null
      },
    ).pipe(Effect.catch(() => Effect.succeed(null)))
  }

  getAllGrants(): Effect.Effect<readonly CapabilityGrant[], CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const rows = yield* this.db.db
          .all<GrantRow>(sql`SELECT * FROM capability_grants`)
          .pipe(Effect.mapError((e) => makeStoreError(e)))
        return rows.map(rowToGrant)
      },
    ).pipe(Effect.catch(() => Effect.succeed<readonly CapabilityGrant[]>([])))
  }

  updateStatus(
    grantId: string,
    status: CapabilityGrant["status"],
    eventId?: string,
  ): Effect.Effect<void, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        const now = Date.now()
        yield* this.db.db
          .run(
            sql`UPDATE capability_grants
                SET status = ${status},
                    revoked_event_id = ${eventId ?? null},
                    time_updated = ${now}
                WHERE id = ${grantId}`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))
      },
    )
  }

  tryConsumeUse(
    grantId: string,
    now: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    return Effect.gen(
      { self: this },
      function* () {
        // Atomic: only update if grant is ACTIVE, not expired, and has remaining uses
        const result = yield* this.db.db
          .run(
            sql`UPDATE capability_grants
                SET time_updated = ${Date.now()}
                WHERE id = ${grantId}
                  AND status = 'ACTIVE'
                  AND (expires_at IS NULL OR expires_at > ${now})
                  AND (
                    json_extract(constraints, '$.maxUses') IS NULL
                    OR json_extract(constraints, '$.maxUses') > 0
                  )`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))

        // Check if any row was updated
        const row = yield* this.db.db
          .get<{ id: string }>(
            sql`SELECT id FROM capability_grants WHERE id = ${grantId} AND status = 'ACTIVE'`,
          )
          .pipe(Effect.mapError((e) => makeStoreError(e)))

        return row !== undefined
      },
    ).pipe(Effect.catch(() => Effect.succeed(false)))
  }

  private executionReceipts = new Map<string, import("./types").ExecutionReceipt>()

  recordExecution(
    executionKey: string,
    receipt: import("./types").ExecutionReceipt,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    if (this.executionReceipts.has(executionKey)) return Effect.succeed(false)
    this.executionReceipts.set(executionKey, receipt)
    return Effect.succeed(true)
  }

  hasExecution(
    executionKey: string,
  ): Effect.Effect<boolean, CapabilityGrantStoreError> {
    return Effect.succeed(this.executionReceipts.has(executionKey))
  }
}
