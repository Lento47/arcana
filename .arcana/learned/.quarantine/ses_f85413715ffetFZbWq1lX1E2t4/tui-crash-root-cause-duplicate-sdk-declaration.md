---
tags: [arcana, tui, crash, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# tui crash root cause duplicate sdk declaration

TUI crash was a duplicate `const sdk` declaration in project.tsx (Bun parse error), not the sync.data guards

The daemon crash boots (18:16:51 with a babel parse stack, 18:25:32 instant `exit code=1`) were caused by `Identifier 'sdk' has already been declared. (70:10)` in `packages/tui/src/context/project.tsx` — `const sdk = useSDK()` was declared twice (init scope and the workspace.status subscription wiring). Bun's parser failed at module load, killing the entire TUI module graph before a single frame rendered. The `sync.data.*` hypothesis never held for plain boot: the store initializes `message: {}`, `part: {}`, `session: []` synchronously at `sync.tsx:237`.

**Why:** A fix built on an inherited hypothesis leaves the real bug live while the project record claims it was solved.

**How to apply:** For any TUI/daemon crash, read `%TEMP%\arcana-daemon.log` first — it records `[boot]`/`[crash]` entries with parse stacks and exit codes. Trust recorded evidence over narratives carried in compaction summaries.
