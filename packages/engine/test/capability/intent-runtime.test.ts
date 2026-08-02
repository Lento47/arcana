import { describe, expect, test } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import {
  ensureApprovedBinding,
  ensureRuntimeBinding,
  recordCompatibilityMode,
  recordRequiredMode,
  revokeBindingsForContract,
  resolveIntentAuthority,
} from "@arcana/engine/session/intent-runtime"

const dbLayer = Database.layerFromPath(":memory:")
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
const runtimeLayer = Layer.mergeAll(dbLayer, eventStoreLayer)

function runWithRuntime<A, E>(effect: Effect.Effect<A, E, Database.Service | EventStore.Service>) {
  return Effect.runPromise(effect.pipe(Effect.provide(runtimeLayer)))
}

function seedActiveContract(input: {
  sessionId: string
  contractId: string
  criterionId: string
  revision?: number
}) {
  return Database.Service.use(({ db }) =>
    Effect.gen(function* () {
      yield* db.insert(ContractTable).values({
        id: input.contractId,
        session_id: input.sessionId,
        objective: "Ground consequential execution in an active contract",
        risk_class: "modify",
        source_event_id: `user-request-${input.contractId}`,
        revision: input.revision ?? 1,
        status: "active",
        created_at: "2026-08-01T00:00:00.000Z",
      })
      yield* db.insert(ContractAcceptanceCriteriaTable).values({
        id: input.criterionId,
        contract_id: input.contractId,
        description: "The exact request is authorized",
        required: 1,
        verification: "execution",
      })
    }),
  )
}

function makeRequest(input: {
  sessionId: string
  contractId: string
  criterionId: string
  revision?: string
  toolName?: "terminal" | "git_push"
  provenance?: Array<"USER_INSTRUCTION" | "ACTIVE_CONTRACT" | "REMOTE_CONTENT">
}) {
  const toolName = input.toolName ?? "terminal"
  return buildAuthorizationRequest({
    toolName,
    principalId: "agent:main",
    sessionId: input.sessionId,
    args: toolName === "terminal" ? { command: "bun test" } : {},
    executable: toolName === "terminal" ? "bun" : undefined,
    provenance: input.provenance ?? ["USER_INSTRUCTION", "ACTIVE_CONTRACT"],
    contractId: input.contractId,
    contractRevision: input.revision ?? "1",
    criterionIds: [input.criterionId],
  })
}

