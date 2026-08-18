/**
 * Session retention policy — config-driven sweep.
 *
 * Covers the pure settings mapping plus the sweep rules and safety guards
 * against a real (in-memory) database, mirroring how the daemon runs it:
 * workspace scope = process.cwd(), deletions go through Session.remove.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { SessionMessage } from "@arcana/core/session/message"
import { SessionMessageTable, SessionTable } from "@arcana/core/session/sql"
import { Retention, settings } from "@/retention/retention"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { SessionID } from "@/session/schema"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { approvalStoreForWorkspace } from "@/approval/command"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer } from "../server/httpapi-layer"

const it = testEffect(
  Layer.mergeAll(
    Session.defaultLayer,
    SessionStatus.defaultLayer,
    Retention.defaultLayer,
    Database.defaultLayer,
    httpApiLayer,
  ),
)

const DAY = 86_400_000

/** Run an effect with process.cwd() pinned to the test instance directory. */
const inInstance = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const prev = process.cwd()
    process.chdir(instance.directory)
    yield* Effect.addFinalizer(() => Effect.sync(() => process.chdir(prev)))
    return yield* self
  })

const sweep = () => Retention.Service.use((svc) => svc.sweep())

const createSessions = (n: number) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const ids: SessionID[] = []
    for (let i = 0; i < n; i++) {
      const info = yield* session.create({})
      ids.push(info.id)
    }
    return ids
  })

/** Backdate a session's created/updated timestamps so the age rules see it as old. */
const backdate = (sessionId: SessionID, msAgo: number) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const ts = Date.now() - msAgo
    yield* db
      .update(SessionTable)
      .set({ time_created: ts, time_updated: ts })
      .where(eq(SessionTable.id, sessionId))
      .run()
      .pipe(Effect.orDie)
  })

const listRemaining = () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const rows = yield* db.select({ id: SessionTable.id }).from(SessionTable).all().pipe(Effect.orDie)
    return new Set(rows.map((r) => r.id))
  })

/** Seed durable conversation content through the real message table. */
const seedMessage = (sessionId: SessionID, msAgo: number) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decoded = Schema.decodeSync(SessionMessage.User)({
      id: SessionMessage.ID.create(),
      type: "user",
      text: "retention test content",
      files: [],
      agents: [],
      time: { created: Date.now() - msAgo },
    })
    const { id, type, ...data } = decoded
    yield* db
      .insert(SessionMessageTable)
      .values({
        id,
        session_id: sessionId,
        type,
        seq: 1,
        time_created: Date.now() - msAgo,
        time_updated: Date.now() - msAgo,
        data: data as never,
      })
      .run()
      .pipe(Effect.orDie)
  })

