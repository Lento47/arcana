import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729000000_capability_grants",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS capability_grants (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL DEFAULT '1',
          principal_kind TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          issuer_kind TEXT NOT NULL,
          issuer_id TEXT NOT NULL,
          actions TEXT NOT NULL,
          resources TEXT NOT NULL,
          constraints TEXT NOT NULL,
          delegation TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_event_id TEXT NOT NULL,
          revoked_event_id TEXT,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_capability_grants_principal
        ON capability_grants(principal_id, principal_kind)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_capability_grants_status
        ON capability_grants(status)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_capability_grants_session
        ON capability_grants(json_extract(constraints, '$.sessionId'))
        WHERE json_extract(constraints, '$.sessionId') IS NOT NULL
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_capability_grants_workspace
        ON capability_grants(json_extract(constraints, '$.workspaceId'))
        WHERE json_extract(constraints, '$.workspaceId') IS NOT NULL
      `)
    })
  },
} satisfies DatabaseMigration.Migration
