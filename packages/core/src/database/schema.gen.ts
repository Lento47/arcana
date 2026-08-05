import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`workspace\` (
          \`id\` text PRIMARY KEY,
          \`type\` text NOT NULL,
          \`name\` text DEFAULT '' NOT NULL,
          \`branch\` text,
          \`directory\` text,
          \`extra\` text,
          \`project_id\` text NOT NULL,
          \`time_used\` integer NOT NULL,
          CONSTRAINT \`fk_workspace_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`data_migration\` (
          \`name\` text PRIMARY KEY,
          \`time_completed\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account_state\` (
          \`id\` integer PRIMARY KEY,
          \`active_account_id\` text,
          \`active_org_id\` text,
          CONSTRAINT \`fk_account_state_active_account_id_account_id_fk\` FOREIGN KEY (\`active_account_id\`) REFERENCES \`account\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account\` (
          \`id\` text PRIMARY KEY,
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`control_account\` (
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`active\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`control_account_pk\` PRIMARY KEY(\`email\`, \`url\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`audit_event\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text,
          \`org_id\` text,
          \`actor\` text NOT NULL,
          \`action\` text NOT NULL,
          \`resource\` text,
          \`detail\` text,
          \`tool\` text,
          \`tool_args\` text,
          \`tool_result\` text,
          \`duration_ms\` integer,
          \`tokens_used\` integer,
          \`cost\` real,
          \`ip_address\` text,
          \`user_agent\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`credential\` (
          \`id\` text PRIMARY KEY,
          \`integration_id\` text,
          \`label\` text NOT NULL,
          \`value\` text NOT NULL,
          \`connector_id\` text,
          \`method_id\` text,
          \`active\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`claim_contradictions\` (
          \`claim_id\` text NOT NULL,
          \`contradicts_claim_id\` text NOT NULL,
          CONSTRAINT \`claim_contradictions_pk\` PRIMARY KEY(\`claim_id\`, \`contradicts_claim_id\`),
          CONSTRAINT \`fk_claim_contradictions_claim_id_claims_id_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_claim_contradictions_contradicts_claim_id_claims_id_fk\` FOREIGN KEY (\`contradicts_claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`claim_dependencies\` (
          \`claim_id\` text NOT NULL,
          \`depends_on_claim_id\` text NOT NULL,
          CONSTRAINT \`claim_dependencies_pk\` PRIMARY KEY(\`claim_id\`, \`depends_on_claim_id\`),
          CONSTRAINT \`fk_claim_dependencies_claim_id_claims_id_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_claim_dependencies_depends_on_claim_id_claims_id_fk\` FOREIGN KEY (\`depends_on_claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`claim_evidence\` (
          \`claim_id\` text NOT NULL,
          \`event_id\` text NOT NULL,
          \`artifact_digest\` text,
          \`location_file\` text,
          \`location_line_start\` integer,
          \`location_line_end\` integer,
          \`relationship\` text NOT NULL,
          CONSTRAINT \`claim_evidence_pk\` PRIMARY KEY(\`claim_id\`, \`event_id\`, \`relationship\`),
          CONSTRAINT \`fk_claim_evidence_claim_id_claims_id_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`claim_outcomes\` (
          \`claim_id\` text PRIMARY KEY,
          \`predicted_confidence\` real,
          \`final_outcome\` text NOT NULL,
          \`resolved_at\` text NOT NULL,
          CONSTRAINT \`fk_claim_outcomes_claim_id_claims_id_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`claims\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`proposition\` text NOT NULL,
          \`status\` text NOT NULL,
          \`scope_workspace\` text,
          \`scope_branch\` text,
          \`scope_file\` text,
          \`scope_symbol\` text,
          \`confidence\` real DEFAULT 0.5,
          \`calibration_domain\` text,
          \`valid_from\` text,
          \`valid_until\` text,
          \`last_verified_at\` text,
          \`created_at\` text NOT NULL,
          \`created_by_event_id\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event_sequence\` (
          \`aggregate_id\` text PRIMARY KEY,
          \`seq\` integer NOT NULL,
          \`owner_id\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event\` (
          \`id\` text PRIMARY KEY,
          \`aggregate_id\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`type\` text NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_event_aggregate_id_event_sequence_aggregate_id_fk\` FOREIGN KEY (\`aggregate_id\`) REFERENCES \`event_sequence\`(\`aggregate_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`permission\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`action\` text NOT NULL,
          \`resource\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_permission_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project_directory\` (
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`type\` text,
          \`strategy\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`project_directory_pk\` PRIMARY KEY(\`project_id\`, \`directory\`),
          CONSTRAINT \`fk_project_directory_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project\` (
          \`id\` text PRIMARY KEY,
          \`worktree\` text NOT NULL,
          \`vcs\` text,
          \`name\` text,
          \`icon_url\` text,
          \`icon_url_override\` text,
          \`icon_color\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_initialized\` integer,
          \`sandboxes\` text NOT NULL,
          \`commands\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`part\` (
          \`id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_part_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_context_epoch\` (
          \`session_id\` text PRIMARY KEY,
          \`baseline\` text NOT NULL,
          \`agent\` text DEFAULT 'build' NOT NULL,
          \`snapshot\` text NOT NULL,
          \`baseline_seq\` integer NOT NULL,
          \`replacement_seq\` integer,
          \`revision\` integer DEFAULT 0 NOT NULL,
          CONSTRAINT \`fk_session_context_epoch_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_input\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`delivery\` text NOT NULL,
          \`admitted_seq\` integer NOT NULL,
          \`promoted_seq\` integer,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_input_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_session_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`org_id\` text,
          \`workspace_id\` text,
          \`parent_id\` text,
          \`slug\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`path\` text,
          \`title\` text NOT NULL,
          \`version\` text NOT NULL,
          \`share_url\` text,
          \`summary_additions\` integer,
          \`summary_deletions\` integer,
          \`summary_files\` integer,
          \`summary_diffs\` text,
          \`metadata\` text,
          \`cost\` real DEFAULT 0 NOT NULL,
          \`tokens_input\` integer DEFAULT 0 NOT NULL,
          \`tokens_output\` integer DEFAULT 0 NOT NULL,
          \`tokens_reasoning\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_read\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_write\` integer DEFAULT 0 NOT NULL,
          \`revert\` text,
          \`permission\` text,
          \`agent\` text,
          \`model\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_compacting\` integer,
          \`time_archived\` integer,
          CONSTRAINT \`fk_session_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`todo\` (
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`todo_pk\` PRIMARY KEY(\`session_id\`, \`position\`),
          CONSTRAINT \`fk_todo_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_share\` (
          \`session_id\` text PRIMARY KEY,
          \`id\` text NOT NULL,
          \`secret\` text NOT NULL,
          \`url\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_share_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`contract_acceptance_criteria\` (
          \`id\` text PRIMARY KEY,
          \`contract_id\` text NOT NULL,
          \`description\` text NOT NULL,
          \`required\` integer DEFAULT 1 NOT NULL,
          \`verification\` text NOT NULL,
          \`status\` text DEFAULT 'pending' NOT NULL,
          \`evidence_event_id\` text,
          CONSTRAINT \`fk_contract_acceptance_criteria_contract_id_contracts_id_fk\` FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`contract_assumptions\` (
          \`contract_id\` text NOT NULL,
          \`claim_id\` text NOT NULL,
          CONSTRAINT \`contract_assumptions_pk\` PRIMARY KEY(\`contract_id\`, \`claim_id\`),
          CONSTRAINT \`fk_contract_assumptions_contract_id_contracts_id_fk\` FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_contract_assumptions_claim_id_claims_id_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`contract_forbidden_outcomes\` (
          \`contract_id\` text NOT NULL,
          \`description\` text NOT NULL,
          CONSTRAINT \`contract_forbidden_outcomes_pk\` PRIMARY KEY(\`contract_id\`, \`description\`),
          CONSTRAINT \`fk_contract_forbidden_outcomes_contract_id_contracts_id_fk\` FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`contracts\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`objective\` text NOT NULL,
          \`risk_class\` text NOT NULL,
          \`source_event_id\` text NOT NULL,
          \`compiler_model\` text,
          \`revision\` integer DEFAULT 1,
          \`status\` text DEFAULT 'proposed' NOT NULL,
          \`created_at\` text NOT NULL,
          \`resolved_at\` text,
          \`resolution_state\` text,
          \`resolution_reason\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`events\` (
          \`id\` text PRIMARY KEY,
          \`sequence\` integer NOT NULL UNIQUE,
          \`session_id\` text,
          \`timestamp\` text NOT NULL,
          \`previous_hash\` text,
          \`hash\` text NOT NULL,
          \`actor_kind\` text NOT NULL,
          \`actor_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`payload\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`obligations\` (
          \`id\` text PRIMARY KEY,
          \`contract_id\` text NOT NULL,
          \`source_kind\` text NOT NULL,
          \`source_rule_id\` text,
          \`source_criterion_id\` text,
          \`source_reason\` text,
          \`description\` text NOT NULL,
          \`required\` integer DEFAULT 1 NOT NULL,
          \`verification\` text NOT NULL,
          \`status\` text DEFAULT 'pending' NOT NULL,
          \`created_at\` text NOT NULL,
          \`resolved_at\` text,
          \`waived_by_event_id\` text,
          \`waiver_reason\` text,
          CONSTRAINT \`fk_obligations_contract_id_contracts_id_fk\` FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`obligation_templates\` (
          \`rule_id\` text PRIMARY KEY,
          \`description\` text NOT NULL,
          \`trigger\` text NOT NULL,
          \`verification\` text NOT NULL,
          \`required\` integer DEFAULT 1 NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`trace_health\` (
          \`session_id\` text PRIMARY KEY,
          \`status\` text DEFAULT 'COMPLETE' NOT NULL,
          \`error_count\` integer DEFAULT 0 NOT NULL,
          \`last_error\` text,
          \`recorded_events\` integer DEFAULT 0 NOT NULL,
          \`updated_at\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_grants\` (
          \`id\` text PRIMARY KEY,
          \`schema_version\` text DEFAULT '1' NOT NULL,
          \`principal_kind\` text NOT NULL,
          \`principal_id\` text NOT NULL,
          \`issuer_kind\` text NOT NULL,
          \`issuer_id\` text NOT NULL,
          \`actions\` text NOT NULL,
          \`resources\` text NOT NULL,
          \`constraints\` text NOT NULL,
          \`delegation\` text NOT NULL,
          \`status\` text DEFAULT 'ACTIVE' NOT NULL,
          \`created_event_id\` text NOT NULL,
          \`revoked_event_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`intent_bindings\` (
          \`id\` text PRIMARY KEY,
          \`request_hash\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`user_request_event_id\` text NOT NULL,
          \`contract_id\` text,
          \`contract_revision\` text,
          \`criterion_ids\` text NOT NULL,
          \`justification\` text NOT NULL,
          \`created_by\` text NOT NULL,
          \`status\` text DEFAULT 'ACTIVE' NOT NULL,
          \`created_at\` text NOT NULL,
          \`expires_at\` text
        );
      `)
      yield* tx.run(`CREATE INDEX \`audit_org_action_idx\` ON \`audit_event\` (\`org_id\`,\`action\`);`)
      yield* tx.run(`CREATE INDEX \`audit_org_time_idx\` ON \`audit_event\` (\`org_id\`,\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`audit_actor_idx\` ON \`audit_event\` (\`actor\`);`)
      yield* tx.run(`CREATE INDEX \`audit_session_idx\` ON \`audit_event\` (\`session_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`event_aggregate_seq_idx\` ON \`event\` (\`aggregate_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`event_aggregate_type_seq_idx\` ON \`event\` (\`aggregate_id\`,\`type\`,\`seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`permission_project_action_resource_idx\` ON \`permission\` (\`project_id\`,\`action\`,\`resource\`);`)
      yield* tx.run(`CREATE INDEX \`message_session_time_created_id_idx\` ON \`message\` (\`session_id\`,\`time_created\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_message_id_id_idx\` ON \`part\` (\`message_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_session_idx\` ON \`part\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_input_session_pending_delivery_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`,\`delivery\`,\`admitted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_input_session_admitted_seq_idx\` ON \`session_input\` (\`session_id\`,\`admitted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_input_session_promoted_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`session_message_session_seq_idx\` ON \`session_message\` (\`session_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_session_type_seq_idx\` ON \`session_message\` (\`session_id\`,\`type\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_session_time_created_id_idx\` ON \`session_message\` (\`session_id\`,\`time_created\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`session_message_time_created_idx\` ON \`session_message\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`session_project_idx\` ON \`session\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_org_idx\` ON \`session\` (\`org_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_workspace_idx\` ON \`session\` (\`workspace_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_parent_idx\` ON \`session\` (\`parent_id\`);`)
      yield* tx.run(`CREATE INDEX \`todo_session_idx\` ON \`todo\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`idx_capability_grants_principal\` ON \`capability_grants\` (\`principal_id\`,\`principal_kind\`);`)
      yield* tx.run(`CREATE INDEX \`idx_capability_grants_status\` ON \`capability_grants\` (\`status\`);`)
      yield* tx.run(`CREATE INDEX \`intent_bindings_session_status_idx\` ON \`intent_bindings\` (\`session_id\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`intent_bindings_request_status_idx\` ON \`intent_bindings\` (\`request_hash\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`intent_bindings_contract_revision_idx\` ON \`intent_bindings\` (\`contract_id\`,\`contract_revision\`,\`status\`);`)
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
