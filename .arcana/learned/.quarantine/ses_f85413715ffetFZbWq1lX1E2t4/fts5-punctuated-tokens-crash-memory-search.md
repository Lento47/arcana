---
tags: [fts5, sqlite, memory-tool]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# fts5 punctuated tokens crash memory search

Punctuated query tokens like project.tsx must be sanitized/quoted for FTS5 MATCH or memory_search throws syntax error

`memory_search` with raw punctuated tokens (e.g., `TUI crash project.tsx sdk duplicate declaration`) threw `fts5: syntax error` because FTS5 MATCH syntax treats `.` and similar punctuation specially. Fixed in `63da3633` by sanitizing the query; the exact previously-crashing query then returned 1 result.

**Why:** Any user input containing file names, extensions, or punctuation can crash unsanitized FTS5 MATCH queries — a whole class of search failures, not a one-off.

**How to apply:** Quote or escape each token before building the MATCH expression; test with punctuated queries like `project.tsx` as the regression case. If a fresh daemon still throws the syntax error after this fix, hunt for a second unsanitized call path.
