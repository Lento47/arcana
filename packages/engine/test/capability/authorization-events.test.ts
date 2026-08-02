import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@arcana/core/database/database"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { AuthorizationEventEmitter } from "@arcana/core/capability/pep"
import type { CapabilityGrant } from "@arcana/core/capability/types"

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

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["process.execute"],
    resources: [{ kind: "process", pattern: "*" }],
    constraints: {},
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
    ...overrides,
  }
}

function makeRequest(overrides = {}) {
  return buildAuthorizationRequest({
    toolName: "terminal",
    principalId: "agent:main",
    sessionId: "sess-001",
    args: { command: "bun test" },
    executable: "bun",
    ...overrides,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Authorization events: PEP emits events", () => {
  test("authorization.requested + authorization.denied for empty store", async () => {
    const dbLayer = Database.layerFromPath(":memory:")
    const testLayer = Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)))

    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const store = new SqliteGrantStore({ db })
        const provider = new SessionPolicyProvider(store, {
          principalId: "agent:main",
          sessionId: "sess-001",
          workspaceTrust: "TRUSTED",
        }, undefined, "LEGACY_COMPAT")

        // Create an event emitter that writes to the EventStore
        const emitter: AuthorizationEventEmitter = {
          emit: (event) =>
            eventStore.append({
              sessionId: event.sessionId,
              actor: event.actor as any,
              type: event.type as any,
              payload: event.payload,
            }).pipe(Effect.catch(() => Effect.void)),
        }

        const request = makeRequest({
          provenance: ["USER_INSTRUCTION", "ACTIVE_CONTRACT"],
          sensitivity: ["INTERNAL"],
          contractId: "contract-event-evidence",
          contractRevision: "4",
          criterionIds: ["criterion-event-evidence"],
        })
        const result = yield* authorizeAndExecuteEffect(
          { request, executeExact: () => "should not run" },
          provider,
          emitter,
        )

        expect(result.status).toBe("DENIED")

        // Verify events were emitted
        const events = yield* eventStore.list(100)
        const authEvents = events.filter((e) => e.type.startsWith("authorization."))
        expect(authEvents.length).toBeGreaterThanOrEqual(2)

        // Should have authorization.requested
        const requested = authEvents.find((e) => e.type === "authorization.requested")
        expect(requested).toBeTruthy()
        const requestedPayload = requested!.payload as any
        expect(requestedPayload.requestId).toBe(request.requestId)
        expect(requestedPayload.provenance).toEqual(["USER_INSTRUCTION", "ACTIVE_CONTRACT"])
        expect(requestedPayload.sensitivity).toEqual(["INTERNAL"])
        expect(requestedPayload.contractId).toBe("contract-event-evidence")
        expect(requestedPayload.contractRevision).toBe("4")
        expect(requestedPayload.criterionIds).toEqual(["criterion-event-evidence"])

        // Should have authorization.denied
        const denied = authEvents.find((e) => e.type === "authorization.denied")
        expect(denied).toBeTruthy()
        expect((denied!.payload as any).decision.decision).toBe("DENY")
      }).pipe(Effect.provide(testLayer)) as any,
    )
  })

  test("authorization.requested + authorization.allowed + authorization.executed for matching grant", async () => {
    const dbLayer = Database.layerFromPath(":memory:")
    const testLayer = Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)))

    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const store = new SqliteGrantStore({ db })
        yield* store.putGrant(makeGrant())

        const provider = new SessionPolicyProvider(store, {
          principalId: "agent:main",
          sessionId: "sess-001",
          workspaceTrust: "TRUSTED",
        }, undefined, "LEGACY_COMPAT")

        const emitter: AuthorizationEventEmitter = {
          emit: (event) =>
            eventStore.append({
              sessionId: event.sessionId,
              actor: event.actor as any,
              type: event.type as any,
              payload: event.payload,
            }).pipe(Effect.catch(() => Effect.void)),
        }

        const request = makeRequest()
        const result = yield* authorizeAndExecuteEffect(
          { request, executeExact: () => "executed" },
          provider,
          emitter,
        )

        expect(result.status).toBe("EXECUTED")

        // Verify events
        const events = yield* eventStore.list(100)
        const authEvents = events.filter((e) => e.type.startsWith("authorization."))

        const requested = authEvents.find((e) => e.type === "authorization.requested")
        expect(requested).toBeTruthy()

        const allowed = authEvents.find((e) => e.type === "authorization.allowed")
        expect(allowed).toBeTruthy()
        expect((allowed!.payload as any).decision.decision).toBe("ALLOW")

        const executed = authEvents.find((e) => e.type === "authorization.executed")
        expect(executed).toBeTruthy()
      }).pipe(Effect.provide(testLayer)) as any,
    )
  })

  test("authorization.approval_required for CRITICAL action", async () => {
    const dbLayer = Database.layerFromPath(":memory:")
    const testLayer = Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer)))

    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        yield* createTables(db)
        const eventStore = yield* EventStore.Service
        const store = new SqliteGrantStore({ db })
        yield* store.putGrant(makeGrant({
          actions: ["git.push"],
          resources: [{ kind: "git", pattern: "*" }],
        }))

        const provider = new SessionPolicyProvider(store, {
          principalId: "agent:main",
          sessionId: "sess-001",
          workspaceTrust: "TRUSTED",
        }, undefined, "LEGACY_COMPAT")

        const emitter: AuthorizationEventEmitter = {
          emit: (event) =>
            eventStore.append({
              sessionId: event.sessionId,
              actor: event.actor as any,
              type: event.type as any,
              payload: event.payload,
            }).pipe(Effect.catch(() => Effect.void)),
        }

        const request = buildAuthorizationRequest({
          toolName: "git_push",
          principalId: "agent:main",
          sessionId: "sess-001",
          args: {},
        })

        const result = yield* authorizeAndExecuteEffect(
          { request, executeExact: () => "should not run" },
          provider,
          emitter,
        )

        expect(result.status).toBe("APPROVAL_REQUIRED")

        // Verify approval_required event
        const events = yield* eventStore.list(100)
        const authEvents = events.filter((e) => e.type.startsWith("authorization."))
        const approval = authEvents.find((e) => e.type === "authorization.approval_required")
        expect(approval).toBeTruthy()
      }).pipe(Effect.provide(testLayer)) as any,
    )
  })
})

