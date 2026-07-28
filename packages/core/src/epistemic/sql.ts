import { sqliteTable, text, real, integer, primaryKey } from "drizzle-orm/sqlite-core"

export const ClaimTable = sqliteTable("claims", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  proposition: text().notNull(),
  status: text().notNull(),
  scope_workspace: text(),
  scope_branch: text(),
  scope_file: text(),
  scope_symbol: text(),
  confidence: real().default(0.5),
  calibration_domain: text(),
  valid_from: text(),
  valid_until: text(),
  last_verified_at: text(),
  created_at: text().notNull(),
  created_by_event_id: text().notNull(),
})

export const ClaimEvidenceTable = sqliteTable("claim_evidence", {
  claim_id: text().notNull().references(() => ClaimTable.id, { onDelete: "cascade" }),
  event_id: text().notNull(),
  artifact_digest: text(),
  location_file: text(),
  location_line_start: integer(),
  location_line_end: integer(),
  relationship: text().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.claim_id, table.event_id, table.relationship] }),
}))

export const ClaimDependencyTable = sqliteTable("claim_dependencies", {
  claim_id: text().notNull().references(() => ClaimTable.id, { onDelete: "cascade" }),
  depends_on_claim_id: text().notNull().references(() => ClaimTable.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.claim_id, table.depends_on_claim_id] }),
}))

export const ClaimContradictionTable = sqliteTable("claim_contradictions", {
  claim_id: text().notNull().references(() => ClaimTable.id, { onDelete: "cascade" }),
  contradicts_claim_id: text().notNull().references(() => ClaimTable.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.claim_id, table.contradicts_claim_id] }),
}))

export const ClaimOutcomeTable = sqliteTable("claim_outcomes", {
  claim_id: text().primaryKey().references(() => ClaimTable.id, { onDelete: "cascade" }),
  predicted_confidence: real(),
  final_outcome: text().notNull(),
  resolved_at: text().notNull(),
})
