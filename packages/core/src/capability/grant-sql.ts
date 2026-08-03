import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

export const CapabilityGrantTable = sqliteTable(
  "capability_grants",
  {
    id: text().primaryKey(),
    schema_version: text().notNull().default("1"),
    principal_kind: text().notNull(),
    principal_id: text().notNull(),
    issuer_kind: text().notNull(),
    issuer_id: text().notNull(),
    actions: text().notNull(),
    resources: text().notNull(),
    constraints: text().notNull(),
    delegation: text().notNull(),
    status: text().notNull().default("ACTIVE"),
    created_event_id: text().notNull(),
    revoked_event_id: text(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [
    index("idx_capability_grants_principal").on(table.principal_id, table.principal_kind),
    index("idx_capability_grants_status").on(table.status),
  ],
)
