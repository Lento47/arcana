import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const TraceHealthTable = sqliteTable("trace_health", {
  session_id: text().primaryKey(),
  status: text().notNull().default("COMPLETE"),
  error_count: integer().notNull().default(0),
  last_error: text(),
  recorded_events: integer().notNull().default(0),
  updated_at: text().notNull(),
})
