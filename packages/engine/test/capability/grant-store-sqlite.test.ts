import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@arcana/core/database/database"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { SessionPolicyBinding } from "@arcana/core/capability/grant-store"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["process.execute"],
    resources: [{ kind: "process", pattern: "bun" }],
    constraints: {},
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
    ...overrides,
  }
}

function makeBinding(overrides: Partial<SessionPolicyBinding> = {}): SessionPolicyBinding {
  return {
    principalId: "agent:main",
    sessionId: "sess-abc",
    workspaceId: "ws-1",
    workspaceTrust: "TRUSTED",
    ...overrides,
  }
}

function makeRequest(overrides = {}) {
  return buildAuthorizationRequest({
    toolName: "terminal",
    principalId: "agent:main",
    sessionId: "sess-abc",
    args: {},
    executable: "bun",
    arguments: ["test"],
    workingDirectory: "/workspace",
    ...overrides,
  })
}

function makeTestLayer() {
  return Database.layerFromPath(":memory:")
}

function runWithDb<A, E = never>(effect: Effect.Effect<A, E, any>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())) as any)
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("SqliteGrantStore: basic CRUD", () => {
  test("putGrant and getGrantsForPrincipal round-trips", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant())
      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc", "ws-1")

      expect(grants.length).toBe(1)
      expect(grants[0].id).toBe("cap-001")
      expect(grants[0].principal.id).toBe("agent:main")
      expect(grants[0].actions).toEqual(["process.execute"])
      expect(grants[0].resources).toEqual([{ kind: "process", pattern: "bun" }])
    }))
  })

  test("revokeGrant persists across reads", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant())
      const revoked = yield* store.revokeGrant("cap-001", "evt-revoke")
      expect(revoked).toBe(true)

      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc")
      expect(grants.length).toBe(0)
    }))
  })

  test("exhaustGrant persists", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant())
      const exhausted = yield* store.exhaustGrant("cap-001")
      expect(exhausted).toBe(true)

      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc")
      expect(grants.length).toBe(0)
    }))
  })

  test("revokeGrant returns false for nonexistent grant", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      const result = yield* store.revokeGrant("nonexistent", "evt")
      expect(result).toBe(false)
    }))
  })

  test("getGrantsForPrincipal filters by principal", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant())
      const grants = yield* store.getGrantsForPrincipal("agent:other", "sess-abc")
      expect(grants.length).toBe(0)
    }))
  })

  test("getGrantsForPrincipal filters by session", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant({ constraints: { sessionId: "sess-other" } }))
      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc")
      expect(grants.length).toBe(0)
    }))
  })

  test("getGrantsForPrincipal filters by workspace", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant({ constraints: { workspaceId: "ws-other" } }))
      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc", "ws-1")
      expect(grants.length).toBe(0)
    }))
  })

  test("getGrantsForWorkspace returns workspace-scoped grants", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant({ constraints: { workspaceId: "ws-1" } }))
      yield* store.putGrant(makeGrant({ id: "cap-002", constraints: { workspaceId: "ws-2" } }))

      const ws1 = yield* store.getGrantsForWorkspace("ws-1")
      expect(ws1.length).toBe(1)
      expect(ws1[0].id).toBe("cap-001")
    }))
  })

  test("multiple grants for same principal", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant({ id: "cap-1" }))
      yield* store.putGrant(makeGrant({ id: "cap-2" }))
      yield* store.putGrant(makeGrant({ id: "cap-3" }))

      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc")
      expect(grants.length).toBe(3)
    }))
  })

  test("putGrant is idempotent (INSERT OR REPLACE)", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      yield* store.putGrant(makeGrant())
      yield* store.putGrant(makeGrant({ actions: ["filesystem.read"] }))

      const grants = yield* store.getGrantsForPrincipal("agent:main", "sess-abc")
      expect(grants.length).toBe(1)
      expect(grants[0].actions).toEqual(["filesystem.read"])
    }))
  })
})

describe("SqliteGrantStore + SessionPolicyProvider: full PEP integration", () => {
  test("no grants in database -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const result = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "should not run" },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })

  test("matching grant in database -> EXECUTED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant())

      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const result = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "executed" },
        provider,
      )
      expect(result.status).toBe("EXECUTED")
      if (result.status === "EXECUTED") {
        expect(result.value).toBe("executed")
      }
    }))
  })

  test("revoked grant -> DENIED after revocation", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant())

      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const r1 = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "first" },
        provider,
      )
      expect(r1.status).toBe("EXECUTED")

      yield* store.revokeGrant("cap-001", "evt-revoke")

      const r2 = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "second" },
        provider,
      )
      expect(r2.status).toBe("DENIED")
    }))
  })

  test("exhausted grant -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant())

      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const r1 = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "first" },
        provider,
      )
      expect(r1.status).toBe("EXECUTED")

      yield* store.exhaustGrant("cap-001")

      const r2 = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "second" },
        provider,
      )
      expect(r2.status).toBe("DENIED")
    }))
  })

  test("wrong action -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant({ actions: ["filesystem.read"] }))

      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const result = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "should not run" },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })

  test("wrong principal -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant())

      const provider = new SessionPolicyProvider(store, makeBinding({ principalId: "agent:other" }), undefined, "LEGACY_COMPAT")
      const req = makeRequest({ principalId: "agent:other" })

      const result = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "should not run" },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })

  test("tool constraint -> DENIED for wrong tool", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* store.putGrant(makeGrant({ constraints: { toolNames: ["web_fetch"] } }))

      const provider = new SessionPolicyProvider(store, makeBinding(), undefined, "LEGACY_COMPAT")
      const req = makeRequest()

      const result = yield* authorizeAndExecuteEffect(
        { request: req, executeExact: () => "should not run" },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })
})
