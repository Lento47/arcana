import { Effect, Context, Layer } from "effect"
import { and, desc, eq, like, or } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { EventTable } from "@arcana/core/epistemic/event-sql"
import { TraceHealthTable } from "@arcana/core/epistemic/trace-health-sql"
import { computeEventHash } from "@arcana/core/epistemic/event-hash"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"
import { GovernanceEvent } from "./governance-event"

/** Per-session trace integrity status. */
export type TraceStatus = "COMPLETE" | "DEGRADED" | "UNAVAILABLE"

export interface SessionTraceHealth {
  readonly sessionId: string
  readonly status: TraceStatus
  readonly expectedCriticalEvents: number
  readonly recordedCriticalEvents: number
  readonly recordingErrors: ReadonlyArray<TraceRecordingError>
}

export interface TraceRecordingError {
  readonly timestamp: string
  readonly error: string
}

export interface TraceInfo {
  readonly status: TraceStatus
  readonly errorCount: number
  readonly lastError: string | undefined
  readonly eventCount: number
}

export type Listener = (event: ArcanaEvent) => Effect.Effect<void, unknown>
export type Unsubscribe = Effect.Effect<void>

export interface Interface {
  readonly append: (input: {
    sessionId?: string
    actor: ArcanaEvent["actor"]
    type: ArcanaEvent["type"]
    payload: unknown
  }) => Effect.Effect<ArcanaEvent>
  readonly list: (limit?: number) => Effect.Effect<ArcanaEvent[]>
  readonly listGovernance: (sessionId: string, limit?: number) => Effect.Effect<ArcanaEvent[]>
  readonly listType: (sessionId: string, type: ArcanaEvent["type"], limit?: number) => Effect.Effect<ArcanaEvent[]>
  readonly listen: (listener: Listener) => Effect.Effect<Unsubscribe>
  readonly verify: () => Effect.Effect<{ valid: boolean; breaksAt?: number }>
  readonly traceInfo: () => Effect.Effect<TraceInfo>
  readonly sessionTraceHealth: (sessionId: string) => Effect.Effect<SessionTraceHealth>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/EventStore") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const listeners = new Set<Listener>()

    // In-memory operational counters (not authoritative for proof)
    let errorCount = 0
    let lastError: string | undefined = undefined

