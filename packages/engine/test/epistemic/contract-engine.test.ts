import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { ContractTable } from "@arcana/core/epistemic/contract-sql"
import type { SessionID } from "../../src/session/schema"
import { ContractEngine } from "../../src/session/epistemic/contract-engine"
import { EventStore } from "../../src/session/epistemic/event-store"
import { ObligationEngine } from "../../src/session/epistemic/obligation-engine"

const dbLayer = Database.layerFromPath(":memory:")
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
const obligationLayer = ObligationEngine.layer.pipe(
  Layer.provide(eventStoreLayer),
  Layer.provide(dbLayer),
)
const contractLayer = ContractEngine.layer.pipe(
  Layer.provide(obligationLayer),
  Layer.provide(eventStoreLayer),
  Layer.provide(dbLayer),
)
const runtimeLayer = Layer.mergeAll(dbLayer, eventStoreLayer, obligationLayer, contractLayer)

function run<A, E>(effect: Effect.Effect<A, E, ContractEngine.Service | EventStore.Service | ObligationEngine.Service | Database.Service>) {
  return Effect.runPromise(effect.pipe(Effect.provide(runtimeLayer)))
}

const sessionId = "session-contract-engine" as SessionID

describe("contract engine production lifecycle", () => {
  test("compiles request-derived acceptance criteria with meaningful descriptions", async () => {
    await run(
      Effect.gen(function* () {
        const contracts = yield* ContractEngine.Service
        const contract = yield* contracts.propose({
          sessionId,
          userRequest: "run the tests, fix the bug, and build the project",
          sourceEventId: "user-compile",
        })
        const descriptions = contract.acceptanceCriteria.map((criterion) => criterion.description)
        expect(descriptions).toEqual([
          "Relevant tests and checks pass",
          "The reported defect is fixed",
          "The project builds successfully",
        ])

        const generic = yield* contracts.propose({
          sessionId,
          userRequest: "summarize the current architecture",
          sourceEventId: "user-generic",
        })
        expect(generic.acceptanceCriteria.map((criterion) => criterion.description)).toEqual([
          "Task completed as described",
        ])
      }),
    )
  })

  test("activation seeds proof obligations from acceptance criteria, idempotently", async () => {
    await run(
      Effect.gen(function* () {
        const contracts = yield* ContractEngine.Service
        const obligations = yield* ObligationEngine.Service
        const contract = yield* contracts.propose({
          sessionId,
          userRequest: "fix authorization replay",
          sourceEventId: "user-1",
        })
        expect(contract.acceptanceCriteria.length).toBeGreaterThan(0)

        yield* contracts.activate(contract.id)
        const seeded = yield* obligations.listByContract(contract.id)
        expect(seeded.length).toBe(contract.acceptanceCriteria.length)
        expect(seeded.every((obligation) => obligation.required)).toBe(true)

        // Idempotent: re-activation must not duplicate obligations.
        yield* contracts.activate(contract.id)
        const after = yield* obligations.listByContract(contract.id)
        expect(after.length).toBe(contract.acceptanceCriteria.length)
      }),
    )
  })

  test("resolution marks the contract resolved and records resolution evidence", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const contracts = yield* ContractEngine.Service
        const eventStore = yield* EventStore.Service
        const contract = yield* contracts.propose({
          sessionId,
          userRequest: "verify the completion contract lifecycle",
          sourceEventId: "user-2",
        })
        yield* contracts.activate(contract.id)
        yield* contracts.resolve(contract.id, {
          state: "VERIFIED_COMPLETE",
          reason: "All required obligations satisfied by durable evidence",
          unresolved: [],
        })

        const rows = yield* database.db
          .select({ status: ContractTable.status })
          .from(ContractTable)
          .where(eq(ContractTable.id, contract.id))
        expect(rows[0]?.status).toBe("resolved")

        const governance = yield* eventStore.listGovernance(sessionId)
        const resolution = governance.find((event) => event.type === "contract.amended")
        expect(resolution).toBeDefined()
        expect((resolution!.payload as { resolution?: string }).resolution).toBe(
          "VERIFIED_COMPLETE",
        )
      }),
    )
  })

  test("re-admission after resolution proposes a new contract with the next revision", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const contracts = yield* ContractEngine.Service
        const first = yield* contracts.propose({
          sessionId,
          userRequest: "first objective",
          sourceEventId: "user-readmission-1",
        })
        expect(first.revision).toBe(1)
        yield* contracts.activate(first.id)
        yield* contracts.resolve(first.id, {
          state: "VERIFIED_COMPLETE",
          reason: "First objective complete",
          unresolved: [],
        })

        // A resolved contract is no longer active: the next objective must be
        // admitted as a fresh contract, not silently run under the old one.
        const activeAfterResolution = yield* contracts.getActive(sessionId)
        expect(activeAfterResolution).toBeUndefined()

        const second = yield* contracts.propose({
          sessionId,
          userRequest: "second objective",
          sourceEventId: "user-readmission-2",
        })
        expect(second.id).not.toBe(first.id)
        expect(second.revision).toBe(2)
        expect(second.objective).toBe("second objective")

        const rows = yield* database.db
          .select({ id: ContractTable.id, revision: ContractTable.revision, status: ContractTable.status })
          .from(ContractTable)
          .where(eq(ContractTable.session_id, sessionId))
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.revision).sort()).toEqual([1, 2])
      }),
    )
  })
})
