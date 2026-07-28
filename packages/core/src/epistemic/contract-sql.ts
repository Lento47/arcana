import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core"
import { ClaimTable } from "./sql"

export const ContractTable = sqliteTable("contracts", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  objective: text().notNull(),
  risk_class: text().notNull(),
  source_event_id: text().notNull(),
  compiler_model: text(),
  revision: integer().default(1),
  status: text().notNull().default("proposed"),
  created_at: text().notNull(),
  resolved_at: text(),
  resolution_state: text(),
  resolution_reason: text(),
})

export const ContractAcceptanceCriteriaTable = sqliteTable("contract_acceptance_criteria", {
  id: text().primaryKey(),
  contract_id: text().notNull().references(() => ContractTable.id, { onDelete: "cascade" }),
  description: text().notNull(),
  required: integer().notNull().default(1),
  verification: text().notNull(),
  status: text().notNull().default("pending"),
  evidence_event_id: text(),
})

export const ContractForbiddenOutcomesTable = sqliteTable("contract_forbidden_outcomes", {
  contract_id: text().notNull().references(() => ContractTable.id, { onDelete: "cascade" }),
  description: text().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.contract_id, table.description] }),
}))

export const ContractAssumptionsTable = sqliteTable("contract_assumptions", {
  contract_id: text().notNull().references(() => ContractTable.id, { onDelete: "cascade" }),
  claim_id: text().notNull().references(() => ClaimTable.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.contract_id, table.claim_id] }),
}))
