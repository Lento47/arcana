/**
 * Phase C: Atomic use counters and replay resistance tests
 */

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { Database } from "@arcana/core/database/database"
import { InMemoryGrantStore } from "@arcana/core/capability/grant-store"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import type { CapabilityGrant, ExecutionReceipt } from "@arcana/core/capability/types"

// ─── Helpers ──────────────────────────────────────────────────────────

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: "1",
    principal: { kind: "agent", id: "general" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "packages/**" }],
    constraints: { sessionId: "session-1", maxUses: 3 },
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-1",
    ...overrides,
  }
}

function makeReceipt(overrides: Partial<ExecutionReceipt> = {}): ExecutionReceipt {
  return {
    executionKey: `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    principalId: "general",
    sessionId: "session-1",
    requestHash: "hash-1",
    capabilityId: "cap-1",
    nonce: "nonce-1",
    status: "EXECUTING",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Atomic Use Counters ──────────────────────────────────────────────

describe("Atomic use counters", () => {
  it("tryConsumeUse decrements remaining uses", async () => {
    const store = new InMemoryGrantStore()
    const grant = makeGrant({ id: "use-counter-1", constraints: { sessionId: "s1", maxUses: 3 } })
    await Effect.runPromise(store.putGrant(grant))

    // First use succeeds
    const r1 = await Effect.runPromise(store.tryConsumeUse("use-counter-1", new Date().toISOString()))
    expect(r1).toBe(true)

    // Second use succeeds
    const r2 = await Effect.runPromise(store.tryConsumeUse("use-counter-1", new Date().toISOString()))
    expect(r2).toBe(true)

    // Third use succeeds
    const r3 = await Effect.runPromise(store.tryConsumeUse("use-counter-1", new Date().toISOString()))
    expect(r3).toBe(true)

    // Fourth use fails — exhausted
    const r4 = await Effect.runPromise(store.tryConsumeUse("use-counter-1", new Date().toISOString()))
    expect(r4).toBe(false)
  })

  it("tryConsumeUse fails on revoked grant", async () => {
    const store = new InMemoryGrantStore()
    const grant = makeGrant({ id: "revoked-use", status: "REVOKED" })
    await Effect.runPromise(store.putGrant(grant))

    const result = await Effect.runPromise(store.tryConsumeUse("revoked-use", new Date().toISOString()))
    expect(result).toBe(false)
  })

  it("tryConsumeUse fails on expired grant", async () => {
    const store = new InMemoryGrantStore()
    const pastDate = new Date(Date.now() - 10000).toISOString()
    const grant = makeGrant({ id: "expired-use", constraints: { sessionId: "s1", maxUses: 5, expiresAt: pastDate } })
    await Effect.runPromise(store.putGrant(grant))

    const result = await Effect.runPromise(store.tryConsumeUse("expired-use", new Date().toISOString()))
    expect(result).toBe(false)
  })

  it("tryConsumeUse fails on non-existent grant", async () => {
    const store = new InMemoryGrantStore()
    const result = await Effect.runPromise(store.tryConsumeUse("nonexistent", new Date().toISOString()))
    expect(result).toBe(false)
  })
})

describe("SQLite atomic use counters", () => {
  const runWithDb = <A, E>(effect: Effect.Effect<A, E, Database.Service>) =>
    Effect.runPromise(effect.pipe(Effect.provide(Database.layerFromPath(":memory:"))))

  it("tryConsumeUse decrements remaining uses exactly like the in-memory store", async () => {
    await runWithDb(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const store = new SqliteGrantStore(database)
        const grant = makeGrant({
          id: "sqlite-use-counter-1",
          constraints: { sessionId: "s1", maxUses: 3 },
        })
        yield* store.putGrant(grant)
        const now = new Date().toISOString()

        expect(yield* store.tryConsumeUse(grant.id, now)).toBe(true)
        expect(yield* store.tryConsumeUse(grant.id, now)).toBe(true)
        expect(yield* store.tryConsumeUse(grant.id, now)).toBe(true)
        // Fourth use fails — exhausted.
        expect(yield* store.tryConsumeUse(grant.id, now)).toBe(false)
      }),
    )
  })

  it("tryConsumeUse fails on revoked, expired, and non-existent grants", async () => {
    await runWithDb(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const store = new SqliteGrantStore(database)
        const revoked = makeGrant({ id: "sqlite-revoked", status: "REVOKED" })
        yield* store.putGrant(revoked)
        const expired = makeGrant({
          id: "sqlite-expired",
          constraints: {
            sessionId: "s1",
            maxUses: 5,
            expiresAt: new Date(Date.now() - 10_000).toISOString(),
          },
        })
        yield* store.putGrant(expired)
        const now = new Date().toISOString()

        expect(yield* store.tryConsumeUse("sqlite-revoked", now)).toBe(false)
        expect(yield* store.tryConsumeUse("sqlite-expired", now)).toBe(false)
        expect(yield* store.tryConsumeUse("sqlite-missing", now)).toBe(false)
      }),
    )
  })

  it("getActiveGrantsForSession returns only ACTIVE grants for the session", async () => {
    await runWithDb(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const store = new SqliteGrantStore(database)
        yield* store.putGrant(
          makeGrant({ id: "grant-session-a", constraints: { sessionId: "session-a", maxUses: 2 } }),
        )
        yield* store.putGrant(
          makeGrant({
            id: "grant-session-a-revoked",
            constraints: { sessionId: "session-a" },
            status: "REVOKED",
          }),
        )
        yield* store.putGrant(
          makeGrant({ id: "grant-session-b", constraints: { sessionId: "session-b" } }),
        )

        const grants = yield* store.getActiveGrantsForSession("session-a")
        expect(grants.map((grant) => grant.id)).toEqual(["grant-session-a"])
      }),
    )
  })
})

// ─── Replay Resistance ────────────────────────────────────────────────

describe("Replay resistance via execution receipts", () => {
  it("first execution succeeds, second is detected as replay", async () => {
    const store = new InMemoryGrantStore()
    const key = "exec-key-1"
    const receipt = makeReceipt({ executionKey: key })

    // First record succeeds
    const r1 = await Effect.runPromise(store.recordExecution(key, receipt))
    expect(r1).toBe(true)

    // Second record fails — replay detected
    const r2 = await Effect.runPromise(store.recordExecution(key, receipt))
    expect(r2).toBe(false)
  })

  it("hasExecution detects existing execution", async () => {
    const store = new InMemoryGrantStore()
    const key = "exec-key-2"
    const receipt = makeReceipt({ executionKey: key })

    // Before recording
    const before = await Effect.runPromise(store.hasExecution(key))
    expect(before).toBe(false)

    // After recording
    await Effect.runPromise(store.recordExecution(key, receipt))
    const after = await Effect.runPromise(store.hasExecution(key))
    expect(after).toBe(true)
  })

  it("different keys are independent", async () => {
    const store = new InMemoryGrantStore()
    const receipt1 = makeReceipt({ executionKey: "key-a" })
    const receipt2 = makeReceipt({ executionKey: "key-b" })

    await Effect.runPromise(store.recordExecution("key-a", receipt1))
    await Effect.runPromise(store.recordExecution("key-b", receipt2))

    expect(await Effect.runPromise(store.hasExecution("key-a"))).toBe(true)
    expect(await Effect.runPromise(store.hasExecution("key-b"))).toBe(true)
    expect(await Effect.runPromise(store.hasExecution("key-c"))).toBe(false)
  })
})
