import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { createIntentBinding } from "@arcana/core/capability/intent-binding"
import { SqliteIntentBindingStore } from "@arcana/core/capability/intent-binding-store-sqlite"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"

const sessionId = "session-intent-performance"
const contractId = "contract-intent-performance"
const criterionId = "criterion-intent-performance"

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]!
}

function measure(samples: number[]): { p50: number; p95: number; max: number } {
  return { p50: percentile(samples, 50), p95: percentile(samples, 95), max: Math.max(...samples) }
}

describe("intent binding performance evidence", () => {
  test("binding lookup and governance projection latency (measured, logged)", async () => {
    const dbLayer = Database.layerFromPath(":memory:")
    const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
    const runtimeLayer = Layer.mergeAll(dbLayer, eventStoreLayer)

    await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service

        // One active contract revision.
        yield* database.db.insert(ContractTable).values({
          id: contractId,
          session_id: sessionId,
          objective: "Measure exact intent binding lookup latency",
          risk_class: "modify",
          source_event_id: "event-user-request",
          revision: 1,
          status: "active",
          created_at: "2026-08-01T00:00:00.000Z",
        })
        yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
          id: criterionId,
          contract_id: contractId,
          description: "Bound request",
          required: 1,
          verification: "execution",
        })

        const store = new SqliteIntentBindingStore(database)

        // A realistic per-session binding volume plus a deep history (10x) so
        // lookups do not degenerate to a scan of one row.
        for (let i = 0; i < 1_000; i++) {
          const request = buildAuthorizationRequest({
            toolName: "terminal",
            principalId: "agent:main",
            sessionId,
            args: { command: `bun test ${i}` },
            executable: "bun",
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
          yield* store.putBinding(binding)
        }

        const probeRequest = buildAuthorizationRequest({
          toolName: "terminal",
          principalId: "agent:main",
          sessionId,
          args: { command: "bun test probe" },
          executable: "bun",
          provenance: ["USER_INSTRUCTION", "ACTIVE_CONTRACT"],
          contractId,
          contractRevision: "1",
          criterionIds: [criterionId],
        })
        const probeHash = computeRequestHash(probeRequest)

        // Warm up (page cache, prepared statements).
        for (let i = 0; i < 20; i++) {
          yield* store.getActiveBindingsForRequest(sessionId, probeHash)
          yield* store.getActiveBindingsForSession(sessionId)
          yield* eventStore.listGovernance(sessionId, 500)
        }

        const requestLookups: number[] = []
        const sessionLookups: number[] = []
        const governanceLists: number[] = []
        for (let i = 0; i < 200; i++) {
          let start = performance.now()
          yield* store.getActiveBindingsForRequest(sessionId, probeHash)
          requestLookups.push(performance.now() - start)

          start = performance.now()
          yield* store.getActiveBindingsForSession(sessionId)
          sessionLookups.push(performance.now() - start)

          start = performance.now()
          yield* eventStore.listGovernance(sessionId, 500)
          governanceLists.push(performance.now() - start)
        }

        const requestMs = measure(requestLookups)
        const sessionMs = measure(sessionLookups)
        const governanceMs = measure(governanceLists)

        // Evidence is the logged distribution; the bound is a generous CI-safe
        // guard, not the claimed budget.
        console.log(
          `[perf] intent binding lookup request p50=${requestMs.p50.toFixed(2)}ms p95=${requestMs.p95.toFixed(2)}ms max=${requestMs.max.toFixed(2)}ms`,
        )
        console.log(
          `[perf] intent binding lookup session p50=${sessionMs.p50.toFixed(2)}ms p95=${sessionMs.p95.toFixed(2)}ms max=${sessionMs.max.toFixed(2)}ms`,
        )
        console.log(
          `[perf] governance listGovernance(500) p50=${governanceMs.p50.toFixed(2)}ms p95=${governanceMs.p95.toFixed(2)}ms max=${governanceMs.max.toFixed(2)}ms`,
        )

        expect(requestMs.p95).toBeLessThan(250)
        expect(sessionMs.p95).toBeLessThan(250)
        expect(governanceMs.p95).toBeLessThan(250)
      }).pipe(Effect.provide(runtimeLayer)),
    )
  })
})
