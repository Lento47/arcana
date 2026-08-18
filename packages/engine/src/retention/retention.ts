/**
 * Session retention policy.
 *
 * The session store (`opencode.db`) grows forever: parts, messages and session
 * rows are written but nothing ever prunes them. This module implements a
 * config-driven retention sweep that deletes old / excess / empty sessions for
 * the current workspace, so the store stops accumulating junk.
 *
 * Policy (all opt-in — nothing is deleted unless `retention.enabled` is true):
 *
 *   retention: {
 *     enabled: true,          // master switch (default: false)
 *     keep_days: 90,          // delete sessions not touched for N days (0 = off)
 *     max_sessions: 50,       // keep at most N most-recent sessions per dir (0 = off)
 *     empty_days: 30,         // delete empty sessions (no messages) after N days (0 = off)
 *     vacuum: false,          // run wal_checkpoint(TRUNCATE) + VACUUM after a sweep
 *     interval_hours: 24,     // how often the sweep runs (0 = once at engine start)
 *   }
 *
 * Safety guards (never delete):
 *   - sessions currently running (SessionStatus busy/retry)
 *   - sessions with PENDING approvals (approval store per workspace)
 *   - the most-recently-updated session in each directory (the likely-active one)
 *   - sessions that have children (a tree root; removing it would take the
 *     whole subagent tree with it)
 *
 * Deletion goes through the sanctioned `Session.remove` path, so children,
 * background jobs, event-sourcing rows and the TUI sync all stay consistent.
 */

import { desc, eq, inArray } from "drizzle-orm"
import { Context, Duration, Effect, Layer, Exit } from "effect"
import { existsSync } from "node:fs"
import { Database } from "@arcana/core/database/database"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "@arcana/core/session/sql"
import { approvalDbPath, approvalStoreForWorkspace, resolveApprovalWorkspaceCwd } from "@/approval/command"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionStatus } from "@/session/status"

const DAY_MS = 86_400_000
/** When no interval is configured, check every 24h regardless (cheap no-op when disabled). */
const DEFAULT_INTERVAL_HOURS = 24

export interface RetentionSettings {
  readonly enabled: boolean
  readonly keepDays: number
  readonly maxSessions: number
  readonly emptyDays: number
  readonly vacuum: boolean
  readonly intervalHours: number
}

export const defaultSettings: RetentionSettings = {
  enabled: false,
  keepDays: 0,
  maxSessions: 0,
  emptyDays: 0,
  vacuum: false,
  intervalHours: DEFAULT_INTERVAL_HOURS,
}

type RetentionConfig =
  | {
      enabled?: boolean
      keep_days?: number
      max_sessions?: number
      empty_days?: number
      vacuum?: boolean
      interval_hours?: number
    }
  | undefined

export function settings(retention: RetentionConfig): RetentionSettings {
  return {
    enabled: retention?.enabled ?? defaultSettings.enabled,
    keepDays: retention?.keep_days ?? defaultSettings.keepDays,
    maxSessions: retention?.max_sessions ?? defaultSettings.maxSessions,
    emptyDays: retention?.empty_days ?? defaultSettings.emptyDays,
    vacuum: retention?.vacuum ?? defaultSettings.vacuum,
    intervalHours: retention?.interval_hours ?? defaultSettings.intervalHours,
  }
}

export type SweepReport = {
  readonly enabled: boolean
  readonly scanned: number
  readonly deleted: number
  readonly skippedActive: number
  readonly skippedApprovals: number
  readonly skippedWithChildren: number
  readonly vacuumed: boolean
}

export interface Interface {
  readonly sweep: () => Effect.Effect<SweepReport>
  readonly settings: () => Effect.Effect<RetentionSettings>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/Retention") {}

/** How many sessions to load in one pass (bounded so a huge store can't blow memory). */
const SELECT_LIMIT = 5_000

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const { db } = yield* Database.Service
    const session = yield* Session.Service
    const status = yield* SessionStatus.Service