describe("production session intent runtime", () => {
  test("resolves one active revision, persists a runtime binding, and records evidence", async () => {
    const sessionId = "session-runtime-required"
    const contractId = "contract-runtime-required"
    const criterionId = "criterion-runtime-required"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({ sessionId, contractId, criterionId })
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      if (authority.mode !== "REQUIRED") throw new Error("expected required authority")

      expect(authority.contractId).toBe(contractId)
      expect(authority.contractRevision).toBe("1")
      expect(authority.criterionIds).toEqual([criterionId])

      yield* recordRequiredMode(sessionId, authority, eventStore)
      const request = makeRequest({ sessionId, contractId, criterionId })
      const binding = yield* ensureRuntimeBinding(request, authority, eventStore)
      expect(binding?.requestHash).toBe(computeRequestHash(request))
      expect(binding?.createdBy).toBe("RUNTIME")

      const persisted = yield* authority.store.getActiveBindingsForRequest(
        sessionId,
        computeRequestHash(request),
      )
      expect(persisted).toHaveLength(1)

      const governance = yield* eventStore.listGovernance(sessionId)
      expect(governance.map((event) => event.type)).toContain("intent.enforcement_required")
      expect(governance.map((event) => event.type)).toContain("intent.binding_created")
    }))
  })

  test("does not runtime-bind untrusted remote content", async () => {
    const sessionId = "session-runtime-remote"
    const contractId = "contract-runtime-remote"
    const criterionId = "criterion-runtime-remote"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({ sessionId, contractId, criterionId })
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      if (authority.mode !== "REQUIRED") throw new Error("expected required authority")
      const request = makeRequest({
        sessionId,
        contractId,
        criterionId,
        provenance: ["REMOTE_CONTENT"],
      })

      expect(yield* ensureRuntimeBinding(request, authority, eventStore)).toBeUndefined()
      expect(
        yield* authority.store.getActiveBindingsForRequest(sessionId, computeRequestHash(request)),
      ).toEqual([])
    }))
  })

  test("creates an exact user-approval binding for critical work", async () => {
    const sessionId = "session-runtime-approved"
    const contractId = "contract-runtime-approved"
    const criterionId = "criterion-runtime-approved"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({ sessionId, contractId, criterionId })
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      if (authority.mode !== "REQUIRED") throw new Error("expected required authority")
      const request = makeRequest({
        sessionId,
        contractId,
        criterionId,
        toolName: "git_push",
      })

      const binding = yield* ensureApprovedBinding(
        request,
        authority,
        "2099-01-01T00:00:00.000Z",
        eventStore,
      )
      expect(binding.createdBy).toBe("USER_APPROVAL")
      expect(binding.justification).toBe("EXPLICIT_APPROVAL")
      expect(binding.requestHash).toBe(computeRequestHash(request))
    }))
  })

  test("revokes contract-bound bindings on contract resolution and records intent.binding_revoked", async () => {
    const sessionId = "session-runtime-revoked"
    const contractId = "contract-runtime-revoked"
    const criterionId = "criterion-runtime-revoked"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({ sessionId, contractId, criterionId })
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      if (authority.mode !== "REQUIRED") throw new Error("expected required authority")

      const request = makeRequest({ sessionId, contractId, criterionId })
      const binding = yield* ensureRuntimeBinding(request, authority, eventStore)
      expect(binding).toBeDefined()
      expect(
        yield* authority.store.getActiveBindingsForRequest(sessionId, computeRequestHash(request)),
      ).toHaveLength(1)

      const revoked = yield* revokeBindingsForContract({
        sessionId,
        contractId,
        contractRevision: "1",
        store: authority.store,
        eventStore,
      })
      expect(revoked).toBe(1)
      expect(
        yield* authority.store.getActiveBindingsForRequest(sessionId, computeRequestHash(request)),
      ).toEqual([])

      const governance = yield* eventStore.listGovernance(sessionId)
      const revokedEvents = governance.filter((event) => event.type === "intent.binding_revoked")
      expect(revokedEvents).toHaveLength(1)
      const payload = revokedEvents[0]!.payload as Record<string, unknown>
      expect(payload.reason).toBe("CONTRACT_RESOLVED")
      expect(payload.bindingId).toBe(binding!.id)
      expect(payload.status).toBe("REVOKED")
    }))
  })

  test("does not revoke bindings bound to a different contract or revision", async () => {
    const sessionId = "session-runtime-revoked-scoped"
    const contractId = "contract-runtime-revoked-scoped"
    const criterionId = "criterion-runtime-revoked-scoped"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({ sessionId, contractId, criterionId })
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      if (authority.mode !== "REQUIRED") throw new Error("expected required authority")

      const request = makeRequest({ sessionId, contractId, criterionId })
      yield* ensureRuntimeBinding(request, authority, eventStore)

      const revoked = yield* revokeBindingsForContract({
        sessionId,
        contractId: "contract-other",
        contractRevision: "1",
        store: authority.store,
        eventStore,
      })
      expect(revoked).toBe(0)
      expect(
        yield* authority.store.getActiveBindingsForRequest(sessionId, computeRequestHash(request)),
      ).toHaveLength(1)
      expect(
        (yield* eventStore.listGovernance(sessionId)).some(
          (event) => event.type === "intent.binding_revoked",
        ),
      ).toBe(false)
    }))
  })

  test("records contractless sessions as degraded compatibility mode", async () => {
    const sessionId = "session-runtime-compatibility"

    await runWithRuntime(Effect.gen(function* () {
      const database = yield* Database.Service
      const eventStore = yield* EventStore.Service
      const authority = yield* resolveIntentAuthority(database, sessionId)
      expect(authority.mode).toBe("LEGACY_COMPAT")

      yield* recordCompatibilityMode(sessionId, eventStore)
      const governance = yield* eventStore.listGovernance(sessionId)
      expect(governance.map((event) => event.type)).toContain("intent.compatibility_mode")
    }))
  })

  test("fails closed when a session has multiple active contracts", async () => {
    const sessionId = "session-runtime-ambiguous"

    await runWithRuntime(Effect.gen(function* () {
      yield* seedActiveContract({
        sessionId,
        contractId: "contract-runtime-ambiguous-a",
        criterionId: "criterion-runtime-ambiguous-a",
      })
      yield* seedActiveContract({
        sessionId,
        contractId: "contract-runtime-ambiguous-b",
        criterionId: "criterion-runtime-ambiguous-b",
      })
      const database = yield* Database.Service

      const exit = yield* Effect.exit(resolveIntentAuthority(database, sessionId))
      expect(Exit.isFailure(exit)).toBe(true)
    }))
  })
})
