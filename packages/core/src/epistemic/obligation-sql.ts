import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { ContractTable } from "./contract-sql"

export const ObligationTable = sqliteTable("obligations", {
  id: text().primaryKey(),
  contract_id: text().notNull().references(() => ContractTable.id, { onDelete: "cascade" }),
  source_kind: text().notNull(),
  source_rule_id: text(),
  source_criterion_id: text(),
  source_reason: text(),
  description: text().notNull(),
  required: integer().notNull().default(1),
  verification: text().notNull(),
  status: text().notNull().default("pending"),
  created_at: text().notNull(),
  resolved_at: text(),
  waived_by_event_id: text(),
  waiver_reason: text(),
})

export const ObligationTemplateTable = sqliteTable("obligation_templates", {
  rule_id: text().primaryKey(),
  description: text().notNull(),
  trigger: text().notNull(),
  verification: text().notNull(),
  required: integer().notNull().default(1),
})
