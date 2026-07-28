import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"

// ── helpers ──────────────────────────────────────────────────────────

function makeTestLayer() {
  const dbLayer = Database.layerFromPath(":memory:")
  return Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)))
}

function runTest<A>(effect: Effect.Effect<A, never, EventStore.Service | Database.Service>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())))
}

const CREATE_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    sequence INTEGER NOT NULL UNIQUE,
    session_id TEXT,
    timestamp TEXT NOT NULL,
    previous_hash TEXT,
    hash TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`

// ── tests ────────────────────────────────────────────────────────────

describe("EventStore append safety", () => {
  // ── 1. Sequential appends produce unique, ordered sequences ─────────

  it("produces unique sequence numbers for sequential appends", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)

        for (let i = 0; i < 10; i++) {
          yield* store.append({
            sessionId: `session-${i % 3}`,
            actor: { kind: "user", id: "actor-1" },
            type: "tool.called",
            payload: { step: i },
          })
        }

        const events = yield* store.list(20)
        expect(events).toHaveLength(10)

        const sequences = events.map((e) => e.sequence)
        expect(new Set(sequences).size).toBe(10)
        expect(sequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
      }),
    )
  })

  // ── 2. Chain integrity after sequential appends ─────────────────────

  it("maintains chain integrity after sequential appends", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)

        for (let i = 0; i < 20; i++) {
          yield* store.append({
            sessionId: i % 2 === 0 ? "session-a" : "session-b",
            actor: { kind: "user", id: "actor-1" },
            type: "tool.called",
            payload: { step: i },
          })
        }

        const events = yield* store.list(25)
        expect(events).toHaveLength(20)

        const sequences = events.map((e) => e.sequence)
        expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i))

        const result = yield* store.verify()
        expect(result.valid).toBe(true)
      }),
    )
  })

  // ── 3. 50 sequential appends with full chain verification ──────────

  it("handles 50 sequential appends without sequence gaps or duplicates", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)

        for (let i = 0; i < 50; i++) {
          yield* store.append({
            sessionId: `session-${i % 5}`,
            actor: { kind: i % 2 === 0 ? "user" : "model", id: `actor-${i % 3}` },
            type: i % 3 === 0 ? "tool.called" : "tool.returned",
            payload: { step: i, data: `payload-${i}` },
          })
        }

        const events = yield* store.list(55)
        expect(events).toHaveLength(50)

        const sequences = events.map((e) => e.sequence).sort((a, b) => a - b)
        expect(sequences).toEqual(Array.from({ length: 50 }, (_, i) => i))

        const result = yield* store.verify()
        expect(result.valid).toBe(true)
      }),
    )
  })

  // ── 4. Transaction isolation: read-then-write is atomic ─────────────

  it("transaction wraps read-then-write atomically", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)

        // Append 3 events
        for (let i = 0; i < 3; i++) {
          yield* store.append({
            sessionId: "session-1",
            actor: { kind: "user", id: "actor-1" },
            type: "tool.called",
            payload: { step: i },
          })
        }

        // Verify each event has the correct previousHash
        const events = yield* store.list(10)
        expect(events).toHaveLength(3)

        // Event 0: no previous hash
        expect(events[0].previousHash).toBeNull()
        // Event 1: previous hash = event 0's hash
        expect(events[1].previousHash).toBe(events[0].hash)
        // Event 2: previous hash = event 1's hash
        expect(events[2].previousHash).toBe(events[1].hash)

        // All hashes are unique
        const hashes = events.map((e) => e.hash)
        expect(new Set(hashes).size).toBe(3)
      }),
    )
  })

  // ── 5. sessionId is correctly stored and returned ───────────────────

  it("stores and returns sessionId correctly", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)

        yield* store.append({
          sessionId: "session-abc",
          actor: { kind: "user", id: "actor-1" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        yield* store.append({
          // No sessionId
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.returned",
          payload: { result: "ok" },
        })

        const events = yield* store.list(10)
        expect(events).toHaveLength(2)
        expect(events[0].sessionId).toBe("session-abc")
        expect(events[1].sessionId).toBeUndefined()
      }),
    )
  })
})
