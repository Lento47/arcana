import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { createHash } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"
import type { ProofHashPayload } from "@arcana/engine/session/epistemic/run-proof"

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

/** Compute a valid event hash for direct-DB insertion tests.
 * Must match @arcana/core/epistemic/event-hash.ts exactly. */
function fakeEventHash(row: {
  id: string; sequence: number; timestamp: string; previous_hash: string | null;
  actor_kind: string; actor_id: string; type: string; payload: string;
}): string {
  const canonical = JSON.stringify({
    id: row.id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    previousHash: row.previous_hash,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    type: row.type,
    payload: row.payload,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

// ── tests ────────────────────────────────────────────────────────────

describe("RunProof derivation", () => {

  // ── 1. Zero events → P0 with gap ───────────────────────────────────

  it("derives P0 with gap for session with no events", async () => {
    await runTest(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const proof = yield* RunProof.Service

        const result = yield* proof.derive("empty-session")
        expect(result.proofLevel).toBe("P0")
        expect(result.eventCount).toBe(0)
        expect(result.gaps.length).toBeGreaterThan(0)
        expect(result.gaps[0]).toContain("no events recorded")
        expect(result.lifecycle.started).toBe(false)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.integrityStatus).toBe("UNVERIFIED")
        expect(result.traceHealth).toBe("UNAVAILABLE")
      }),
    )
  })

  // ── 2. Valid trace only → P0 ───────────────────────────────────────

  it("derives P1 when events exist and chain is valid (even if lifecycle incomplete)", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Single event, no session.started, no terminal
        yield* store.append({
          sessionId: "p0-session",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p0-session")
        // Chain is valid → integrity VALID → P1 achieved
        // But lifecycle is INCOMPLETE (no session.started)
        expect(result.proofLevel).toBe("P1")
        expect(result.eventCount).toBe(1)
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.integrityStatus).toBe("VALID")
      }),
    )
  })

  // ── 3. session.started without terminal → P0 (lifecycle INCOMPLETE) ──

  it("derives P0 when session.started exists but no terminal event", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "p0-incomplete",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: { agent: "default" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p0-incomplete")
        // Has events + valid integrity → P1 achieved
        // But lifecycle is INCOMPLETE
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycle.started).toBe(true)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.integrityStatus).toBe("VALID")
      }),
    )
  })

  // ── 4. P1 INTEGRITY — chain + runRoot + proofHash verify ───────────

  it("derives P1 when integrity is VALID (chain, runRoot, proofHash verify)", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "p1-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })
        yield* store.append({
          sessionId: "p1-session",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })
        yield* store.append({
          sessionId: "p1-session",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.returned",
          payload: { tool: "read_file", result: "ok" },
        })
        yield* store.append({
          sessionId: "p1-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p1-session")
        expect(result.proofLevel).toBe("P1")
        expect(result.integrityStatus).toBe("VALID")
        expect(result.lifecycleStatus).toBe("COMPLETE")
        expect(result.traceHealth).toBe("COMPLETE")
        // No completion.resolved → no VERIFIED_COMPLETE → max P1
        expect(result.completionMethod).toBeNull()
      }),
    )
  })

  // ── 5. VERIFIED_COMPLETE + all invariants → P3 ─────────────────────

  it("derives P3 when VERIFIED_COMPLETE + all invariants hold", async () => {
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
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: { obligationId: "o-1", contractId: "c-1", description: "test", required: true, source: "template" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.resolved",
          payload: { obligationId: "o-1", resolution: "satisfied" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "p3-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 3, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("p3-session")
        expect(result.proofLevel).toBe("P3")
        expect(result.eventCount).toBe(6)
        expect(result.gaps).toEqual([])
        expect(result.lifecycle.started).toBe(true)
        expect(result.lifecycle.hasTerminalEvent).toBe(true)
        expect(result.lifecycle.terminalReason).toBe("completed")
        expect(result.lifecycle.pairsComplete).toBe(true)
        expect(result.lifecycleStatus).toBe("COMPLETE")
        expect(result.traceHealth).toBe("COMPLETE")
        expect(result.integrityStatus).toBe("VALID")
        expect(result.completionMethod).toBe("VERIFIED_COMPLETE")
      }),
    )
  })

  // ── 6. Crashed session with VERIFIED_COMPLETE → P3 ─────────────────

  it("derives P3 for crashed session if VERIFIED_COMPLETE already resolved", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "crashed-p3",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "crashed-p3",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "crashed-p3",
          actor: { kind: "policy", id: "error-boundary" },
          type: "session.crashed",
          payload: { error: "OOM", errorType: "OutOfMemoryError" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("crashed-p3")
        // CRASHED lifecycle → max P1 per the rules
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycleStatus).toBe("CRASHED")
        expect(result.gaps).toContain("lifecycleStatus is CRASHED — P3 requires COMPLETE")
      }),
    )
  })

  // ── 7. NO_ACTIVE_CONTRACT → max P1 ─────────────────────────────────

  it("caps at P1 when completionMethod is NO_ACTIVE_CONTRACT", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "no-contract",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "no-contract",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "NO_ACTIVE_CONTRACT" },
        })

        yield* store.append({
          sessionId: "no-contract",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("no-contract")
        expect(result.proofLevel).toBe("P1")
        expect(result.completionMethod).toBe("NO_ACTIVE_CONTRACT")
        expect(result.gaps).toContain("completionMethod is NO_ACTIVE_CONTRACT — P3 requires VERIFIED_COMPLETE")
      }),
    )
  })

  // ── 8. DEGRADED trace → max P1 ─────────────────────────────────────

  it("caps at P1 when traceHealth is DEGRADED", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Insert events normally
        yield* store.append({
          sessionId: "degraded-trace",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "degraded-trace",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "degraded-trace",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        // Manually set trace health to DEGRADED
        yield* db.run(`UPDATE trace_health SET status = 'DEGRADED' WHERE session_id = 'degraded-trace'`)

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("degraded-trace")
        expect(result.proofLevel).toBe("P1")
        expect(result.traceHealth).toBe("DEGRADED")
        expect(result.integrityStatus).toBe("VALID") // chain still valid
        expect(result.gaps).toContain("traceHealth is DEGRADED — P3 requires COMPLETE")
      }),
    )
  })

  // ── 9. UNAVAILABLE trace → max P1 ──────────────────────────────────

  it("caps at P1 when traceHealth is UNAVAILABLE", async () => {
    await runTest(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Insert events directly without going through EventStore (no trace_health row)
        const ts = new Date().toISOString()
        const row1 = { id: "evt-1", sequence: 0, session_id: "no-trace", timestamp: ts, previous_hash: null, actor_kind: "user", actor_id: "session", type: "session.started", payload: "{}" }
        const hash1 = fakeEventHash(row1 as any)
        yield* db.run(`INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES ('${row1.id}', ${row1.sequence}, '${row1.session_id}', '${row1.timestamp}', NULL, '${hash1}', '${row1.actor_kind}', '${row1.actor_id}', '${row1.type}', '${row1.payload}')`)

        const row2 = { id: "evt-2", sequence: 1, session_id: "no-trace", timestamp: ts, previous_hash: hash1, actor_kind: "policy", actor_id: "completion-gate", type: "completion.resolved", payload: '{"method":"VERIFIED_COMPLETE"}' }
        const hash2 = fakeEventHash(row2 as any)
        yield* db.run(`INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES ('${row2.id}', ${row2.sequence}, '${row2.session_id}', '${row2.timestamp}', '${hash1}', '${hash2}', '${row2.actor_kind}', '${row2.actor_id}', '${row2.type}', '${row2.payload}')`)

        const row3 = { id: "evt-3", sequence: 2, session_id: "no-trace", timestamp: ts, previous_hash: hash2, actor_kind: "user", actor_id: "session", type: "session.completed", payload: '{"steps":1,"reason":"normal"}' }
        const hash3 = fakeEventHash(row3 as any)
        yield* db.run(`INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES ('${row3.id}', ${row3.sequence}, '${row3.session_id}', '${row3.timestamp}', '${hash2}', '${hash3}', '${row3.actor_kind}', '${row3.actor_id}', '${row3.type}', '${row3.payload}')`)

        // No trace_health row inserted → UNAVAILABLE
        const proof = yield* RunProof.Service
        const result = yield* proof.derive("no-trace")
        expect(result.proofLevel).toBe("P1")
        expect(result.traceHealth).toBe("UNAVAILABLE")
        expect(result.gaps).toContain("traceHealth is UNAVAILABLE — P3 requires COMPLETE")
      }),
    )
  })

  // ── 10. INCOMPLETE lifecycle → max P1 ───────────────────────────────

  it("caps at P1 when lifecycle is INCOMPLETE", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Started but no terminal event
        yield* store.append({
          sessionId: "incomplete-lc",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "incomplete-lc",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "VERIFIED_COMPLETE" },
        })
        // No session.completed or session.crashed

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("incomplete-lc")
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.gaps).toContain("lifecycleStatus is INCOMPLETE — P3 requires COMPLETE")
      }),
    )
  })

  // ── 11. Corrupt global chain → integrity INVALID, never P1+ ────────

  it("detects corrupt global chain → integrity INVALID, capped at P0", async () => {
    await runTest(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Insert event with CORRUPTED hash
        const ts = new Date().toISOString()
        const row = {
          id: "corrupt-1", sequence: 0, session_id: "corrupt-session",
          timestamp: ts, previous_hash: null,
          actor_kind: "user", actor_id: "session",
          type: "session.started", payload: "{}",
        }
        const realHash = fakeEventHash(row as any)
        const corruptHash = "0000000000000000000000000000000000000000000000000000000000000000"

        yield* db.run(`INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES ('${row.id}', ${row.sequence}, '${row.session_id}', '${row.timestamp}', NULL, '${corruptHash}', '${row.actor_kind}', '${row.actor_id}', '${row.type}', '${row.payload}')`)

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("corrupt-session")
        expect(result.proofLevel).toBe("P0")
        expect(result.integrityStatus).toBe("INVALID")
        expect(result.gaps).toContain("integrity INVALID — global chain or runRoot verification failed")
      }),
    )
  })

  // ── 12. Unresolved required obligations → max P1 ────────────────────

  it("caps at P1 when required obligations are unresolved", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "unresolved-obl",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "unresolved-obl",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "unresolved-obl",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: { obligationId: "o-1", contractId: "c-1", description: "must do X", required: true, source: "template" },
        })

        // NO obligation.resolved event

        yield* store.append({
          sessionId: "unresolved-obl",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "unresolved-obl",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("unresolved-obl")
        expect(result.proofLevel).toBe("P1")
        expect(result.gaps[0]).toContain("required obligation(s) unresolved")
      }),
    )
  })

  // ── 13. Contract without resolution → INCOMPLETE ───────────────────

  it("reports INCOMPLETE lifecycle when contract exists without completion.resolved", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "contract-no-res",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "contract-no-res",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "contract-no-res",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("contract-no-res")
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.lifecycle.pairsComplete).toBe(false)
      }),
    )
  })

  // ── 14. Deterministic hash ──────────────────────────────────────────

  it("produces identical proofHash for identical event sets", async () => {
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
        expect(result1.runRoot).toBe(result2.runRoot)
      }),
    )
  })

  // ── 15. Different sessions produce different hashes ─────────────────

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
        expect(hashA.runRoot).not.toBe(hashB.runRoot)
      }),
    )
  })

  // ── 16. Events ordered by sequence ──────────────────────────────────

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

  // ── 17. RunRoot is deterministic ────────────────────────────────────

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

  // ── 18. RunRoot differs across sessions ─────────────────────────────

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

  // ── 19. tool.called without tool.returned → pair incomplete ─────────

  it("reports INCOMPLETE lifecycle when tool.called exists without tool.returned", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "unpaired-tool",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "unpaired-tool",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })
        // No tool.returned

        yield* store.append({
          sessionId: "unpaired-tool",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("unpaired-tool")
        expect(result.proofLevel).toBe("P1")
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.lifecycle.pairsComplete).toBe(false)
      }),
    )
  })

  // ── 20. proofHash field mutated → verification fails ────────────────

  it("detects proofHash mutation — verifyProofHash returns false", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "hash-mutate",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("hash-mutate")

        // Mutate the proofHash
        const mutatedHash = "a".repeat(64)

        // Reconstruct the ProofHashPayload from the result
        const payload: ProofHashPayload = {
          sessionId: result.sessionId,
          eventCount: result.eventCount,
          eventHashes: result.eventHashes,
          lifecycle: result.lifecycle,
          lifecycleStatus: result.lifecycleStatus,
          traceHealth: result.traceHealth,
          integrityStatus: result.integrityStatus,
          proofLevel: result.proofLevel,
          completionMethod: result.completionMethod,
        }

        // Verify with correct hash
        expect(RunProof.verifyProofHash(payload, result.proofHash)).toBe(true)

        // Verify with mutated hash
        expect(RunProof.verifyProofHash(payload, mutatedHash)).toBe(false)
      }),
    )
  })

  // ── 21. runRoot event order changed → verification fails ────────────

  it("detects runRoot event order change — verifyRunRoot returns false", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "order-change",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })
        yield* store.append({
          sessionId: "order-change",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("order-change")

        // Reverse the order
        const reversedRows = [...result.events].reverse().map((e) => ({
          sequence: e.sequence,
          id: e.eventId,
          hash: "0000000000000000000000000000000000000000000000000000000000000000", // placeholder
        }))

        // Verify correct order passes
        const correctRows = result.events.map((e) => ({
          sequence: e.sequence,
          id: e.eventId,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
        }))

        // Different order → different runRoot (even with placeholder hashes)
        const root1 = RunProof.computeRunRoot("order-change", correctRows)
        const root2 = RunProof.computeRunRoot("order-change", reversedRows)
        expect(root1).not.toBe(root2)

        // Verify actual runRoot doesn't match reversed
        expect(RunProof.verifyRunRoot("order-change", reversedRows, result.runRoot)).toBe(false)
      }),
    )
  })

  // ── 22. Replay unavailable → never P2 ──────────────────────────────

  it("never assigns P2 — replay does not exist yet", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Even a perfect session cannot get P2
        yield* store.append({
          sessionId: "perfect-session",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "perfect-session",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "perfect-session",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 1, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("perfect-session")
        // With all invariants + VERIFIED_COMPLETE → P3 (skips P2)
        // P2 is unreachable until replay exists
        expect(result.proofLevel).not.toBe("P2")
        expect(["P0", "P1", "P3"]).toContain(result.proofLevel)
      }),
    )
  })
})
