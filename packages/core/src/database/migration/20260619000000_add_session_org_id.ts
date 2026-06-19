import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260619000000_add_session_org_id",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE session ADD COLUMN org_id TEXT;`).pipe(
        Effect.catch(() => Effect.void),
      )
      yield* tx.run(`CREATE INDEX IF NOT EXISTS session_org_idx ON session(org_id);`).pipe(
        Effect.catch(() => Effect.void),
      )
    })
  },
} satisfies DatabaseMigration.Migration
