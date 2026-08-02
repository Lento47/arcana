import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { createIntentBinding } from "@arcana/core/capability/intent-binding"
import { SqliteIntentBindingStore } from "@arcana/core/capability/intent-binding-store-sqlite"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import type { CapabilityGrant } from "@arcana/core/capability/types"

const sessionId = "session-intent-sqlite"
const contractId = "contract-intent-sqlite"
const criterionId = "criterion-intent-sqlite"

function runWithDb<A, E>(effect: Effect.Effect<A, E, Database.Service>) {
  return Effect.runPromise(effect.pipe(Effect.provide(Database.layerFromPath(":memory:"))))
}

const seedActiveContract = Database.Service.use(({ db }) =>
  Effect.gen(function* () {
    yield* db.insert(ContractTable).values({
      id: contractId,
      session_id: sessionId,
      objective: "Exercise exact durable intent enforcement",
      risk_class: "modify",
      source_event_id: "event-user-request",
      revision: 1,
      status: "active",
      created_at: "2026-08-01T00:00:00.000Z",
    })
    yield* db.insert(ContractAcceptanceCriteriaTable).values({
      id: criterionId,
      contract_id: contractId,
      description: "Only the exact active revision may execute",
      required: 1,
      verification: "execution",
    })
  }),
)

function makeRequest() {
  return buildAuthorizationRequest({
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
}

function makeBinding(request = makeRequest()) {
  return createIntentBinding({
    requestHash: computeRequestHash(request),
    sessionId,
    userRequestEventId: "event-user-request",
    contractId,
    contractRevision: "1",
    criterionIds: [criterionId],
    justification: "NECESSARY_SUBSTEP",
    createdBy: "RUNTIME",
  })
}

function makeGrant(): CapabilityGrant {
  return {
    id: "capability-intent-sqlite",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["process.execute"],
    resources: [{ kind: "process", pattern: "bun" }],
    constraints: { sessionId },
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "event-capability-created",
  }
}

describe("SqliteIntentBindingStore", () => {
  test("round-trips exact active bindings and isolates sessions", async () => {
    await runWithDb(Effect.gen(function* () {
      yield* seedActiveContract
      const database = yield* Database.Service
      const store = new SqliteIntentBindingStore(database)
      const binding = makeBinding()

      yield* store.putBinding(binding)

      const sessionBindings = yield* store.getActiveBindingsForSession(sessionId)
      const exactBindings = yield* store.getActiveBindingsForRequest(sessionId, binding.requestHash)
      const otherSession = yield* store.getActiveBindingsForSession("session-other")

      expect(sessionBindings).toEqual([binding])
      expect(exactBindings).toEqual([binding])
      expect(otherSession).toEqual([])
    }))
  })

  test("stops returning a binding when the contract revision changes", async () => {
    await runWithDb(Effect.gen(function* () {
      yield* seedActiveContract
      const database = yield* Database.Service
      const store = new SqliteIntentBindingStore(database)
      yield* store.putBinding(makeBinding())

      yield* database.db
        .update(ContractTable)
        .set({ revision: 2 })
        .where(eq(ContractTable.id, contractId))

      expect(yield* store.getActiveBindingsForSession(sessionId)).toEqual([])
    }))
  })

  test("persists explicit revocation", async () => {
    await runWithDb(Effect.gen(function* () {
      yield* seedActiveContract
      const database = yield* Database.Service
      const store = new SqliteIntentBindingStore(database)
      const binding = makeBinding()
      yield* store.putBinding(binding)

      expect(yield* store.revokeBinding(binding.id)).toBe(true)
      expect(yield* store.revokeBinding(binding.id)).toBe(false)
      expect(yield* store.getActiveBindingsForSession(sessionId)).toEqual([])
    }))
  })

  test("executes only while the exact active contract revision remains valid", async () => {
    await runWithDb(Effect.gen(function* () {
      yield* seedActiveContract
      const database = yield* Database.Service
      const intentStore = new SqliteIntentBindingStore(database)
      const grantStore = new SqliteGrantStore(database)
      const request = makeRequest()
      yield* intentStore.putBinding(makeBinding(request))
      yield* grantStore.putGrant(makeGrant())

      const provider = new SessionPolicyProvider(
        grantStore,
        {
          principalId: "agent:main",
          sessionId,
          workspaceTrust: "TRUSTED",
        },
        intentStore,
        "REQUIRED",
      )
      let executions = 0
      const execute = () => {
        executions += 1
        return "executed"
      }

      const allowed = yield* authorizeAndExecuteEffect(
        { request, executeExact: execute },
        provider,
      )
      expect(allowed.status).toBe("EXECUTED")
      expect(executions).toBe(1)

      yield* database.db
        .update(ContractTable)
        .set({ revision: 2 })
        .where(eq(ContractTable.id, contractId))

      const invalidated = yield* authorizeAndExecuteEffect(
        { request, executeExact: execute },
        provider,
      )
      expect(invalidated.status).toBe("APPROVAL_REQUIRED")
      expect(executions).toBe(1)
    }))
  })
})
