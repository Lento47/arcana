import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { createIntentBinding } from "@arcana/core/capability/intent-binding"
import { SqliteIntentBindingStore } from "@arcana/core/capability/intent-binding-store-sqlite"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import {
  recordCompatibilityMode,
  recordRequiredMode,
  resolveIntentAuthority,
} from "@arcana/engine/session/intent-runtime"

const sessionId = "session-intent-persistence"
const contractId = "contract-intent-persistence"
const criterionId = "criterion-intent-persistence"

const request = buildAuthorizationRequest({
  toolName: "terminal",
  principalId: "agent:main",
  sessionId,
  args: { command: "bun test" },
  executable: "bun",
  arguments: ["test"],
  provenance: ["USER_INSTRUCTION", "ACTIVE_CONTRACT"],
  contractId,
  contractRevision: "1",
  criterionIds: [criterionId],
})

const binding = createIntentBinding({
  requestHash: computeRequestHash(request),
  sessionId,
  userRequestEventId: "event-user-request",
  contractId,
  contractRevision: "1",
  criterionIds: [criterionId],
  justification: "NECESSARY_SUBSTEP",
  createdBy: "RUNTIME",
})

describe("intent binding store file-backed persistence", () => {
  test("ACTIVE binding survives a database reopen and revokes after restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-intent-persistence-"))
    const dbPath = join(dir, "arcana.db")
    try {
      // First "process": seed the active contract and persist the binding.
      await Effect.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          yield* database.db.insert(ContractTable).values({
            id: contractId,
            session_id: sessionId,
            objective: "Exercise durable intent binding persistence",
            risk_class: "modify",
            source_event_id: "event-user-request",
            revision: 1,
            status: "active",
            created_at: "2026-08-01T00:00:00.000Z",
          })
          yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
            id: criterionId,
            contract_id: contractId,
            description: "The exact request remains bound after restart",
            required: 1,
            verification: "execution",
          })
          const store = new SqliteIntentBindingStore(database)
          yield* store.putBinding(binding)
          const active = yield* store.getActiveBindingsForRequest(sessionId, binding.requestHash)
          expect(active).toHaveLength(1)
        }).pipe(Effect.provide(Database.layerFromPath(dbPath))),
      )

      // "Restart": open a brand-new Database layer from the same file. The
      // migration re-runs idempotently and the ACTIVE binding must still be
      // readable, then explicitly revocable.
      await Effect.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const store = new SqliteIntentBindingStore(database)
          const active = yield* store.getActiveBindingsForRequest(sessionId, binding.requestHash)
          expect(active).toHaveLength(1)
          expect(active[0]!.status).toBe("ACTIVE")
          expect(active[0]!.contractRevision).toBe("1")
          expect(active[0]!.createdBy).toBe("RUNTIME")

          const revoked = yield* store.revokeBinding(binding.id)
          expect(revoked).toBe(true)
          expect(yield* store.getActiveBindingsForRequest(sessionId, binding.requestHash)).toHaveLength(0)
          // A second revoke observes the durable REVOKED state.
          expect(yield* store.revokeBinding(binding.id)).toBe(false)
        }).pipe(Effect.provide(Database.layerFromPath(dbPath))),
      )
    } finally {
      // SQLite connections may still hold the file open on Windows; cleanup is
      // best-effort so a locked handle does not fail the restart assertion.
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  test("mode events are idempotent across a file-backed restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-intent-mode-persistence-"))
    const dbPath = join(dir, "arcana.db")
    const layers = () => {
      const dbLayer = Database.layerFromPath(dbPath)
      const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
      return Layer.mergeAll(dbLayer, eventStoreLayer)
    }
    try {
      // First "process": record compatibility mode once.
      await Effect.runPromise(
        Effect.gen(function* () {
          const eventStore = yield* EventStore.Service
          yield* recordCompatibilityMode(sessionId, eventStore)
          yield* recordCompatibilityMode(sessionId, eventStore)
          expect(
            yield* eventStore.listType(sessionId, "intent.compatibility_mode"),
          ).toHaveLength(1)
        }).pipe(Effect.provide(layers())),
      )

      // "Restart": the durable event suppresses a second marker.
      await Effect.runPromise(
        Effect.gen(function* () {
          const eventStore = yield* EventStore.Service
          yield* recordCompatibilityMode(sessionId, eventStore)
          expect(
            yield* eventStore.listType(sessionId, "intent.compatibility_mode"),
          ).toHaveLength(1)
        }).pipe(Effect.provide(layers())),
      )
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  test("enforcement_required is idempotent per contract revision across restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-intent-required-persistence-"))
    const dbPath = join(dir, "arcana.db")
    const layers = () => {
      const dbLayer = Database.layerFromPath(dbPath)
      const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
      return Layer.mergeAll(dbLayer, eventStoreLayer)
    }
    try {
      // First "process": seed revision 1 and record REQUIRED mode.
      await Effect.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          yield* database.db.insert(ContractTable).values({
            id: contractId,
            session_id: sessionId,
            objective: "Exercise per-revision REQUIRED mode idempotency",
            risk_class: "modify",
            source_event_id: "event-user-request",
            revision: 1,
            status: "active",
            created_at: "2026-08-01T00:00:00.000Z",
          })
          yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
            id: criterionId,
            contract_id: contractId,
            description: "Revision-bound REQUIRED mode",
            required: 1,
            verification: "execution",
          })
          const eventStore = yield* EventStore.Service
          const authority = yield* resolveIntentAuthority(database, sessionId)
          if (authority.mode !== "REQUIRED") throw new Error("expected required authority")
          yield* recordRequiredMode(sessionId, authority, eventStore)
          yield* recordRequiredMode(sessionId, authority, eventStore)
          expect(
            yield* eventStore.listType(sessionId, "intent.enforcement_required"),
          ).toHaveLength(1)
        }).pipe(Effect.provide(layers())),
      )

      // "Restart": the same revision stays suppressed, and a new revision gets
      // its own durable enforcement_required event.
      await Effect.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const eventStore = yield* EventStore.Service
          const authorityV1 = yield* resolveIntentAuthority(database, sessionId)
          if (authorityV1.mode !== "REQUIRED") throw new Error("expected required authority")
          yield* recordRequiredMode(sessionId, authorityV1, eventStore)
          expect(
            yield* eventStore.listType(sessionId, "intent.enforcement_required"),
          ).toHaveLength(1)

          yield* database.db
            .update(ContractTable)
            .set({ revision: 2 })
            .where(eq(ContractTable.id, contractId))
          const authorityV2 = yield* resolveIntentAuthority(database, sessionId)
          if (authorityV2.mode !== "REQUIRED") throw new Error("expected required authority")
          expect(authorityV2.contractRevision).toBe("2")
          yield* recordRequiredMode(sessionId, authorityV2, eventStore)
          const required = yield* eventStore.listType(sessionId, "intent.enforcement_required")
          expect(required).toHaveLength(2)
          const revisions = required
            .map((event) => (event.payload as { contractRevision?: string }).contractRevision)
            .sort()
          expect(revisions).toEqual(["1", "2"])
        }).pipe(Effect.provide(layers())),
      )
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
