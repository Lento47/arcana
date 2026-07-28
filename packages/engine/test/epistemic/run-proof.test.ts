import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"

// ── helpers ──────────────────────────────────────────────────────────

function makeTestLayer() {
  const dbLayer = Database.layerFromPath(":memory:")
  const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
  const runProofLayer = RunProof.layer.pipe(Layer.provide(dbLayer))
  return Layer.mergeAll(dbLayer, eventStoreLayer, runProofLayer)
}

function runTest<A>(effect: Effect.Effect<A, never, EventStore.Service | Database.Service | RunProof.Service>) {
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

function createTables(db: any) {
  return Effect.gen(function* () {
    yield* db.run(CREATE_EVENTS)
    yield* db.run(CREATE_TRACE_HEALTH)
  })
}

// ── tests ────────────────────────────────────────────────────────────

describe("RunProof derivation", () => {
  // ── 1. Empty session → P0 ──────────────────────────────────────────

  it("derives P0 for session with no events", async () => {
    await runTest(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const proof = yield* RunProof.Service

        const result = yield* proof.derive("empty-session")
        expect(result.proofLevel).toBe("P0")
        expect(result.eventCount).toBe(0)
        expect(result.gaps).toContain("no events recorded")
        expect(result.lifecycle.started).toBe(false)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
      }),
    )
  })

  // ── 2. Started but no terminal → P1 ────────────────────────────────

  it("derives P1 when session.started exists but no terminal event", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "p1-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: { agent: "default" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p1-session")
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycle.started).toBe(true)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
        expect(result.gaps).toContain("no terminal event (session.completed or session.crashed)")
      }),
    )
  })

  // ── 3. Started + completed → P3 (if trace COMPLETE) ────────────────

  it("derives P3 when lifecycle complete and trace COMPLETE", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: { agent: "default" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "NO_ACTIVE_CONTRACT" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p3-session")
        expect(result.proofLevel).toBe("P3")
        expect(result.eventCount).toBe(4)
        expect(result.gaps).toEqual([])
        expect(result.lifecycle.started).toBe(true)
        expect(result.lifecycle.hasTerminalEvent).toBe(true)
        expect(result.lifecycle.terminalReason).toBe("completed")
        expect(result.lifecycle.pairsComplete).toBe(true)
        expect(result.traceStatus).toBe("COMPLETE")
      }),
    )
  })

  // ── 4. Crashed session → P3 (if trace COMPLETE) ────────────────────

  it("derives P3 for crashed session with complete trace", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "crashed-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "crashed-session",
          actor: { kind: "policy", id: "error-boundary" },
          type: "session.crashed",
          payload: { error: "OOM", errorType: "OutOfMemoryError" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("crashed-session")
        expect(result.proofLevel).toBe("P3")
        expect(result.lifecycle.hasTerminalEvent).toBe(true)
        expect(result.lifecycle.terminalReason).toBe("crashed")
      }),
    )
  })

  // ── 5. Deterministic hash ──────────────────────────────────────────

  it("produces identical hash for identical event sets", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "hash-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "hash-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result1 = yield* proof.derive("hash-session")
        const result2 = yield* proof.derive("hash-session")

        expect(result1.proofHash).toBe(result2.proofHash)
        expect(result1.proofHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256
      }),
    )
  })

  // ── 6. Different sessions produce different hashes ──────────────────

  it("produces different hashes for different sessions", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        for (const sid of ["session-a", "session-b"]) {
          yield* store.append({
            sessionId: sid,
            actor: { kind: "user", id: "session" },
            type: "session.started",
            payload: {},
          })
          yield* store.append({
            sessionId: sid,
            actor: { kind: "user", id: "session" },
            type: "session.completed",
            payload: { steps: 0, reason: "normal" },
          })
        }

        const proof = yield* RunProof.Service
        const hashA = yield* proof.derive("session-a")
        const hashB = yield* proof.derive("session-b")

        expect(hashA.proofHash).not.toBe(hashB.proofHash)
      }),
    )
  })

  // ── 7. Contract without resolution → P1 ────────────────────────────

  it("derives P1 when contract exists without completion.resolved", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "contract-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "contract-session",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "contract-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("contract-session")
        expect(result.proofLevel).toBe("P1")
        expect(result.gaps).toContain("event pairs incomplete (contract without resolution)")
      }),
    )
  })

  // ── 8. Events are ordered by sequence ───────────────────────────────

  it("returns events ordered by sequence", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        for (let i = 0; i < 5; i++) {
          yield* store.append({
            sessionId: "order-session",
            actor: { kind: "user", id: "actor" },
            type: "tool.called",
            payload: { step: i },
          })
        }

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("order-session")

        expect(result.events).toHaveLength(5)
        for (let i = 1; i < result.events.length; i++) {
          expect(result.events[i].sequence).toBeGreaterThan(result.events[i - 1].sequence)
        }
      }),
    )
  })

  // ── 9. RunRoot is deterministic ─────────────────────────────────────

  it("produces deterministic runRoot for same events", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "runroot-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })
        yield* store.append({
          sessionId: "runroot-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const r1 = yield* proof.derive("runroot-session")
        const r2 = yield* proof.derive("runroot-session")

        expect(r1.runRoot).toBe(r2.runRoot)
        expect(r1.runRoot).toMatch(/^[a-f0-9]{64}$/)
      }),
    )
  })

  // ── 10. RunRoot differs across sessions ─────────────────────────────

  it("produces different runRoot for different sessions", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        for (const sid of ["rr-a", "rr-b"]) {
          yield* store.append({
            sessionId: sid,
            actor: { kind: "user", id: "session" },
            type: "session.started",
            payload: {},
          })
        }

        const proof = yield* RunProof.Service
        const a = yield* proof.derive("rr-a")
        const b = yield* proof.derive("rr-b")

        expect(a.runRoot).not.toBe(b.runRoot)
      }),
    )
  })
})