    const append = Effect.fn("EventStore.append")(function* (input) {
      return yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const lastRow = yield* tx.select().from(EventTable)
            .orderBy(desc(EventTable.sequence))
            .limit(1)
            .pipe(Effect.orDie)

          const previousHash = lastRow[0]?.hash ?? null
          const sequence = (lastRow[0]?.sequence ?? -1) + 1
          const id = randomUUID()
          const timestamp = new Date().toISOString()
          const payloadJson = JSON.stringify(input.payload)
          const hash = computeEventHash({
            id, sequence, timestamp, previousHash,
            actorKind: input.actor.kind, actorId: input.actor.id,
            type: input.type, payload: payloadJson,
          })

          yield* tx.insert(EventTable).values({
            id,
            sequence,
            session_id: input.sessionId ?? null,
            timestamp,
            previous_hash: previousHash,
            hash,
            actor_kind: input.actor.kind,
            actor_id: input.actor.id,
            type: input.type,
            payload: payloadJson,
          }).pipe(Effect.orDie)

          // Persist per-session trace health on success
          if (input.sessionId) {
            yield* incrementRecordedEvents(tx, input.sessionId)
          }

          return {
            id,
            sequence,
            sessionId: input.sessionId,
            timestamp,
            previousHash,
            hash,
            actor: input.actor,
            type: input.type,
            payload: input.payload,
          } as ArcanaEvent
        }), { behavior: "immediate" })
    })

    // Wrap append to track errors and persist degraded trace health
    const notifyListeners = (event: ArcanaEvent) =>
      Effect.forEach(
        listeners,
        (listener) =>
          listener(event).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("EventStore listener failed", { eventID: event.id, eventType: event.type, cause }),
            ),
          ),
        { discard: true },
      )

    const trackedAppend = Effect.fn("EventStore.append.tracked")(function* (input: Parameters<typeof append>[0]) {
      const event = yield* append(input).pipe(
        Effect.catch((error) => {
          errorCount++
          lastError = String(error)
          // Persist degraded trace health for this session
          if (input.sessionId) {
            return persistTraceError(input.sessionId, String(error)).pipe(
              Effect.flatMap(() => Effect.fail(error as any)),
              Effect.catch(() => Effect.fail(error as any)),
            )
          }
          return Effect.fail(error as any)
        }),
      )
      // Observation is strictly post-commit and isolated. A TUI/SSE listener
      // can never turn a recorded authorization decision into a failed append.
      yield* notifyListeners(event)
      return event
    })

    /** Persist a recording error for a session's trace health. */
    const persistTraceError = (sessionId: string, error: string) =>
      Effect.gen(function* () {
        const timestamp = new Date().toISOString()
        const existing = yield* db.select().from(TraceHealthTable)
          .where(eq(TraceHealthTable.session_id, sessionId))
          .limit(1)
          .pipe(Effect.orDie)
        if (existing.length > 0) {
          const row = existing[0]!
          const prevErrors: TraceRecordingError[] = (() => {
            try { return JSON.parse(row.last_error ?? "[]") } catch { return [] }
          })()
          const errors = [...prevErrors, { timestamp, error }].slice(-20) // keep last 20
          yield* db.update(TraceHealthTable).set({
            status: "DEGRADED",
            error_count: row.error_count + 1,
            last_error: JSON.stringify(errors),
            updated_at: timestamp,
          }).where(eq(TraceHealthTable.session_id, sessionId)).pipe(Effect.orDie)
        } else {
          yield* db.insert(TraceHealthTable).values({
            session_id: sessionId,
            status: "DEGRADED",
            error_count: 1,
            last_error: JSON.stringify([{ timestamp, error }]),
            recorded_events: 0,
            updated_at: timestamp,
          }).pipe(Effect.orDie)
        }
      })

    /** Increment recorded event count for a session (called inside transaction). */
    const incrementRecordedEvents = (tx: any, sessionId: string) =>
      Effect.gen(function* () {
        const timestamp = new Date().toISOString()
        const existing = yield* tx.select().from(TraceHealthTable)
          .where(eq(TraceHealthTable.session_id, sessionId))
          .limit(1)
          .pipe(Effect.orDie)
        if (existing.length > 0) {
          const row = existing[0]!
          // Only update to COMPLETE if not already DEGRADED
          const newStatus = row.status === "DEGRADED" ? "DEGRADED" : "COMPLETE"
          yield* tx.update(TraceHealthTable).set({
            recorded_events: row.recorded_events + 1,
            status: newStatus,
            updated_at: timestamp,
          }).where(eq(TraceHealthTable.session_id, sessionId)).pipe(Effect.orDie)
        } else {
          yield* tx.insert(TraceHealthTable).values({
            session_id: sessionId,
            status: "COMPLETE",
            error_count: 0,
            last_error: null,
            recorded_events: 1,
            updated_at: timestamp,
          }).pipe(Effect.orDie)
        }
      })

    const list = Effect.fn("EventStore.list")(function* (limit = 20) {
      const rows = yield* db.select().from(EventTable)
        .orderBy(desc(EventTable.sequence))
        .limit(limit)
        .pipe(Effect.orDie)
      return rows.reverse().map((r) => ({
        id: r.id, sequence: r.sequence, sessionId: r.session_id ?? undefined,
        timestamp: r.timestamp,
        previousHash: r.previous_hash, hash: r.hash,
        actor: { kind: r.actor_kind as ArcanaEvent["actor"]["kind"], id: r.actor_id },
        type: r.type as ArcanaEvent["type"],
        payload: JSON.parse(r.payload),
      }))
    })

    const listGovernance = Effect.fn("EventStore.listGovernance")(function* (sessionId: string, limit = 500) {
      const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1_000))
      const rows = yield* db.select().from(EventTable)
        .where(
          and(
            eq(EventTable.session_id, sessionId),
            or(...GovernanceEvent.prefixes.map((prefix) => like(EventTable.type, `${prefix}%`))),
          ),
        )
        .orderBy(desc(EventTable.sequence))
        .limit(boundedLimit)
        .pipe(Effect.orDie)
      return rows.reverse().map((r) => ({
        id: r.id, sequence: r.sequence, sessionId: r.session_id ?? undefined,
        timestamp: r.timestamp,
        previousHash: r.previous_hash, hash: r.hash,
        actor: { kind: r.actor_kind as ArcanaEvent["actor"]["kind"], id: r.actor_id },
        type: r.type as ArcanaEvent["type"],
        payload: JSON.parse(r.payload),
      }))
    })

    /** Durable idempotency query: events of one type for a session. */
    const listType = Effect.fn("EventStore.listType")(function* (
      sessionId: string,
      type: ArcanaEvent["type"],
      limit = 50,
    ) {
      const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1_000))
      const rows = yield* db.select().from(EventTable)
        .where(and(eq(EventTable.session_id, sessionId), eq(EventTable.type, type)))
        .orderBy(desc(EventTable.sequence))
        .limit(boundedLimit)
        .pipe(Effect.orDie)
      return rows.reverse().map((r) => ({
        id: r.id, sequence: r.sequence, sessionId: r.session_id ?? undefined,
        timestamp: r.timestamp,
        previousHash: r.previous_hash, hash: r.hash,
        actor: { kind: r.actor_kind as ArcanaEvent["actor"]["kind"], id: r.actor_id },
        type: r.type as ArcanaEvent["type"],
        payload: JSON.parse(r.payload),
      }))
    })

    const listen = (listener: Listener): Effect.Effect<Unsubscribe> =>
      Effect.sync(() => {
        listeners.add(listener)
        return Effect.sync(() => {
          listeners.delete(listener)
        })
      })

    const verify = Effect.fn("EventStore.verify")(function* () {
      const rows = yield* db.select().from(EventTable)
        .orderBy(desc(EventTable.sequence))
        .pipe(Effect.orDie)
      const events = rows.reverse()
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!
        const computed = computeEventHash({
          id: e.id, sequence: e.sequence, timestamp: e.timestamp, previousHash: e.previous_hash,
          actorKind: e.actor_kind, actorId: e.actor_id, type: e.type, payload: e.payload,
        })
        if (computed !== e.hash) return { valid: false, breaksAt: e.sequence }
        if (i > 0 && e.previous_hash !== events[i - 1]!.hash) {
          return { valid: false, breaksAt: e.sequence }
        }
      }
      return { valid: true }
    })

    const traceInfo = Effect.fn("EventStore.traceInfo")(function* () {
      const rows = yield* db.select().from(EventTable).pipe(Effect.orDie)
      const eventCount = rows.length
      let status: TraceStatus
      if (eventCount === 0 && errorCount === 0) {
        status = "UNAVAILABLE"
      } else if (errorCount > 0) {
        status = "DEGRADED"
      } else {
        status = "COMPLETE"
      }
      return { status, errorCount, lastError, eventCount } satisfies TraceInfo
    })

    const sessionTraceHealth = Effect.fn("EventStore.sessionTraceHealth")(function* (sessionId: string) {
      const rows = yield* db.select().from(TraceHealthTable)
        .where(eq(TraceHealthTable.session_id, sessionId))
        .limit(1)
        .pipe(Effect.orDie)

      if (rows.length === 0) {
        return {
          sessionId,
          status: "UNAVAILABLE",
          expectedCriticalEvents: 0,
          recordedCriticalEvents: 0,
          recordingErrors: [],
        } satisfies SessionTraceHealth
      }

      const row = rows[0]!
      const errors: TraceRecordingError[] = (() => {
        try { return JSON.parse(row.last_error ?? "[]") } catch { return [] }
      })()

      return {
        sessionId,
        status: row.status as TraceStatus,
        expectedCriticalEvents: 0, // to be populated by lifecycle validation
        recordedCriticalEvents: row.recorded_events,
        recordingErrors: errors,
      } satisfies SessionTraceHealth
    })

    return Service.of({
      append: trackedAppend as Interface["append"],
      list,
      listGovernance,
      listType,
      listen,
      verify,
      traceInfo,
      sessionTraceHealth,
    })
    // CAST BOUNDARY #5 — Effect.fn + Effect.catch changes error channel
    // Upstream: trackedAppend wraps append with Effect.catch, which changes the error
    // channel type from the original Effect.fn signature. The runtime behavior is
    // identical — errors are caught, trace health persisted, then re-thrown.
    // Runtime: verified by event-store-concurrency.test.ts test 10.
    // Removal condition: Effect.catch preserves error channel type through wrapping.
    // Scope: narrow (single method cast on the service object)
  }),
)

// App-graph node: Server.listen builds via LayerNode, not defaultLayer.
// Without this, SessionProcessor/SessionPrompt fail with "Service not found: @arcana/EventStore".
export const node = LayerNode.make(layer, [Database.node])
export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))

export * as EventStore from "./event-store"
