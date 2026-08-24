// .tmp-probe2.ts
import { Effect } from "effect"
import { SqliteEffectClaimStore, makeEffectId, deriveIdempotencyKey } from "./src/capability/effect-claim"
import { Database } from "./src/database/database"

const dbp = "L:/PROJECTS/arcana/packages/core/.tmp-claim-probe.db"

const out = await Effect.runPromise(
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const s = new SqliteEffectClaimStore(db)
    const effectId = makeEffectId()
    const rec = {
      effectId,
      idempotencyKey: deriveIdempotencyKey(effectId, "h"),
      requestHash: "h",
      toolName: "t",
      destination: null,
      principalId: "p",
      sessionId: "s",
      state: "CLAIMED" as const,
      receipt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    yield* s.insertClaim(rec)
    const got = yield* s.getClaim(effectId)
    yield* s.transition(effectId, "DISPATCHED")
    const got2 = yield* s.getClaim(effectId)
    return { inserted: effectId, gotState: got?.state ?? "NOT FOUND", got2State: got2?.state ?? "NOT FOUND" }
  }).pipe(Effect.provide(Database.layerFromPath(dbp))),
)
console.log("OUT:", JSON.stringify(out))
