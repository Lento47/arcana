---
tags: [arcana, debugging, tui, process]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# crash fix built on unverified hypothesis

Added 7 sync.data optional-chaining guards for a crash actually caused by a duplicate `sdk` identifier in project.tsx

The session inherited (via compaction summary) the narrative that the TUI crash came from unguarded `sync.data.*` accesses, and 7 optional-chaining guards were added in `use-spine-projection.ts` (lines 107, 117, 128, 147, 195, 235, 260) on that basis. When pressed for the real cause, `%TEMP%\arcana-daemon.log` showed a Bun parse error — duplicate `const sdk = useSDK()` in `project.tsx:70` — and the store's synchronous init meant the sync.data story could not explain a plain-boot crash at all.

**Why:** Fixing from an inherited hypothesis without primary evidence wastes effort, leaves the real bug live, and entrenches a false root-cause narrative.

**How to apply:** Before building any crash fix from a summary or memory, pull primary evidence (daemon logs, recorded stacks, exit codes). Defensive guards can remain as hardening, but the recorded root cause must match the evidence.
