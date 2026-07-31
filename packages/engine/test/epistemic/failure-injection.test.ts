import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { createHash } from "node:crypto"
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

function runTest<A, E = never>(effect: Effect.Effect<A, E, any>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())) as any)
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

const CREATE_CLAIMS = `
  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    proposition TEXT NOT NULL,
    status TEXT NOT NULL,
    scope_workspace TEXT,
    scope_branch TEXT,
    scope_file TEXT,
    scope_symbol TEXT,
    confidence REAL DEFAULT 0.5,
    calibration_domain TEXT,
    valid_from TEXT,
    valid_until TEXT,
    last_verified_at TEXT,
    created_at TEXT NOT NULL,
    created_by_event_id TEXT NOT NULL
  )
`

const CREATE_CONTRACTS = `
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    risk_class TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    compiler_model TEXT,
    revision INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_state TEXT,
    resolution_reason TEXT
  )
`

const CREATE_OBLIGATIONS = `
  CREATE TABLE IF NOT EXISTS obligations (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_rule_id TEXT,
    source_criterion_id TEXT,
    source_reason TEXT,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    verification TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    waived_by_event_id TEXT,
    waiver_reason TEXT
  )
`

function createTables(db: any) {
  return Effect.gen(function* () {
    yield* db.run(CREATE_EVENTS)
    yield* db.run(CREATE_TRACE_HEALTH)
    yield* db.run(CREATE_CLAIMS)
    yield* db.run(CREATE_CONTRACTS)
    yield* db.run(CREATE_OBLIGATIONS)
  })
}

/** Compute a valid event hash for direct-DB insertion tests. */
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

// ── failure-injection tests ──────────────────────────────────────────

