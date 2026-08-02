import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260801000000_intent_bindings",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS intent_bindings (
          id TEXT PRIMARY KEY,
          request_hash TEXT NOT NULL,
          session_id TEXT NOT NULL,
          user_request_event_id TEXT NOT NULL,
          contract_id TEXT,
          contract_revision TEXT,
          criterion_ids TEXT NOT NULL,
          justification TEXT NOT NULL,
          created_by TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL,
          expires_at TEXT
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS intent_bindings_session_status_idx
        ON intent_bindings(session_id, status)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS intent_bindings_request_status_idx
        ON intent_bindings(request_hash, status)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS intent_bindings_contract_revision_idx
        ON intent_bindings(contract_id, contract_revision, status)
      `)
    })
  },
} satisfies DatabaseMigration.Migration
