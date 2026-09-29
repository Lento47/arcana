---
tags: [daemon, bun, memory-tool, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# stale daemon masks committed fixes

Long-lived Bun daemon runs pre-fix code forever; committed fixes need a daemon kill/restart before live verification

The memory tool daemon executes whatever source existed at its boot; Bun never reloads edited code into a running process. This session the `memory_search` FTS5 fix landed at 11:03 PM (`63da3633`) but live calls kept throwing `fts5: syntax error` because the daemon was booted 5:51 PM — five hours stale.

**Why:** A 'fixed but still failing' live tool call is often a stale process, not broken code. The repo's own quick-facts note the signature: per-call errors on symbols/code that is fixed on disk.

**How to apply:** Compare the daemon's boot time to the fix's commit time. To pick up the fix, kill the daemon (the TUI auto-respawns it via `wrapDaemonFetch`) or restart the TUI, then re-run the failing query.
