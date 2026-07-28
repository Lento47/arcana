import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  provider TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  summary TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
  id UNINDEXED,
  title,
  summary,
  content='sessions',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tokens INTEGER DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  id UNINDEXED,
  session_id UNINDEXED,
  role,
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS skills_memory (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  session_id TEXT,
  observation TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- user_facts: persistent long-term user facts.
-- Schema additions in this file are *forward-only and idempotent*.
-- The last_accessed_at / content_hash / value_normalized columns are
-- used for dedup refresh + scoring (Direction 5).
CREATE TABLE IF NOT EXISTS user_facts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,
  content_hash TEXT,
  value_normalized TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS user_facts_fts USING fts5(
  id UNINDEXED,
  key,
  value,
  content='user_facts',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  rating TEXT CHECK(rating IN ('up', 'down')),
  category TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'cli',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_session TEXT,
  tags TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_council_sessions (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  context TEXT,
  vote_mode TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  judge_model TEXT,
  winner_model TEXT,
  winner TEXT,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_council_messages (
  id TEXT PRIMARY KEY,
  council_id TEXT NOT NULL REFERENCES agent_council_sessions(id) ON DELETE CASCADE,
  agent_model TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('proposal', 'critique', 'vote', 'judge', 'error')),
  content TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_council_votes (
  id TEXT PRIMARY KEY,
  council_id TEXT NOT NULL REFERENCES agent_council_sessions(id) ON DELETE CASCADE,
  agent_model TEXT NOT NULL,
  vote TEXT,
  justification TEXT,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS artifact_fts USING fts5(
  id UNINDEXED,
  title,
  content,
  tags,
  content='artifacts',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS artifacts_fts_insert AFTER INSERT ON artifacts BEGIN
  INSERT INTO artifact_fts(rowid, id, title, content, tags) VALUES (new.rowid, new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_update AFTER UPDATE ON artifacts BEGIN
  INSERT INTO artifact_fts(artifact_fts, rowid, id, title, content, tags) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.tags);
  INSERT INTO artifact_fts(rowid, id, title, content, tags) VALUES (new.rowid, new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS artifacts_fts_delete AFTER DELETE ON artifacts BEGIN
  INSERT INTO artifact_fts(artifact_fts, rowid, id, title, content, tags) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS sessions_fts_insert AFTER INSERT ON sessions BEGIN
  INSERT INTO session_fts(rowid, id, title, summary) VALUES (new.rowid, new.id, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS sessions_fts_update AFTER UPDATE ON sessions BEGIN
  INSERT INTO session_fts(session_fts, rowid, id, title, summary) VALUES ('delete', old.rowid, old.id, old.title, old.summary);
  INSERT INTO session_fts(rowid, id, title, summary) VALUES (new.rowid, new.id, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS sessions_fts_delete AFTER DELETE ON sessions BEGIN
  INSERT INTO session_fts(session_fts, rowid, id, title, summary) VALUES ('delete', old.rowid, old.id, old.title, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO message_fts(rowid, id, session_id, role, content) VALUES (new.rowid, new.id, new.session_id, new.role, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO message_fts(message_fts, rowid, id, session_id, role, content) VALUES ('delete', old.rowid, old.id, old.session_id, old.role, old.content);
  INSERT INTO message_fts(rowid, id, session_id, role, content) VALUES (new.rowid, new.id, new.session_id, new.role, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO message_fts(message_fts, rowid, id, session_id, role, content) VALUES ('delete', old.rowid, old.id, old.session_id, old.role, old.content);
END;

CREATE TRIGGER IF NOT EXISTS user_facts_fts_insert AFTER INSERT ON user_facts BEGIN
  INSERT INTO user_facts_fts(rowid, id, key, value) VALUES (new.rowid, new.id, new.key, new.value);
END;

CREATE TRIGGER IF NOT EXISTS user_facts_fts_update AFTER UPDATE ON user_facts BEGIN
  INSERT INTO user_facts_fts(user_facts_fts, rowid, id, key, value) VALUES ('delete', old.rowid, old.id, old.key, old.value);
  INSERT INTO user_facts_fts(rowid, id, key, value) VALUES (new.rowid, new.id, new.key, new.value);
END;

CREATE TRIGGER IF NOT EXISTS user_facts_fts_delete AFTER DELETE ON user_facts BEGIN
  INSERT INTO user_facts_fts(user_facts_fts, rowid, id, key, value) VALUES ('delete', old.rowid, old.id, old.key, old.value);
END;

-- Epistemic claims — typed, provenance-linked knowledge (Phase A)
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  proposition TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'observed','derived','assumed','predicted','reported',
    'contradicted','superseded','verified'
  )),
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
);

CREATE TABLE IF NOT EXISTS claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  artifact_digest TEXT,
  location_file TEXT,
  location_line_start INTEGER,
  location_line_end INTEGER,
  relationship TEXT NOT NULL CHECK(relationship IN (
    'supports','contradicts','produced_by','observed_in','verified_by'
  )),
  PRIMARY KEY (claim_id, event_id, relationship)
);

CREATE TABLE IF NOT EXISTS claim_dependencies (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  depends_on_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, depends_on_claim_id)
);

CREATE TABLE IF NOT EXISTS claim_contradictions (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  contradicts_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, contradicts_claim_id)
);

CREATE TABLE IF NOT EXISTS claim_outcomes (
  claim_id TEXT PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
  predicted_confidence REAL,
  final_outcome TEXT NOT NULL CHECK(final_outcome IN (
    'confirmed','refuted','partially_confirmed','unresolved'
  )),
  resolved_at TEXT NOT NULL
);

-- Completion contracts — governed completion lifecycle (Phase A)
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK(risk_class IN ('read','modify','publish','irreversible')),
  source_event_id TEXT NOT NULL,
  compiler_model TEXT,
  revision INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','amended','satisfied')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_state TEXT,
  resolution_reason TEXT
);

CREATE TABLE IF NOT EXISTS contract_acceptance_criteria (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  verification TEXT NOT NULL CHECK(verification IN ('observation','execution','comparison','human_decision','external_confirmation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','satisfied','failed','waived','not_applicable')),
  evidence_event_id TEXT
);

CREATE TABLE IF NOT EXISTS contract_forbidden_outcomes (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  PRIMARY KEY (contract_id, description)
);

CREATE TABLE IF NOT EXISTS contract_assumptions (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  PRIMARY KEY (contract_id, claim_id)
);
`

// Indexes that reference columns added by COLUMN_MIGRATIONS must be created
// *after* those columns exist. Putting them in SCHEMA broke older DBs:
// CREATE TABLE IF NOT EXISTS left the pre-dedup user_facts table alone, then
// CREATE INDEX ... (content_hash) threw "no such column: content_hash" and
// aborted open before applyColumnMigrations could run.
const POST_MIGRATION_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_user_facts_hash ON user_facts(content_hash);
CREATE INDEX IF NOT EXISTS idx_user_facts_last_accessed ON user_facts(last_accessed_at);
`

// Forward-only, idempotent column migrations applied on every open.
// SQLite ALTER TABLE ADD COLUMN fails if the column already exists, so we
// gate each with a PRAGMA table_info check. Cheap (one int per column).
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; type: string }> = [
  { table: "user_facts", column: "last_accessed_at", type: "TEXT" },
  { table: "user_facts", column: "content_hash", type: "TEXT" },
  { table: "user_facts", column: "value_normalized", type: "TEXT" },
]

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`)
    .get(table) as { ok: number } | null
  return !!row
}

function applyColumnMigrations(db: Database): void {
  for (const { table, column, type } of COLUMN_MIGRATIONS) {
    if (!tableExists(db, table)) continue
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }
}

// Tables only need creating once per file per process; subsequent opens of the
// same db skip the ~30 CREATE-IF-NOT-EXISTS statements.
const _schemaApplied = new Set<string>()

export function openMemoryDB(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, "memory.db")
  const db = new Database(file, { create: true })
  // PRAGMAs are per-connection — must run on every new handle.
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec("PRAGMA busy_timeout = 5000")
  if (!_schemaApplied.has(file)) {
    db.exec(SCHEMA)
    _schemaApplied.add(file)
  }
  // Column migrations are safe to run every open — they're gated by
  // PRAGMA table_info checks internally. We don't memoize them because
  // some edge cases (e.g. a previous process crashed mid-migration) need
  // to be retried on next open.
  // Order matters: migrate columns *before* indexes that reference them.
  applyColumnMigrations(db)
  db.exec(POST_MIGRATION_INDEXES)
  return db
}
