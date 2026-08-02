import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const IntentBindingTable = sqliteTable("intent_bindings", {
  id: text().primaryKey(),
  request_hash: text().notNull(),
  session_id: text().notNull(),
  user_request_event_id: text().notNull(),
  contract_id: text(),
  contract_revision: text(),
  criterion_ids: text().notNull(),
  justification: text().notNull(),
  created_by: text().notNull(),
  status: text().notNull().default("ACTIVE"),
  created_at: text().notNull(),
  expires_at: text(),
}, (table) => [
  index("intent_bindings_session_status_idx").on(table.session_id, table.status),
  index("intent_bindings_request_status_idx").on(table.request_hash, table.status),
  index("intent_bindings_contract_revision_idx").on(table.contract_id, table.contract_revision, table.status),
])

export * as IntentBindingSql from "./intent-binding-sql"
