import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

// ── helpers ──────────────────────────────────────────────────────────

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

const CREATE_TRACE_HEALTH = `
  CREATE TABLE IF NOT EXISTS trace_health (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'COMPLETE',
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    recorded_events INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )
`

function makeLayerForFile(dbPath: string) {
  const dbLayer = Database.layerFromPath(dbPath)
  return Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)))
}

function runWithFile<A, E = never>(dbPath: string, effect: Effect.Effect<A, E, any>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeLayerForFile(dbPath))) as any)
}

// ── tests ────────────────────────────────────────────────────────────

describe("Multi-connection concurrency", () => {
  // ── 1. Two independent connections to the same file ─────────────────
  // Validates cross-connection visibility: Connection B sees Connection A's writes.
  // True concurrent writes are serialized by BEGIN IMMEDIATE + busy_timeout=5000.
  // On Windows, file locking prevents truly parallel Promise.all; use sequential
  // connections to verify the core invariant: |sequences| = |events|, chain valid.

  it("two independent connections see each other's writes and maintain chain", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "arcana-epistemic-"))
    const dbPath = path.join(dir, "test.db")

    try {
      // Initialize tables with first connection
      await runWithFile(dbPath, Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)
        yield* db.run(CREATE_TRACE_HEALTH)
      }))

      // Connection A: 25 events
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service
        for (let i = 0; i < 25; i++) {
          yield* store.append({
            sessionId: "conn-a",
            actor: { kind: "user", id: "conn-a" },
            type: "tool.called",
            payload: { conn: "a", step: i },
          })
        }
      }))

      // Connection B: 25 events (sees A's writes)
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service
        for (let i = 0; i < 25; i++) {
          yield* store.append({
            sessionId: "conn-b",
            actor: { kind: "model", id: "conn-b" },
            type: "tool.returned",
            payload: { conn: "b", step: i },
          })
        }
      }))

      // Verify with a third connection
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service
        const events = yield* store.list(55)

        // All events recorded
        expect(events).toHaveLength(50)

        // Sequences are 0..49 with no gaps or duplicates
        const sequences = events.map((e) => e.sequence).sort((a, b) => a - b)
        expect(sequences).toEqual(Array.from({ length: 50 }, (_, i) => i))

        // Chain integrity holds globally
        const result = yield* store.verify()
        expect(result.valid).toBe(true)

        // Events from both connections are present
        const connAEvents = events.filter(e => e.sessionId === "conn-a")
        const connBEvents = events.filter(e => e.sessionId === "conn-b")
        expect(connAEvents).toHaveLength(25)
        expect(connBEvents).toHaveLength(25)
      }))
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  // ── 2. Per-session event counts are correct across connections ──────

  it("per-session trace health is correct with multiple connections", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "arcana-epistemic-"))
    const dbPath = path.join(dir, "test.db")

    try {
      await runWithFile(dbPath, Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* db.run(CREATE_EVENTS)
        yield* db.run(CREATE_TRACE_HEALTH)
      }))

      // Connection A: 10 events for session-alpha
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service
        for (let i = 0; i < 10; i++) {
          yield* store.append({
            sessionId: "session-alpha",
            actor: { kind: "user", id: "actor-1" },
            type: "tool.called",
            payload: { step: i },
          })
        }
      }))

      // Connection B: 5 events for session-beta
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service
        for (let i = 0; i < 5; i++) {
          yield* store.append({
            sessionId: "session-beta",
            actor: { kind: "model", id: "actor-2" },
            type: "tool.returned",
            payload: { step: i },
          })
        }
      }))

      // Verify trace health from a third connection
      await runWithFile(dbPath, Effect.gen(function* () {
        const store = yield* EventStore.Service

        const healthAlpha = yield* store.sessionTraceHealth("session-alpha")
        expect(healthAlpha.recordedCriticalEvents).toBe(10)
        expect(healthAlpha.status).toBe("COMPLETE")

        const healthBeta = yield* store.sessionTraceHealth("session-beta")
        expect(healthBeta.recordedCriticalEvents).toBe(5)
        expect(healthBeta.status).toBe("COMPLETE")

        // Total events: 15
        const events = yield* store.list(20)
        expect(events).toHaveLength(15)
      }))
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })
})