describe("Authorization events: RunProof integration", () => {
  test("RunProof derives AuthorizationProfile from authorization events", async () => {
    const testLayer = makeTestLayer()

    await Effect.runPromise(
      Effect.gen(function* () {
        const { db: _db } = yield* Database.Service
        yield* createTables(_db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        // Insert session lifecycle events
        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "user", id: "user:owner" },
          type: "session.started",
          payload: {},
        })

        // Insert authorization events
        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "req-1", tool: "terminal", action: "process.execute" },
        })

        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "policy", id: "pdp" },
          type: "authorization.allowed",
          payload: { requestId: "req-1", decision: { decision: "ALLOW", policyVersion: "phase-c-v1" } },
        })

        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: { requestId: "req-1" },
        })

        // Insert a denied request
        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "policy", id: "pep" },
          type: "authorization.requested",
          payload: { requestId: "req-2", tool: "write_file", action: "filesystem.write" },
        })

        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "policy", id: "pdp" },
          type: "authorization.denied",
          payload: { requestId: "req-2", decision: { decision: "DENY", policyVersion: "phase-c-v1" } },
        })

        // Complete session
        yield* eventStore.append({
          sessionId: "sess-auth-001",
          actor: { kind: "user", id: "user:owner" },
          type: "session.completed",
          payload: {},
        })

        // Derive RunProof
        const proof = yield* runProof.derive("sess-auth-001")

        // Verify AuthorizationProfile
        expect(proof.authorizationProfile).toBeTruthy()
        expect(proof.authorizationProfile.requests).toBe(2)
        expect(proof.authorizationProfile.allowed).toBe(1)
        expect(proof.authorizationProfile.denied).toBe(1)
        expect(proof.authorizationProfile.executed).toBe(1)
        expect(proof.authorizationProfile.unauthorizedExecutions).toBe(0)
        expect(proof.authorizationProfile.capabilityViolations).toBe(1)
        expect(proof.authorizationProfile.policyVersions).toContain("phase-c-v1")
      }).pipe(Effect.provide(testLayer)) as any,
    )
  })

  test("unauthorizedExecutions = 0 when all executions had prior authorization", async () => {
    const testLayer = makeTestLayer()

    await Effect.runPromise(
      Effect.gen(function* () {
        const { db: _db } = yield* Database.Service
        yield* createTables(_db)
        const eventStore = yield* EventStore.Service
        const runProof = yield* RunProof.Service

        yield* eventStore.append({
          sessionId: "sess-auth-002",
          actor: { kind: "user", id: "user:owner" },
          type: "session.started",
          payload: {},
        })

        // 3 requests, 3 allowed, 3 executed
        for (let i = 1; i <= 3; i++) {
          yield* eventStore.append({
            sessionId: "sess-auth-002",
            actor: { kind: "policy", id: "pep" },
            type: "authorization.requested",
            payload: { requestId: `req-${i}` },
          })
          yield* eventStore.append({
            sessionId: "sess-auth-002",
            actor: { kind: "policy", id: "pdp" },
            type: "authorization.allowed",
            payload: { requestId: `req-${i}`, decision: { decision: "ALLOW", policyVersion: "phase-c-v1" } },
          })
          yield* eventStore.append({
            sessionId: "sess-auth-002",
            actor: { kind: "policy", id: "pep" },
            type: "authorization.executed",
            payload: { requestId: `req-${i}` },
          })
        }

        yield* eventStore.append({
          sessionId: "sess-auth-002",
          actor: { kind: "user", id: "user:owner" },
          type: "session.completed",
          payload: {},
        })

        const proof = yield* runProof.derive("sess-auth-002")

        expect(proof.authorizationProfile.requests).toBe(3)
        expect(proof.authorizationProfile.allowed).toBe(3)
        expect(proof.authorizationProfile.executed).toBe(3)
        expect(proof.authorizationProfile.unauthorizedExecutions).toBe(0)
        expect(proof.authorizationProfile.denied).toBe(0)
        expect(proof.authorizationProfile.capabilityViolations).toBe(0)
      }).pipe(Effect.provide(testLayer)) as any,
    )
  })
})
