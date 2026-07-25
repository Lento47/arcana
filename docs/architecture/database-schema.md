---
title: Database Schema
date: 2026-07-24
status: current
type: architecture
tags:
  - database
  - sqlite
  - drizzle
  - fts5
  - schema
aliases:
  - SQLite Schema
  - Drizzle Schema
  - Data Model
cssclasses:
  - wide-page
---

# Database Schema

Arcana uses two SQLite databases: a **core database** (Drizzle ORM) for sessions, projects, and system state, and a **memory database** (raw SQL + FTS5) for conversation memory, facts, and search.

## Database Overview

```txt
┌─────────────────────────────────────────────────────────────────┐
│                    Arcana Data Layer                             │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Core Database       │    │  Memory Database     │            │
│  │  (Drizzle ORM)       │    │  (Raw SQL + FTS5)    │            │
│  │                      │    │                      │            │
│  │  ~/.arcana/data/     │    │  ~/.arcana/data/     │            │
│  │  ├── sessions        │    │  memory.db           │            │
│  │  ├── projects        │    │  ├── sessions        │            │
│  │  ├── credentials     │    │  ├── messages        │            │
│  │  ├── permissions     │    │  ├── user_facts      │            │
│  │  ├── audit           │    │  ├── skills_memory   │            │
│  │  ├── events          │    │  ├── artifacts       │            │
│  │  ├── workspaces      │    │  ├── feedback        │            │
│  │  └── migrations      │    │  ├── agent_council_* │            │
│  │                      │    │  └── FTS5 indexes    │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Runtime: Effect + Drizzle    Runtime: Bun SQLite               │
│  Migrations: Drizzle Kit      Migrations: Forward-only column  │
│  Path: database.ts            Path: packages/memory/src/db.ts   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Database (Drizzle ORM)

The core database uses Drizzle ORM with Effect runtime. Tables are defined in `packages/core/src/*/sql.ts`.

### Shared Column Types

All tables use a shared `Timestamps` mixin:

```sql
time_created INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
time_updated INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
```

Timestamps are stored as milliseconds since epoch.

### Session Tables

**Location:** `packages/core/src/session/sql.ts`

#### `session`

The primary session table. Each row represents an agent conversation session.

```sql
CREATE TABLE session (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  org_id          TEXT,
  workspace_id    TEXT,
  parent_id       TEXT,                -- for forked sessions
  slug            TEXT NOT NULL,
  directory       TEXT NOT NULL,       -- project directory (custom path type)
  path            TEXT,                -- additional path info
  title           TEXT NOT NULL,
  version         TEXT NOT NULL,
  share_url       TEXT,
  summary_additions INTEGER,           -- diff summary: additions
  summary_deletions  INTEGER,          -- diff summary: deletions
  summary_files      INTEGER,          -- diff summary: files changed
  summary_diffs      TEXT,             -- JSON: Snapshot.FileDiff[]
  metadata        TEXT,                -- JSON: Record<string, unknown>
  cost            REAL NOT NULL DEFAULT 0,
  tokens_input    INTEGER NOT NULL DEFAULT 0,
  tokens_output   INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read  INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  revert          TEXT,                -- JSON: { messageID, partID, snapshot, diff }
  permission      TEXT,                -- JSON: PermissionV1.Ruleset
  agent           TEXT,                -- session agent type
  model           TEXT,                -- JSON: { id, providerID, variant }
  time_created    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  time_updated    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  time_compacting INTEGER,             -- timestamp when compaction started
  time_archived   INTEGER              -- timestamp when archived
);

-- Indexes
CREATE INDEX session_project_idx ON session(project_id);
CREATE INDEX session_org_idx ON session(org_id);
CREATE INDEX session_workspace_idx ON session(workspace_id);
CREATE INDEX session_parent_idx ON session(parent_id);
```

#### `message`

Individual messages within a session (V1 format).

```sql
CREATE TABLE message (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data       TEXT NOT NULL              -- JSON: V1MessageData
);

CREATE INDEX message_session_time_created_id_idx
  ON message(session_id, time_created, id);
```

#### `part`

Message parts (tool results, text chunks, etc.).

```sql
CREATE TABLE part (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data       TEXT NOT NULL              -- JSON: V1PartData
);

CREATE INDEX part_message_id_id_idx ON part(message_id, id);
CREATE INDEX part_session_idx ON part(session_id);
```

#### `session_message`

V2 session messages with type classification and sequence ordering.

```sql
CREATE TABLE session_message (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,             -- message type (user, assistant, tool, etc.)
  seq        INTEGER NOT NULL,          -- sequence number
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data       TEXT NOT NULL              -- JSON: SessionMessageData
);

-- Unique constraint: one message per sequence per session
CREATE UNIQUE INDEX session_message_session_seq_idx ON session_message(session_id, seq);
CREATE INDEX session_message_session_type_seq_idx ON session_message(session_id, type, seq);
CREATE INDEX session_message_session_time_created_id_idx ON session_message(session_id, time_created, id);
CREATE INDEX session_message_time_created_idx ON session_message(time_created);
```

#### `session_input`

User inputs/prompts queued for the session.

```sql
CREATE TABLE session_input (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,           -- JSON: Prompt object
  delivery      TEXT NOT NULL,           -- delivery mode (e.g., "tui", "api")
  admitted_seq  INTEGER NOT NULL,        -- sequence when admitted
  promoted_seq  INTEGER,                 -- sequence when promoted to processing
  time_created  INTEGER NOT NULL
);

CREATE INDEX session_input_session_pending_delivery_seq_idx
  ON session_input(session_id, promoted_seq, delivery, admitted_seq);
CREATE UNIQUE INDEX session_input_session_admitted_seq_idx
  ON session_input(session_id, admitted_seq);
CREATE UNIQUE INDEX session_input_session_promoted_seq_idx
  ON session_input(session_id, promoted_seq);
```

#### `session_context_epoch`

Tracks context window state for compaction and system context snapshots.

```sql
CREATE TABLE session_context_epoch (
  session_id      TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
  baseline        TEXT NOT NULL,          -- baseline identifier
  agent           TEXT NOT NULL DEFAULT 'build',
  snapshot        TEXT NOT NULL,           -- JSON: SystemContext.Snapshot
  baseline_seq    INTEGER NOT NULL,
  replacement_seq INTEGER,                 -- where replacement starts
  revision        INTEGER NOT NULL DEFAULT 0
);
```

#### `todo`

Task tracking within a session (linked to the `todo_write` tool).

```sql
CREATE TABLE todo (
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL,               -- pending, in_progress, done
  priority   TEXT NOT NULL,               -- high, medium, low
  position   INTEGER NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  PRIMARY KEY (session_id, position)
);

CREATE INDEX todo_session_idx ON todo(session_id);
```

### Project Tables

**Location:** `packages/core/src/project/sql.ts`

#### `project`

Registered projects (repositories/workspaces).

```sql
CREATE TABLE project (
  id                TEXT PRIMARY KEY,
  worktree          TEXT NOT NULL,        -- absolute path to project root
  vcs               TEXT,                 -- version control type ("git", etc.)
  name              TEXT,
  icon_url          TEXT,
  icon_url_override TEXT,
  icon_color        TEXT,
  time_created      INTEGER NOT NULL,
  time_updated      INTEGER NOT NULL,
  time_initialized  INTEGER,             -- when project was first registered
  sandboxes         TEXT NOT NULL,        -- JSON array of sandbox paths
  commands          TEXT                  -- JSON: { start?: string }
);
```

#### `project_directory`

Directories associated with a project (worktrees, git submodules).

```sql
CREATE TABLE project_directory (
  project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  directory   TEXT NOT NULL,             -- absolute path
  type        TEXT,                      -- "main", "root", "git_worktree"
  strategy    TEXT,
  time_created INTEGER NOT NULL,
  PRIMARY KEY (project_id, directory)
);
```

### Credential Tables

**Location:** `packages/core/src/credential/sql.ts`

#### `credential`

Stored API keys and provider credentials (encrypted at rest).

```sql
CREATE TABLE credential (
  id            TEXT PRIMARY KEY,
  integration_id TEXT,
  label         TEXT NOT NULL,
  value         TEXT NOT NULL,           -- JSON: Credential.Info (encrypted)
  connector_id  TEXT,
  method_id     TEXT,
  active        INTEGER,                 -- boolean
  time_created  INTEGER NOT NULL,
  time_updated  INTEGER NOT NULL
);
```

### Permission Tables

**Location:** `packages/core/src/permission/sql.ts`

#### `permission`

Saved tool permission decisions (auto-approve rules).

```sql
CREATE TABLE permission (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,              -- tool action (e.g., "shell", "write")
  resource   TEXT NOT NULL,              -- resource pattern
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

CREATE UNIQUE INDEX permission_project_action_resource_idx
  ON permission(project_id, action, resource);
```

### Event Tables

**Location:** `packages/core/src/event/sql.ts`

#### `event_sequence`

Tracks the latest sequence number per aggregate (for optimistic concurrency).

```sql
CREATE TABLE event_sequence (
  aggregate_id TEXT NOT NULL PRIMARY KEY,
  seq          INTEGER NOT NULL,
  owner_id     TEXT
);
```

#### `event`

Append-only event log for CQRS/event sourcing.

```sql
CREATE TABLE event (
  id            TEXT PRIMARY KEY,
  aggregate_id  TEXT NOT NULL REFERENCES event_sequence(aggregate_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  type          TEXT NOT NULL,
  data          TEXT NOT NULL             -- JSON: event payload
);

CREATE UNIQUE INDEX event_aggregate_seq_idx ON event(aggregate_id, seq);
CREATE INDEX event_aggregate_type_seq_idx ON event(aggregate_id, type, seq);
```

### Account Tables

**Location:** `packages/core/src/account/sql.ts`

#### `account`

Console login accounts (device flow OAuth).

```sql
CREATE TABLE account (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  url           TEXT NOT NULL,            -- provider URL
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry  INTEGER,
  time_created  INTEGER NOT NULL,
  time_updated  INTEGER NOT NULL
);
```

#### `account_state`

Singleton table tracking the active account.

```sql
CREATE TABLE account_state (
  id                INTEGER PRIMARY KEY,  -- always 1
  active_account_id TEXT REFERENCES account(id) ON DELETE SET NULL,
  active_org_id     TEXT
);
```

### Workspace Tables

**Location:** `packages/core/src/control-plane/workspace.sql.ts`

#### `workspace`

Workspace configurations (worktrees, branches).

```sql
CREATE TABLE workspace (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  branch     TEXT,
  directory  TEXT,
  extra      TEXT,                        -- JSON
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  time_used  INTEGER NOT NULL
);
```

### Audit Table

**Location:** `packages/core/src/audit/sql.ts`

#### `audit_event`

Security audit log for tool executions and sensitive operations.

```sql
CREATE TABLE audit_event (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,
  org_id      TEXT,
  actor       TEXT NOT NULL,              -- who performed the action
  action      TEXT NOT NULL,              -- what was done
  resource    TEXT,                       -- target resource
  detail      TEXT,                       -- JSON: additional details
  tool        TEXT,                       -- tool name
  tool_args   TEXT,                       -- JSON: tool arguments
  tool_result TEXT,                       -- tool output (truncated)
  duration_ms INTEGER,                    -- execution time
  tokens_used INTEGER,                    -- tokens consumed
  cost        REAL,                       -- cost in USD
  ip_address  TEXT,
  user_agent  TEXT,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

CREATE INDEX audit_org_action_idx ON audit_event(org_id, action);
CREATE INDEX audit_org_time_idx ON audit_event(org_id, time_created);
CREATE INDEX audit_actor_idx ON audit_event(actor);
CREATE INDEX audit_session_idx ON audit_event(session_id);
```

### Migration Table

**Location:** `packages/core/src/data-migration.sql.ts`

#### `data_migration`

Tracks completed data migrations.

```sql
CREATE TABLE data_migration (
  name           TEXT PRIMARY KEY,
  time_completed INTEGER NOT NULL
);
```

### Share Table

**Location:** `packages/core/src/share/sql.ts`

#### `session_share`

Public session sharing links.

```sql
CREATE TABLE session_share (
  session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,               -- share ID
  secret     TEXT NOT NULL,               -- access secret
  url        TEXT NOT NULL,               -- full share URL
  time_created INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  time_updated INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
```

## Memory Database (Raw SQL + FTS5)

The memory database uses raw SQL with Bun's SQLite driver. Defined in `packages/memory/src/db.ts`.

### Tables

#### `sessions`

Session metadata for memory search.

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT,
  model         TEXT,
  provider      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  summary       TEXT
);
```

#### `messages`

Conversation messages for memory search.

```sql
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tokens     INTEGER DEFAULT 0
);
```

#### `user_facts`

Persistent user facts extracted from conversations.

```sql
CREATE TABLE user_facts (
  id               TEXT PRIMARY KEY,
  key              TEXT NOT NULL,
  value            TEXT NOT NULL,
  source           TEXT,
  confidence       REAL DEFAULT 1.0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  last_accessed_at TEXT,                -- for confidence decay
  content_hash     TEXT,                -- for deduplication
  value_normalized TEXT                 -- for normalized comparison
);

CREATE INDEX idx_user_facts_hash ON user_facts(content_hash);
CREATE INDEX idx_user_facts_last_accessed ON user_facts(last_accessed_at);
```

#### `skills_memory`

Skill usage observations and stats.

```sql
CREATE TABLE skills_memory (
  id          TEXT PRIMARY KEY,
  skill_id    TEXT NOT NULL,
  session_id  TEXT,
  observation TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
```

#### `artifacts`

Generated artifacts (reports, summaries, etc.).

```sql
CREATE TABLE artifacts (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  source_session TEXT,
  tags          TEXT,
  created_at    TEXT NOT NULL
);
```

#### `feedback`

User feedback on assistant responses.

```sql
CREATE TABLE feedback (
  id         TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  rating     TEXT CHECK(rating IN ('up', 'down')),
  category   TEXT,
  note       TEXT,
  source     TEXT NOT NULL DEFAULT 'cli',
  created_at TEXT NOT NULL
);
```

#### `agent_council_*`

Multi-agent council sessions for deliberative decision-making.

```sql
CREATE TABLE agent_council_sessions (
  id            TEXT PRIMARY KEY,
  prompt        TEXT NOT NULL,
  context       TEXT,
  vote_mode     TEXT NOT NULL,
  rounds        INTEGER NOT NULL,
  judge_model   TEXT,
  winner_model  TEXT,
  winner        TEXT,
  status        TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE agent_council_messages (
  id           TEXT PRIMARY KEY,
  council_id   TEXT NOT NULL REFERENCES agent_council_sessions(id) ON DELETE CASCADE,
  agent_model  TEXT NOT NULL,
  phase        TEXT NOT NULL CHECK(phase IN ('proposal', 'critique', 'vote', 'judge', 'error')),
  content      TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  error        TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE agent_council_votes (
  id            TEXT PRIMARY KEY,
  council_id    TEXT NOT NULL REFERENCES agent_council_sessions(id) ON DELETE CASCADE,
  agent_model   TEXT NOT NULL,
  vote          TEXT,
  justification TEXT,
  raw           TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
```

## FTS5 Indexes

The memory database uses SQLite FTS5 virtual tables for full-text search. All FTS5 tables use the `porter unicode61` tokenizer for stemming and Unicode support.

### Index Design

```txt
┌──────────────────┐     ┌──────────────────┐
│  Source Table     │     │  FTS5 Virtual     │
│                   │────►│  Table            │
│  sessions         │     │  session_fts      │
│  messages         │────►│  message_fts      │
│  user_facts       │────►│  user_facts_fts   │
│  artifacts        │────►│  artifact_fts     │
└──────────────────┘     └──────────────────┘
        │                         │
        │  Triggers keep          │  Queries use
        │  FTS in sync            │  bm25() ranking
        ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│  INSERT/UPDATE/   │     │  Search API       │
│  DELETE triggers  │     │  (MemoryStore)    │
└──────────────────┘     └──────────────────┘
```

### `session_fts`

```sql
CREATE VIRTUAL TABLE session_fts USING fts5(
  id UNINDEXED,
  title,
  summary,
  content='sessions',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

**Indexed columns:** `title`, `summary`
**Source:** `sessions` table
**Triggers:** Auto-sync on INSERT/UPDATE/DELETE

### `message_fts`

```sql
CREATE VIRTUAL TABLE message_fts USING fts5(
  id UNINDEXED,
  session_id UNINDEXED,
  role,
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

**Indexed columns:** `role`, `content`
**Source:** `messages` table
**Triggers:** Auto-sync on INSERT/UPDATE/DELETE

### `user_facts_fts`

```sql
CREATE VIRTUAL TABLE user_facts_fts USING fts5(
  id UNINDEXED,
  key,
  value,
  content='user_facts',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

**Indexed columns:** `key`, `value`
**Source:** `user_facts` table
**Triggers:** Auto-sync on INSERT/UPDATE/DELETE

### `artifact_fts`

```sql
CREATE VIRTUAL TABLE artifact_fts USING fts5(
  id UNINDEXED,
  title,
  content,
  tags,
  content='artifacts',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

**Indexed columns:** `title`, `content`, `tags`
**Source:** `artifacts` table
**Triggers:** Auto-sync on INSERT/UPDATE/DELETE

#### FTS5 Trigger SQL

FTS5 virtual tables are kept in sync via auto-sync triggers. Example pattern:

```sql
-- Auto-sync on INSERT
CREATE TRIGGER message_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO message_fts(rowid, id, session_id, role, content)
  VALUES (new.rowid, new.id, new.session_id, new.role, new.content);
END;

-- Auto-sync on UPDATE
CREATE TRIGGER message_fts_au AFTER UPDATE ON messages BEGIN
  DELETE FROM message_fts WHERE rowid = old.rowid;
  INSERT INTO message_fts(rowid, id, session_id, role, content)
  VALUES (new.rowid, new.id, new.session_id, new.role, new.content);
END;

-- Auto-sync on DELETE
CREATE TRIGGER message_fts_ad AFTER DELETE ON messages BEGIN
  DELETE FROM message_fts WHERE rowid = old.rowid;
END;
```

All four FTS5 tables (`session_fts`, `message_fts`, `user_facts_fts`, `artifact_fts`) follow this same trigger pattern.

## FTS5 Query Patterns

The memory system uses `bm25()` for relevance ranking:

```sql
-- Search messages by relevance
SELECT m.*, bm25(message_fts) AS rank
FROM message_fts f
JOIN messages m ON m.id = f.id
WHERE message_fts MATCH ?
ORDER BY rank
LIMIT ?;

-- Search user facts
SELECT f.*, bm25(user_facts_fts) AS rank
FROM user_facts_fts ff
JOIN user_facts f ON f.id = ff.id
WHERE user_facts_fts MATCH ?
ORDER BY rank
LIMIT ?;
```

**Query sanitization:** FTS5 queries are sanitized by:
1. Splitting input into tokens
2. Double-quoting each token to avoid FTS5 syntax collisions
3. Joining with spaces (FTS5 implicit AND)

## PRAGMA Configuration

The memory database uses these PRAGMAs on every connection:

```sql
PRAGMA journal_mode = WAL          -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL        -- Balanced durability/performance
PRAGMA foreign_keys = ON           -- Enforce referential integrity
PRAGMA busy_timeout = 5000         -- 5s wait on lock contention
```

## Column Migrations

The memory database uses forward-only, idempotent column migrations:

```sql
-- Applied on every open, gated by PRAGMA table_info checks
ALTER TABLE user_facts ADD COLUMN last_accessed_at TEXT;
ALTER TABLE user_facts ADD COLUMN content_hash TEXT;
ALTER TABLE user_facts ADD COLUMN value_normalized TEXT;
```

Indexes referencing migrated columns are created after migrations:

```sql
CREATE INDEX IF NOT EXISTS idx_user_facts_hash ON user_facts(content_hash);
CREATE INDEX IF NOT EXISTS idx_user_facts_last_accessed ON user_facts(last_accessed_at);
```

## Tables Not Shown in ER Diagram

The simplified ER diagram above omits several tables for readability. Here is the complete list:

| Table | Database | Purpose |
|-------|----------|---------|
| `session_input` | Core | User prompts queued for processing |
| `session_context_epoch` | Core | Context window state for compaction |
| `session_share` | Core | Public session sharing links |
| `data_migration` | Core | Migration tracking |
| `project_directory` | Core | Associated directories/worktrees |
| `control_account` | Core | Legacy account table (composite PK: email + url) |

## Entity Relationship Diagram (Simplified)

The diagram shows core relationships. All tables use `Timestamps` columns (`time_created`, `time_updated`) as milliseconds since epoch.

```txt
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   project   │────<│   session   │────<│   message   │
│             │     │             │     │             │
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │
│ worktree    │     │ project_id  │────>│ session_id  │
│ vcs         │     │ title       │     │ data (JSON) │
│ name        │     │ model (JSON)│     └──────┬──────┘
└──────┬──────┘     │ cost        │            │
       │            │ tokens_*    │     ┌──────┴──────┐
       │            └──────┬──────┘     │    part     │
       │                   │            │             │
       │            ┌──────┴──────┐     │ id (PK)     │
       │            │session_msg  │     │ message_id  │
       │            │             │     │ data (JSON) │
       │            │ id (PK)     │     └─────────────┘
       │            │ session_id  │
       │            │ type        │     ┌─────────────┐
       │            │ seq         │     │   todo      │
       │            │ data (JSON) │     │             │
       │            └─────────────┘     │ session_id  │
       │                                │ content     │
       │            ┌─────────────┐     │ status      │
       ├───────────<│ permission  │     │ priority    │
       │            │             │     └─────────────┘
       │            │ project_id  │
       │            │ action      │     ┌─────────────┐
       │            │ resource    │     │credential   │
       │            └─────────────┘     │             │
       │                                │ id (PK)     │
       │            ┌─────────────┐     │ label       │
       └───────────<│ workspace   │     │ value (JSON)│
                    │             │     └─────────────┘
                    │ project_id  │
                    │ type        │     ┌─────────────┐
                    │ name        │     │audit_event  │
                    └─────────────┘     │             │
                                        │ session_id  │
                    ┌─────────────┐     │ actor       │
                    │   event     │     │ action      │
                    │             │     │ tool        │
                    │ aggregate_id│     │ cost        │
                    │ type        │     └─────────────┘
                    │ data (JSON) │
                    └─────────────┘
```

## Related Documents

- [[system-architecture]] — Overall system architecture with data flow diagrams
- [[configuration]] — Database path configuration and data directory settings
- [[session-compaction]] — How sessions are compacted and context epochs work
- [[git-pii-redaction]] — How PII is redacted before reaching the database

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — complete database schema documentation |
