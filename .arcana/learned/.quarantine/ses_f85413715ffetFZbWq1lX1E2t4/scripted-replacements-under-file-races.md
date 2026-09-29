---
tags: [arcan, concurrency, tooling, reliability]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# scripted replacements under file races

When a parallel agent edits the same files, use deterministic Node script replacements with immediate verification instead of the edit tool

While fixing the arcan docs UI, a parallel Codex agent (pid running `codex.js resume`) was editing the same `page.tsx`/`globals.css`. The edit tool emitted STALE warnings, reported "Edit applied successfully" against a corrupted oldString that couldn't have matched, and left the file in mixed states (one edit present, another absent, no injected garbage). Switching to a Node `.mjs` script that reads the file, performs exact string replacements, and writes back with newline normalization made edits deterministic and verifiable.

**Why:** The edit tool's success messages are unreliable when the file's mtime/content races another writer — it can claim success without the edit persisting, or match against corrupted state.

**How to apply:** On detecting a concurrent editor, write a throwaway script (e.g. in the OS temp dir) that does read → replace → verify → write; re-read the file after running to confirm the change landed; keep each edit idempotent so a re-run after the rival agent's revert restores it.