    const sweep = Effect.fn("Retention.sweep")(function* () {
      const info = yield* config.get()
      const s = settings(info.retention)
      if (!s.enabled) {
        return { enabled: false, scanned: 0, deleted: 0, skippedActive: 0, skippedApprovals: 0, skippedWithChildren: 0, vacuumed: false }
      }
      if (s.keepDays <= 0 && s.maxSessions <= 0 && s.emptyDays <= 0) {
        return { enabled: true, scanned: 0, deleted: 0, skippedActive: 0, skippedApprovals: 0, skippedWithChildren: 0, vacuumed: false }
      }

      const directory = resolveApprovalWorkspaceCwd()
      const now = Date.now()

      // Scope to the current workspace so a daemon for project A never
      // garbage-collects project B's sessions.
      const rows = yield* db
        .select()
        .from(SessionTable)
        .where(eq(SessionTable.directory, directory))
        .orderBy(desc(SessionTable.time_updated))
        .limit(SELECT_LIMIT)
        .all()
        .pipe(Effect.orDie)

      if (rows.length === 0) {
        return { enabled: true, scanned: 0, deleted: 0, skippedActive: 0, skippedApprovals: 0, skippedWithChildren: 0, vacuumed: false }
      }

      // Never delete a session that has children — it is a tree root and
      // removing it would cascade-delete the whole subagent tree.
      const withChildren = new Set<string>(rows.filter((r) => r.parent_id).map((r) => r.parent_id!))

      // Never delete the most-recent session in the directory — that is the
      // one the operator is most likely looking at.
      const newestID = rows[0]?.id

      const statuses = yield* status.list()
      const running = new Set<string>()
      for (const [id, info] of statuses) {
        if (info.type === "busy" || info.type === "retry") running.add(id)
      }

      // PENDING approvals: consult the durable store only when it exists
      // (creating it just to check would be a side effect).
      const storePath = approvalDbPath(directory)
      const approvalStore = existsSync(storePath) ? approvalStoreForWorkspace(directory) : undefined
      const pendingApprovalSessions = new Set<string>()
      if (approvalStore) {
        for (const record of approvalStore.loadAllApprovals()) {
          if (record.state === "PENDING") pendingApprovalSessions.add(record.sessionId)
        }
      }

      // ── Rule 1: age — sessions not touched in keepDays ────────────────
      const ageCandidates = new Set<string>()
      if (s.keepDays > 0) {
        const cutoff = now - s.keepDays * DAY_MS
        for (const r of rows) if (r.time_updated < cutoff) ageCandidates.add(r.id)
      }

      // ── Rule 2: count — keep at most maxSessions per directory ────────
      const countCandidates = new Set<string>()
      if (s.maxSessions > 0) {
        const byDir = new Map<string, typeof rows>()
        for (const row of rows) {
          const list = byDir.get(row.directory) ?? []
          list.push(row)
          byDir.set(row.directory, list)
        }
        for (const list of byDir.values()) {
          // Rows are ordered by time_updated desc within each directory too
          // (global order by), so slice keeps the newest maxSessions.
          const keep = new Set(list.slice(0, s.maxSessions).map((r) => r.id))
          for (const row of list) if (!keep.has(row.id)) countCandidates.add(row.id)
        }
      }

      // ── Rule 3: empty — sessions with no messages older than emptyDays ─
      const emptyCandidates = new Set<string>()
      if (s.emptyDays > 0) {
        const cutoff = now - s.emptyDays * DAY_MS
        const candidates = rows.filter((r) => r.time_created < cutoff).map((r) => r.id)
        if (candidates.length > 0) {
          const [messages, parts, v2messages] = yield* Effect.all(
            [
              db.select({ session_id: MessageTable.session_id }).from(MessageTable).where(inArray(MessageTable.session_id, candidates)).all(),
              db.select({ session_id: PartTable.session_id }).from(PartTable).where(inArray(PartTable.session_id, candidates)).all(),
              db.select({ session_id: SessionMessageTable.session_id }).from(SessionMessageTable).where(inArray(SessionMessageTable.session_id, candidates)).all(),
            ],
            { concurrency: 3 },
          ).pipe(Effect.orDie)
          const hasContent = new Set<string>()
          for (const row of messages) hasContent.add(row.session_id)
          for (const row of parts) hasContent.add(row.session_id)
          for (const row of v2messages) hasContent.add(row.session_id)
          for (const id of candidates) if (!hasContent.has(id)) emptyCandidates.add(id)
        }
      }

      // ── Union + guards ────────────────────────────────────────────────
      const candidates = new Set([...ageCandidates, ...countCandidates, ...emptyCandidates])

      let deleted = 0
      let skippedActive = 0
      let skippedApprovals = 0
      let skippedWithChildren = 0

      for (const id of candidates) {
        if (id === newestID || running.has(id)) {
          skippedActive++
          continue
        }
        if (withChildren.has(id)) {
          skippedWithChildren++
          continue
        }
        if (pendingApprovalSessions.has(id)) {
          skippedApprovals++
          continue
        }
        const removed = yield* session.remove(SessionID.descending(id)).pipe(
          Effect.exit,
          Effect.map((exit) => Exit.isSuccess(exit)),
          Effect.catch(() => Effect.succeed(false)),
        )
        if (removed) deleted++
      }

      let vacuumed = false
      if (s.vacuum && deleted > 0) {
        yield* db.run("PRAGMA wal_checkpoint(TRUNCATE)").pipe(Effect.orDie)
        yield* db.run("VACUUM").pipe(Effect.orDie)
        vacuumed = true
      }

      if (deleted > 0) {
        yield* Effect.logInfo("retention sweep deleted sessions", {
          deleted,
          skippedActive,
          skippedApprovals,
          skippedWithChildren,
          directory,
          keepDays: s.keepDays,
          maxSessions: s.maxSessions,
          emptyDays: s.emptyDays,
        })
      }

      return {
        enabled: true,
        scanned: rows.length,
        deleted,
        skippedActive,
        skippedApprovals,
        skippedWithChildren,
        vacuumed,
      }
    })

    // Automatic loop: sweep at engine start, then every intervalHours. When
    // retention is disabled the sweep is a cheap no-op; re-reading config each
    // iteration picks up config edits without an engine restart.
    const loop = Effect.gen(function* () {
      for (;;) {
        yield* sweep().pipe(Effect.ignore)
        const info = yield* config.get()
        const s = settings(info.retention)
        const hours = s.intervalHours > 0 ? s.intervalHours : DEFAULT_INTERVAL_HOURS
        yield* Effect.sleep(Duration.hours(hours))
      }
    })
    yield* loop.pipe(Effect.forkScoped)

    return Service.of({
      sweep,
      settings: () => Effect.map(config.get(), (info) => settings(info.retention)),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(SessionStatus.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Database.defaultLayer),
)

export const node = LayerNode.make(layer, [Config.node, Database.node, Session.node, SessionStatus.node])

export * as Retention from "./retention"
