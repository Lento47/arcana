import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"

const dbLayer = Database.layerFromPath(":memory:")
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
const runProofLayer = RunProof.layer.pipe(Layer.provide(dbLayer))
const runtimeLayer = Layer.mergeAll(dbLayer, eventStoreLayer, runProofLayer)

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]!
}

const EVENT_TYPES: ArcanaEvent["type"][] = [
  "session.started",
  "contract.proposed",
  "contract.activated",
  "obligation.created",
  "obligation.resolved",
  "authorization.requested",
  "authorization.allowed",
  "authorization.executed",
  "completion.resolved",
]

describe("RunProof derivation performance evidence", () => {
  test("derive latency at realistic event volume (measured, logged)", async () => {
    const sessionId = "session-runproof-perf"
    await Effect.runPromise(
      Effect.gen(function* () {
        const eventStore = yield* EventStore.Service
        for (let i = 0; i < 500; i++) {
          yield* eventStore.append({
            sessionId,
            actor: { kind: "policy", id: `actor-${i % 4}` },
            type: EVENT_TYPES[i % EVENT_TYPES.length]!,
            payload: { n: i },
          })
        }

        const runProof = yield* RunProof.Service
        for (let i = 0; i < 10; i++) {
          yield* runProof.derive(sessionId)
        }

        const samples: number[] = []
        for (let i = 0; i < 100; i++) {
          const start = performance.now()
          yield* runProof.derive(sessionId)
          samples.push(performance.now() - start)
        }

        const p50 = percentile(samples, 50)
        const p95 = percentile(samples, 95)
        const max = Math.max(...samples)
        console.log(
          `[perf] RunProof derive(500 events) p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
        )
        expect(p95).toBeLessThan(500)
      }).pipe(Effect.provide(runtimeLayer)),
    )
  })
})
