import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260821000000_permission_agent_scope",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE permission ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'build'`)
      yield* tx.run(`DROP INDEX IF EXISTS permission_project_action_resource_idx`)
      yield* tx.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS permission_project_agent_action_resource_idx
        ON permission(project_id, agent_id, action, resource)
      `)
    })
  },
} satisfies DatabaseMigration.Migration
