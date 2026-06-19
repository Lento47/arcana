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

CREATE TABLE IF NOT EXISTS user_facts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_session TEXT,
  tags TEXT,
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

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO message_fts(message_fts, rowid, id, session_id, role, content) VALUES ('delete', old.rowid, old.id, old.session_id, old.role, old.content);
END;
`

export function openMemoryDB(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true })
  const db = new Database(join(dataDir, "memory.db"), { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(SCHEMA)
  return db
}
