---
tags: [arcana, tui, debugging, daemon-log]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# tui crash duplicate sdk declaration

Arcana TUI boot crashes were a duplicate `const sdk` declaration in project.tsx (module-load parse error), not unguarded sync.data accesses

The daemon log at `%TEMP%\arcana-daemon.log` recorded the true crash: `project.tsx: Identifier 'sdk' has already been declared. (70:10)` — the file declared `const sdk = useSDK()` twice (init scope and the workspace.status subscription). Bun's parser killed the entire TUI module graph before a single frame rendered; two boots died (18:16:51 parse crash, 18:25:32 instant exit=1).

**Why:** The prior theory — unguarded `sync.data.session/message/part` reads returning undefined — contradicted the store, which initializes `message: {}`, `part: {}`, `session: []` synchronously. Plain boot cannot yield undefined collections.

**How to apply:** For any Arcana TUI crash, read `%TEMP%\arcana-daemon.log` first (it records pid, boot args, and the crash stack), and reconcile any root-cause theory against the store's actual initial state before acting on it.
