import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

export const AuditEventTable = sqliteTable(
  "audit_event",
  {
    id: text().primaryKey(),
    session_id: text(),
    org_id: text(),
    actor: text().notNull(),
    action: text().notNull(),
    resource: text(),
    detail: text({ mode: "json" }),
    tool: text(),
    tool_args: text({ mode: "json" }),
    tool_result: text(),
    duration_ms: integer(),
    tokens_used: integer(),
    cost: real(),
    ip_address: text(),
    user_agent: text(),
    ...Timestamps,
  },
  (table) => [
    index("audit_org_action_idx").on(table.org_id, table.action),
    index("audit_org_time_idx").on(table.org_id, table.time_created),
    index("audit_actor_idx").on(table.actor),
    index("audit_session_idx").on(table.session_id),
  ],
)
