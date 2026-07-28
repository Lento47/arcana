import { Effect, Context, Layer } from "effect"
import { desc, eq } from "drizzle-orm"
import { randomUUID, createHash } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { EventTable } from "@arcana/core/epistemic/event-sql"
import type { ArcanaEvent } from "@arcana/core/epistemic/event"

export interface Interface {
  readonly append: (input: {
    actor: ArcanaEvent["actor"]
    type: ArcanaEvent["type"]
    payload: unknown
  }) => Effect.Effect<ArcanaEvent>
  readonly list: (limit?: number) => Effect.Effect<ArcanaEvent[]>
  readonly verify: () => Effect.Effect<{ valid: boolean; breaksAt?: number }>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/EventStore") {}

function computeHash(
  id: string, sequence: number, timestamp: string, previousHash: string | null,
  actorKind: string, actorId: string, type: string, payload: unknown,
): string {
  const canonical = JSON.stringify({ id, sequence, timestamp, previousHash, actorKind, actorId, type, payload })
  return createHash("sha256").update(canonical).digest("hex")
}

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
      const hash = computeHash(
        id, sequence, timestamp, previousHash,
        input.actor.kind, input.actor.id, input.type, payloadJson,
      )

      yield* db.insert(EventTable).values({
        id,
        sequence,
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
        id: r.id, sequence: r.sequence, timestamp: r.timestamp,
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
        const computed = computeHash(
          e.id, e.sequence, e.timestamp, e.previous_hash,
          e.actor_kind, e.actor_id, e.type, e.payload,
        )
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
