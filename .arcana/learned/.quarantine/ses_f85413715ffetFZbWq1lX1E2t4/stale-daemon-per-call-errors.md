---
tags: [arcana, daemon, debugging, bun]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# stale daemon per call errors

Tool calls failing on code already fixed on disk = stale daemon; Bun dev never reloads a running process

A `memory_search` call threw `fts5: syntax error` hours after the fix was committed (`63da3633`) because the daemon serving the tool was booted 5 hours before the fix landed. Bun dev never reloads edited source into a running process.

**Why:** Per-call errors on symbols/code that verifiably works on disk is the classic stale-daemon signature (documented in the repo's own quick-facts). Without recognizing it, you chase phantom bugs in code that's already correct.

**How to apply:** When a tool call fails but the code on disk provably handles that input (test it with a direct run), check daemon boot time vs commit time. Clear it by killing the daemon — the TUI auto-respawns it via `wrapDaemonFetch` — or restarting the TUI. If the error persists after a fresh boot, then hunt for a second unsanitized call path.