const seedApproval = (sessionId: SessionID, directory: string) =>
  Effect.gen(function* () {
    const record: ApprovalRecord = {
      approvalId: `appr_${sessionId.slice(-8)}`,
      version: 1,
      sessionId,
      workspaceId: directory,
      requestHash: `hash-${sessionId}`,
      contractRevision: 1,
      state: "PENDING",
      route: "DESKTOP_REQUIRED",
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    yield* Effect.sync(() => approvalStoreForWorkspace(directory).saveApproval(record))
  })

// ── Pure settings mapping ─────────────────────────────────────────────

describe("retention settings()", () => {
  test("returns disabled defaults for an empty config", () => {
    expect(settings(undefined)).toEqual({
      enabled: false,
      keepDays: 0,
      maxSessions: 0,
      emptyDays: 0,
      vacuum: false,
      intervalHours: 24,
    })
  })

  test("maps snake_case config keys onto settings", () => {
    expect(
      settings({
        enabled: true,
        keep_days: 30,
        max_sessions: 10,
        empty_days: 7,
        vacuum: true,
        interval_hours: 6,
      }),
    ).toEqual({
      enabled: true,
      keepDays: 30,
      maxSessions: 10,
      emptyDays: 7,
      vacuum: true,
      intervalHours: 6,
    })
  })

  test("fills individual keys from defaults", () => {
    expect(settings({ enabled: true })).toMatchObject({ enabled: true, keepDays: 0, vacuum: false })
  })
})

// ── Sweep behavior (in-memory DB, instance-scoped) ────────────────────

it.instance("disabled retention never deletes anything", () =>
  inInstance(
    Effect.gen(function* () {
      const ids = yield* createSessions(3)
      yield* backdate(ids[1], 5 * DAY)
      yield* backdate(ids[2], 10 * DAY)

      const report = yield* sweep()
      expect(report.enabled).toBe(false)
      expect(report.deleted).toBe(0)

      const remaining = yield* listRemaining()
      expect(remaining.size).toBe(3)
    }),
  ).pipe(Effect.scoped),
)

it.instance("age rule deletes sessions untouched past keep_days", () =>
  inInstance(
    Effect.gen(function* () {
      const ids = yield* createSessions(3)
      yield* backdate(ids[1], 5 * DAY)
      yield* backdate(ids[2], 10 * DAY)
      // ids[0] stays fresh → newest, kept by both the rule and the guard.

      const report = yield* sweep()
      expect(report.deleted).toBe(2)
      expect(report.skippedActive).toBe(0)

      const remaining = yield* listRemaining()
      expect(remaining.has(ids[0])).toBe(true)
      expect(remaining.has(ids[1])).toBe(false)
      expect(remaining.has(ids[2])).toBe(false)
    }),
  ).pipe(Effect.scoped),
  { config: { retention: { enabled: true, keep_days: 1 } } },
)

it.instance("count rule keeps only the newest max_sessions per directory", () =>
  inInstance(
    Effect.gen(function* () {
      const ids = yield* createSessions(4)
      // Stagger so the order is deterministic: ids[0] newest → ids[3] oldest.
      yield* backdate(ids[1], 1_000)
      yield* backdate(ids[2], 2_000)
      yield* backdate(ids[3], 3_000)

      const report = yield* sweep()
      expect(report.deleted).toBe(2)

      const remaining = yield* listRemaining()
      expect(remaining.has(ids[0])).toBe(true)
      expect(remaining.has(ids[1])).toBe(true)
      expect(remaining.has(ids[2])).toBe(false)
      expect(remaining.has(ids[3])).toBe(false)
    }),
  ).pipe(Effect.scoped),
  { config: { retention: { enabled: true, max_sessions: 2 } } },
)

it.instance("empty rule deletes old empty sessions but keeps ones with content", () =>
  inInstance(
    Effect.gen(function* () {
      const ids = yield* createSessions(3)
      yield* backdate(ids[0], 2 * DAY)
      yield* backdate(ids[1], 3 * DAY)
      yield* backdate(ids[2], 4 * DAY)
      // ids[0] has durable content → must survive the empty rule.
      yield* seedMessage(ids[0], 2 * DAY)

      const report = yield* sweep()
      expect(report.deleted).toBe(2)

      const remaining = yield* listRemaining()
      expect(remaining.has(ids[0])).toBe(true)
      expect(remaining.has(ids[1])).toBe(false)
      expect(remaining.has(ids[2])).toBe(false)
    }),
  ).pipe(Effect.scoped),
  { config: { retention: { enabled: true, empty_days: 1 } } },
)

it.instance("sweep skips sessions with PENDING approvals", () =>
  inInstance(
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const ids = yield* createSessions(3)
      // ids[0] oldest candidate, ids[1] newer but still past keep_days and
      // carrying a PENDING approval, ids[2] fresh → newest, kept by the guard.
      yield* backdate(ids[0], 6 * DAY)
      yield* backdate(ids[1], 4 * DAY)
      yield* seedApproval(ids[1], instance.directory)

      const report = yield* sweep()
      expect(report.deleted).toBe(1)
      expect(report.skippedApprovals).toBe(1)

      const remaining = yield* listRemaining()
      expect(remaining.has(ids[0])).toBe(false)
      expect(remaining.has(ids[1])).toBe(true)
      expect(remaining.has(ids[2])).toBe(true)
    }),
  ).pipe(Effect.scoped),
  { config: { retention: { enabled: true, keep_days: 1 } } },
)
