import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const EventTable = sqliteTable("events", {
  id: text().primaryKey(),
  sequence: integer().notNull(),
  timestamp: text().notNull(),
  previous_hash: text(),
  hash: text().notNull(),
  actor_kind: text().notNull(),
  actor_id: text().notNull(),
  type: text().notNull(),
  payload: text().notNull(),
})
