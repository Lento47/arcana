import { Effect, Context, Layer } from "effect"
import { desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { EventTable } from "@arcana/core/epistemic/event-sql"
import { computeEventHash } from "@arcana/core/epistemic/event-hash"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"

export interface Interface {
  readonly append: (input: {
    sessionId?: string
    actor: ArcanaEvent["actor"]
    type: ArcanaEvent["type"]
    payload: unknown
  }) => Effect.Effect<ArcanaEvent>
  readonly list: (limit?: number) => Effect.Effect<ArcanaEvent[]>
  readonly verify: () => Effect.Effect<{ valid: boolean; breaksAt?: number }>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/EventStore") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const append = Effect.fn("EventStore.append")(function* (input) {
      const lastRow = yield* db.select().from(EventTable)
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

      yield* db.insert(EventTable).values({
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

    return Service.of({ append, list, verify })
  }),
)

export * as EventStore from "./event-store"