describe("RunProof — failure-injection validation", () => {

  // ── (a) DEGRADED persists across multiple derive() calls ───────────

  it("DEGRADED trace persists across multiple derive() calls and DB row stays DEGRADED", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Append normal events — trace_health row is created as COMPLETE
        yield* store.append({
          sessionId: "degraded-persist",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "degraded-persist",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        // Force DEGRADED via direct SQL
        yield* db.run(`UPDATE trace_health SET status = 'DEGRADED' WHERE session_id = 'degraded-persist'`)

        const proof = yield* RunProof.Service

        // First derive — should be DEGRADED
        const r1 = yield* proof.derive("degraded-persist")
        expect(r1.traceHealth).toBe("DEGRADED")

        // Second derive — must still be DEGRADED (read-only, does not mutate)
        const r2 = yield* proof.derive("degraded-persist")
        expect(r2.traceHealth).toBe("DEGRADED")

        // Third derive — still DEGRADED
        const r3 = yield* proof.derive("degraded-persist")
        expect(r3.traceHealth).toBe("DEGRADED")

        // Verify DB row is still DEGRADED
        const rows: any = yield* db.run(`SELECT status FROM trace_health WHERE session_id = 'degraded-persist'`)
        // db.run returns different shapes depending on the driver; handle both
        const status = Array.isArray(rows) ? rows[0]?.status : rows?.status
        expect(status).toBe("DEGRADED")
      }),
    )
  })

  // ── (b) Healthy unrelated session remains COMPLETE when another session fails ──

  it("healthy session remains COMPLETE when a different session is DEGRADED", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Session A — healthy, full lifecycle
        yield* store.append({
          sessionId: "healthy-a",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })
        yield* store.append({
          sessionId: "healthy-a",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        // Session B — also healthy initially
        yield* store.append({
          sessionId: "degraded-b",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })
        yield* store.append({
          sessionId: "degraded-b",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        // Corrupt only session B
        yield* db.run(`UPDATE trace_health SET status = 'DEGRADED' WHERE session_id = 'degraded-b'`)

        const proof = yield* RunProof.Service

        const resultA = yield* proof.derive("healthy-a")
        expect(resultA.traceHealth).toBe("COMPLETE")
        expect(resultA.lifecycleStatus).toBe("COMPLETE")

        const resultB = yield* proof.derive("degraded-b")
        expect(resultB.traceHealth).toBe("DEGRADED")

        // Session A is completely unaffected by session B's degradation
        const resultA2 = yield* proof.derive("healthy-a")
        expect(resultA2.traceHealth).toBe("COMPLETE")
        expect(resultA2.proofLevel).not.toBe("P0")
      }),
    )
  })

  // ── (c) Degraded session cannot reach P3 ───────────────────────────

  it("DEGRADED session can never reach P3 even with all other invariants satisfied", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        // Build a "perfect" session — started, contract, obligations resolved, completion.resolved, terminal
        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: { obligationId: "o-1", contractId: "c-1", description: "test", required: true, source: "template" },
        })

        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.resolved",
          payload: { obligationId: "o-1", resolution: "satisfied" },
        })

        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "degraded-p3-attempt",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 3, reason: "normal" },
        })

        // Inject DEGRADED trace
        yield* db.run(`UPDATE trace_health SET status = 'DEGRADED' WHERE session_id = 'degraded-p3-attempt'`)

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("degraded-p3-attempt")

        // Must be P1 — DEGRADED blocks P3
        expect(result.proofLevel).toBe("P1")
        expect(result.traceHealth).toBe("DEGRADED")
        expect(result.gaps).toContain("traceHealth is DEGRADED — P3 requires COMPLETE")
        expect(result.integrityStatus).toBe("VALID") // chain is fine
        expect(result.lifecycleStatus).toBe("COMPLETE") // lifecycle is fine
        expect(result.completionMethod).toBe("VERIFIED_COMPLETE") // completion is fine
      }),
    )
  })

  // ── (d) Missing terminal event produces INCOMPLETE ─────────────────

  it("session.started without session.completed or session.crashed is INCOMPLETE", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "no-terminal",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "no-terminal",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        yield* store.append({
          sessionId: "no-terminal",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.returned",
          payload: { tool: "read_file", result: "ok" },
        })
        // No session.completed or session.crashed

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("no-terminal")

        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.lifecycle.started).toBe(true)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
        expect(result.lifecycle.terminalReason).toBeNull()
        expect(result.lifecycle.pairsComplete).toBe(false) // started but no terminal
        expect(result.gaps).toContain("lifecycleStatus is INCOMPLETE — P3 requires COMPLETE")
      }),
    )
  })

  // ── (e) tool.called without tool.returned produces INCOMPLETE pairing ──

  it("tool.called without matching tool.returned produces INCOMPLETE lifecycle", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "unpaired-tool-inject",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "unpaired-tool-inject",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "read_file" },
        })

        yield* store.append({
          sessionId: "unpaired-tool-inject",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.called",
          payload: { tool: "write_file" },
        })

        // Only one tool.returned — still 2 called vs 1 returned
        yield* store.append({
          sessionId: "unpaired-tool-inject",
          actor: { kind: "model", id: "gpt-4" },
          type: "tool.returned",
          payload: { tool: "read_file", result: "ok" },
        })

        yield* store.append({
          sessionId: "unpaired-tool-inject",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 2, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("unpaired-tool-inject")

        expect(result.lifecycle.pairsComplete).toBe(false)
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.proofLevel).toBe("P1") // P1 max for INCOMPLETE lifecycle
        expect(result.gaps).toContain("lifecycleStatus is INCOMPLETE — P3 requires COMPLETE")
      }),
    )
  })

  // ── (f) NO_ACTIVE_CONTRACT never reaches P3 ────────────────────────

  it("NO_ACTIVE_CONTRACT completion method can never reach P3", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "no-contract-p3",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "no-contract-p3",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { method: "NO_ACTIVE_CONTRACT" },
        })

        yield* store.append({
          sessionId: "no-contract-p3",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 0, reason: "normal" },
        })

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("no-contract-p3")

        expect(result.proofLevel).toBe("P1")
        expect(result.completionMethod).toBe("NO_ACTIVE_CONTRACT")
        expect(result.lifecycleStatus).toBe("COMPLETE")
        expect(result.traceHealth).toBe("COMPLETE")
        expect(result.integrityStatus).toBe("VALID")
        expect(result.gaps).toContain("completionMethod is NO_ACTIVE_CONTRACT — P3 requires VERIFIED_COMPLETE")
      }),
    )
  })

  // ── (g) Zero events with UNAVAILABLE trace do not imply P1 ─────────

  it("zero events with UNAVAILABLE trace stays at P0 — does not jump to P1", async () => {
    await runTest(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)

        // No events inserted, no trace_health row → UNAVAILABLE
        const proof = yield* RunProof.Service
        const result = yield* proof.derive("zero-events-session")

        expect(result.proofLevel).toBe("P0")
        expect(result.eventCount).toBe(0)
        expect(result.traceHealth).toBe("UNAVAILABLE")
        expect(result.integrityStatus).toBe("UNVERIFIED")
        expect(result.lifecycleStatus).toBe("INCOMPLETE")
        expect(result.lifecycle.started).toBe(false)
        expect(result.lifecycle.hasTerminalEvent).toBe(false)
        expect(result.gaps.length).toBeGreaterThan(0)
        expect(result.gaps[0]).toContain("no events recorded")
      }),
    )
  })

  // ── (h) DEGRADED trace caps at P1 even with VERIFIED_COMPLETE ──────

  it("DEGRADED trace caps proof at P1 even when VERIFIED_COMPLETE + COMPLETE lifecycle", async () => {
    await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore.Service
        const { db } = yield* Database.Service
        yield* createTables(db)

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "user", id: "session" },
          type: "session.started",
          payload: {},
        })

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "c-1", objective: "test" },
        })

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: { obligationId: "o-1", contractId: "c-1", description: "test", required: true, source: "template" },
        })

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.resolved",
          payload: { obligationId: "o-1", resolution: "satisfied" },
        })

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "policy", id: "completion-gate" },
          type: "completion.resolved",
          payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" },
        })

        yield* store.append({
          sessionId: "degraded-verified",
          actor: { kind: "user", id: "session" },
          type: "session.completed",
          payload: { steps: 2, reason: "normal" },
        })

        // Inject DEGRADED — must happen after events so trace_health row exists
        yield* db.run(`UPDATE trace_health SET status = 'DEGRADED' WHERE session_id = 'degraded-verified'`)

        const proof = yield* RunProof.Service
        const result = yield* proof.derive("degraded-verified")

        // Everything else is perfect, but DEGRADED caps at P1
        expect(result.proofLevel).toBe("P1")
        expect(result.traceHealth).toBe("DEGRADED")
        expect(result.completionMethod).toBe("VERIFIED_COMPLETE")
        expect(result.lifecycleStatus).toBe("COMPLETE")
        expect(result.lifecycle.pairsComplete).toBe(true)
        expect(result.integrityStatus).toBe("VALID")
        expect(result.gaps).toEqual(["traceHealth is DEGRADED — P3 requires COMPLETE"])
      }),
    )
  })
})
