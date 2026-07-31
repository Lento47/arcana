import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

/**
 * Phase A/B epistemic layer tables used by EventStore / claims / contracts.
 * These were introduced in TypeScript (packages/core/src/epistemic/*-sql.ts)
 * without a runtime migration, so chat prompts failed with:
 *   SQLiteError: no such table: events
 */
export default {
  id: "20260731000000_epistemic_tables",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          sequence INTEGER NOT NULL UNIQUE,
          session_id TEXT,
          timestamp TEXT NOT NULL,
          previous_hash TEXT,
          hash TEXT NOT NULL,
          actor_kind TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_events_session
        ON events(session_id)
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_events_sequence
        ON events(sequence)
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS trace_health (
          session_id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'COMPLETE',
          error_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          recorded_events INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          proposition TEXT NOT NULL,
          status TEXT NOT NULL,
          scope_workspace TEXT,
          scope_branch TEXT,
          scope_file TEXT,
          scope_symbol TEXT,
          confidence REAL DEFAULT 0.5,
          calibration_domain TEXT,
          valid_from TEXT,
          valid_until TEXT,
          last_verified_at TEXT,
          created_at TEXT NOT NULL,
          created_by_event_id TEXT NOT NULL
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_claims_session
        ON claims(session_id)
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS claim_evidence (
          claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
          event_id TEXT NOT NULL,
          artifact_digest TEXT,
          location_file TEXT,
          location_line_start INTEGER,
          location_line_end INTEGER,
          relationship TEXT NOT NULL,
          PRIMARY KEY (claim_id, event_id, relationship)
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS claim_dependencies (
          claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
          depends_on_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
          PRIMARY KEY (claim_id, depends_on_claim_id)
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS claim_contradictions (
          claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
          contradicts_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
          PRIMARY KEY (claim_id, contradicts_claim_id)
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS claim_outcomes (
          claim_id TEXT PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
          predicted_confidence REAL,
          final_outcome TEXT NOT NULL,
          resolved_at TEXT NOT NULL
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS contracts (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          objective TEXT NOT NULL,
          risk_class TEXT NOT NULL,
          source_event_id TEXT NOT NULL,
          compiler_model TEXT,
          revision INTEGER DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'proposed',
          created_at TEXT NOT NULL,
          resolved_at TEXT,
          resolution_state TEXT,
          resolution_reason TEXT
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_contracts_session
        ON contracts(session_id)
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS contract_acceptance_criteria (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          required INTEGER NOT NULL DEFAULT 1,
          verification TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          evidence_event_id TEXT
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS contract_forbidden_outcomes (
          contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          PRIMARY KEY (contract_id, description)
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS contract_assumptions (
          contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
          claim_id TEXT NOT NULL REFERENCES claims(id),
          PRIMARY KEY (contract_id, claim_id)
        )
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS obligations (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
          source_kind TEXT NOT NULL,
          source_rule_id TEXT,
          source_criterion_id TEXT,
          source_reason TEXT,
          description TEXT NOT NULL,
          required INTEGER NOT NULL DEFAULT 1,
          verification TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          resolved_at TEXT,
          waived_by_event_id TEXT,
          waiver_reason TEXT
        )
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS idx_obligations_contract
        ON obligations(contract_id)
      `)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS obligation_templates (
          rule_id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          trigger TEXT NOT NULL,
          verification TEXT NOT NULL,
          required INTEGER NOT NULL DEFAULT 1
        )
      `)
    })
  },
} satisfies DatabaseMigration.Migration
