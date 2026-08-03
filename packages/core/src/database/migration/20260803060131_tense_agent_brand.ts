import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260803060131_tense_agent_brand",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS audit_event (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          org_id TEXT,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          resource TEXT,
          detail TEXT,
          tool TEXT,
          tool_args TEXT,
          tool_result TEXT,
          duration_ms INTEGER,
          tokens_used INTEGER,
          cost REAL,
          ip_address TEXT,
          user_agent TEXT,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS audit_org_action_idx
        ON audit_event(org_id, action)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS audit_org_time_idx
        ON audit_event(org_id, time_created)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS audit_actor_idx
        ON audit_event(actor)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS audit_session_idx
        ON audit_event(session_id)
      `)
    })
  },
} satisfies DatabaseMigration.Migration
