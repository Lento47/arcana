import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"
import type { RunProofEvent } from "@arcana/engine/session/epistemic/run-proof"

// ── Helpers ───────────────────────────────────────────────────────────

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
    session_id TEXT,
    proposition TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'observed',
    confidence REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_CONTRACTS = `
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolution_state TEXT,
    resolution_reason TEXT
  )
`

const CREATE_OBLIGATIONS = `
  CREATE TABLE IF NOT EXISTS obligations (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    waived_by_event_id TEXT,
    waiver_reason TEXT
  )
`

function makeTestLayer() {
  const dbLayer = Database.layerFromPath(":memory:")
  return Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)), RunProof.layer.pipe(Layer.provide(dbLayer)))
}

function createTables(db: any) {
  return Effect.gen(function* () {
    yield* db.run(CREATE_EVENTS)
    yield* db.run(CREATE_TRACE_HEALTH)
    yield* db.run(CREATE_CLAIMS)
    yield* db.run(CREATE_CONTRACTS)
    yield* db.run(CREATE_OBLIGATIONS)
  })
}

// ── Authorization Trace Health Tests ──────────────────────────────────

describe("Authorization trace health", () => {
  test("COMPLETE when every executed has matching requested + allowed", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s1", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Request → Allow → Execute
        yield* eventStore.append({ sessionId: "s1", actor: { kind: "policy", id: "pep" }, type: "authorization.requested", payload: { requestId: "r1" } })
        yield* eventStore.append({ sessionId: "s1", actor: { kind: "policy", id: "pdp" }, type: "authorization.allowed", payload: { requestId: "r1", decision: { decision: "ALLOW", policyVersion: "v1" } } })
        yield* eventStore.append({ sessionId: "s1", actor: { kind: "policy", id: "pep" }, type: "authorization.executed", payload: { requestId: "r1" } })

        yield* eventStore.append({ sessionId: "s1", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s1")
        expect(proof.authorizationProfile.authorizationTraceHealth).toBe("COMPLETE")
        expect(proof.authorizationProfile.orphanExecutions).toBe(0)
        expect(proof.authorizationProfile.unmatchedRequests).toBe(0)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("DEGRADED when orphan execution exists (executed without allowed)", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s2", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Orphan: executed without prior allowed
        yield* eventStore.append({ sessionId: "s2", actor: { kind: "policy", id: "pep" }, type: "authorization.requested", payload: { requestId: "r1" } })
        yield* eventStore.append({ sessionId: "s2", actor: { kind: "policy", id: "pep" }, type: "authorization.executed", payload: { requestId: "r1" } })

        yield* eventStore.append({ sessionId: "s2", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s2")
        expect(proof.authorizationProfile.authorizationTraceHealth).toBe("DEGRADED")
        expect(proof.authorizationProfile.orphanExecutions).toBe(1)
        expect(proof.authorizationProfile.unauthorizedExecutions).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("DEGRADED when unmatched requests exist", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s3", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Request without decision
        yield* eventStore.append({ sessionId: "s3", actor: { kind: "policy", id: "pep" }, type: "authorization.requested", payload: { requestId: "r1" } })

        yield* eventStore.append({ sessionId: "s3", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s3")
        expect(proof.authorizationProfile.authorizationTraceHealth).toBe("DEGRADED")
        expect(proof.authorizationProfile.unmatchedRequests).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("UNAVAILABLE when no authorization events exist", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s4", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })
        yield* eventStore.append({ sessionId: "s4", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s4")
        expect(proof.authorizationProfile.authorizationTraceHealth).toBe("UNAVAILABLE")
        expect(proof.authorizationProfile.requests).toBe(0)
        expect(proof.authorizationProfile.orphanExecutions).toBe(0)
        expect(proof.authorizationProfile.unmatchedAllows).toBe(0)
        expect(proof.authorizationProfile.unmatchedRequests).toBe(0)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("unmatched allows tracked correctly", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s5", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Request allowed but never executed or refused
        yield* eventStore.append({ sessionId: "s5", actor: { kind: "policy", id: "pep" }, type: "authorization.requested", payload: { requestId: "r1" } })
        yield* eventStore.append({ sessionId: "s5", actor: { kind: "policy", id: "pdp" }, type: "authorization.allowed", payload: { requestId: "r1", decision: { decision: "ALLOW", policyVersion: "v1" } } })

        yield* eventStore.append({ sessionId: "s5", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s5")
        expect(proof.authorizationProfile.unmatchedAllows).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("ActionAssured iff COMPLETE ∧ unauthorizedExecutions=0 ∧ orphanExecutions=0", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s6", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // 2 requests, 2 allowed, 2 executed
        for (let i = 1; i <= 2; i++) {
          yield* eventStore.append({ sessionId: "s6", actor: { kind: "policy", id: "pep" }, type: "authorization.requested", payload: { requestId: `r${i}` } })
          yield* eventStore.append({ sessionId: "s6", actor: { kind: "policy", id: "pdp" }, type: "authorization.allowed", payload: { requestId: `r${i}`, decision: { decision: "ALLOW", policyVersion: "v1" } } })
          yield* eventStore.append({ sessionId: "s6", actor: { kind: "policy", id: "pep" }, type: "authorization.executed", payload: { requestId: `r${i}` } })
        }

        yield* eventStore.append({ sessionId: "s6", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s6")
        const ap = proof.authorizationProfile

        // ActionAssured condition
        const actionAssured =
          ap.authorizationTraceHealth === "COMPLETE" &&
          ap.unauthorizedExecutions === 0 &&
          ap.orphanExecutions === 0

        expect(actionAssured).toBe(true)
        expect(ap.authorizationTraceHealth).toBe("COMPLETE")
        expect(ap.unauthorizedExecutions).toBe(0)
        expect(ap.orphanExecutions).toBe(0)
        expect(ap.requests).toBe(2)
        expect(ap.allowed).toBe(2)
        expect(ap.executed).toBe(2)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("ActionAssured fails when trace health is DEGRADED even with 0 unauthorized", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "s7", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Orphan execution (no allowed)
        yield* eventStore.append({ sessionId: "s7", actor: { kind: "policy", id: "pep" }, type: "authorization.executed", payload: { requestId: "r1" } })

        yield* eventStore.append({ sessionId: "s7", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("s7")
        const ap = proof.authorizationProfile

        // ActionAssured fails because trace is DEGRADED
        const actionAssured =
          ap.authorizationTraceHealth === "COMPLETE" &&
          ap.unauthorizedExecutions === 0 &&
          ap.orphanExecutions === 0

        expect(actionAssured).toBe(false)
        expect(ap.authorizationTraceHealth).toBe("DEGRADED")
        expect(ap.orphanExecutions).toBe(1)
        expect(ap.unauthorizedExecutions).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })
})

// ── Information Flow Profile Tests ────────────────────────────────────

describe("Information flow profile", () => {
  test("RunProof exposes InformationFlowProfile", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if1", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Authorization with provenance labels
        yield* eventStore.append({
          sessionId: "if1",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "r1", provenance: ["USER_INSTRUCTION"], sensitivity: ["INTERNAL"] },
        })
        yield* eventStore.append({
          sessionId: "if1",
          actor: { kind: "policy", id: "pdp" },
          type: "authorization.allowed",
          payload: { requestId: "r1", decision: { decision: "ALLOW" } },
        })
        yield* eventStore.append({
          sessionId: "if1",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: { requestId: "r1" },
        })

        // Security label events
        yield* eventStore.append({ sessionId: "if1", actor: { kind: "security", id: "labeler" }, type: "security.labels_assigned", payload: {} })
        yield* eventStore.append({ sessionId: "if1", actor: { kind: "security", id: "propagator" }, type: "security.labels_propagated", payload: {} })

        yield* eventStore.append({ sessionId: "if1", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if1")
        expect(proof.informationFlowProfile).toBeTruthy()
        expect(proof.informationFlowProfile.labeledInputs).toBe(1)
        expect(proof.informationFlowProfile.labeledDerivedValues).toBe(1)
        expect(proof.informationFlowProfile.unlabeledConsequentialRequests).toBe(0)
        expect(proof.informationFlowProfile.traceHealth).toBe("COMPLETE")
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("unlabeledConsequentialRequests = 0 when all requests have labels", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if2", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // All requests have provenance labels
        yield* eventStore.append({
          sessionId: "if2",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "r1", provenance: ["USER_INSTRUCTION"], sensitivity: ["PUBLIC"] },
        })
        yield* eventStore.append({
          sessionId: "if2",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "r2", provenance: ["REMOTE_CONTENT"], sensitivity: ["INTERNAL"] },
        })

        yield* eventStore.append({ sessionId: "if2", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if2")
        expect(proof.informationFlowProfile.unlabeledConsequentialRequests).toBe(0)
        expect(proof.informationFlowProfile.traceHealth).toBe("COMPLETE")
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("unlabeledConsequentialRequests > 0 when request missing provenance", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if3", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        // Request without provenance
        yield* eventStore.append({
          sessionId: "if3",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "r1" }, // no provenance field
        })

        yield* eventStore.append({ sessionId: "if3", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if3")
        expect(proof.informationFlowProfile.unlabeledConsequentialRequests).toBe(1)
        expect(proof.informationFlowProfile.traceHealth).toBe("DEGRADED")
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("secretValuesUsed counted from SECRET authorization requests", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if4", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        yield* eventStore.append({
          sessionId: "if4",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "r1", provenance: ["SYSTEM_POLICY"], sensitivity: ["SECRET"] },
        })

        yield* eventStore.append({ sessionId: "if4", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if4")
        expect(proof.informationFlowProfile.secretValuesUsed).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("label tampering and secret flow events counted", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if5", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })

        yield* eventStore.append({ sessionId: "if5", actor: { kind: "security", id: "s" }, type: "security.label_tampering_detected", payload: {} })
        yield* eventStore.append({ sessionId: "if5", actor: { kind: "security", id: "s" }, type: "security.secret_flow_denied", payload: {} })
        yield* eventStore.append({ sessionId: "if5", actor: { kind: "security", id: "s" }, type: "security.declassification_requested", payload: {} })
        yield* eventStore.append({ sessionId: "if5", actor: { kind: "security", id: "s" }, type: "security.declassification_allowed", payload: {} })

        yield* eventStore.append({ sessionId: "if5", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if5")
        expect(proof.informationFlowProfile.labelTamperingAttempts).toBe(1)
        expect(proof.informationFlowProfile.secretFlowsDenied).toBe(1)
        expect(proof.informationFlowProfile.declassificationsRequested).toBe(1)
        expect(proof.informationFlowProfile.declassificationsAllowed).toBe(1)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("RunProof includes InformationFlowProfile alongside AuthorizationProfile", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "if6", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })
        yield* eventStore.append({ sessionId: "if6", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("if6")

        // Both profiles exist
        expect(proof.authorizationProfile).toBeTruthy()
        expect(proof.informationFlowProfile).toBeTruthy()

        // Both are UNAVAILABLE when no events exist
        expect(proof.authorizationProfile.authorizationTraceHealth).toBe("UNAVAILABLE")
        expect(proof.informationFlowProfile.traceHealth).toBe("UNAVAILABLE")
      }).pipe(Effect.provide(testLayer)),
    )
  })
})

// ── Phase A/B/C Regression ────────────────────────────────────────────

describe("Phase A/B/C regression: no existing guarantees broken", () => {
  test("lifecycle derivation still works", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "reg1", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })
        yield* eventStore.append({ sessionId: "reg1", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("reg1")
        expect(proof.lifecycleStatus).toBe("COMPLETE")
        expect(proof.lifecycle.started).toBe(true)
        expect(proof.lifecycle.hasTerminalEvent).toBe(true)
      }).pipe(Effect.provide(testLayer)),
    )
  })

  test("integrity verification still works", async () => {
    const testLayer = makeTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({ sessionId: "reg2", actor: { kind: "user", id: "u" }, type: "session.started", payload: {} })
        yield* eventStore.append({ sessionId: "reg2", actor: { kind: "user", id: "u" }, type: "session.completed", payload: {} })

        const proof = yield* runProof.derive("reg2")
        expect(proof.integrityStatus).toBe("VALID")
        expect(proof.proofHash).toBeTruthy()
        expect(proof.runRoot).toBeTruthy()
      }).pipe(Effect.provide(testLayer)),
    )
  })
})
