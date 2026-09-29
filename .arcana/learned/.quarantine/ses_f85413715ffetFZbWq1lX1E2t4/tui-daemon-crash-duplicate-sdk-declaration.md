---
tags: [arcana, tui, debugging, bun]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# tui daemon crash duplicate sdk declaration

TUI daemon crash root cause: duplicate `const sdk = useSDK()` in packages/tui/src/context/project.tsx — Bun parse fatal at module load, exit code 1; fixed in commit 494f7c61

The historical TUI crash was a duplicate `const sdk = useSDK()` declaration in `packages/tui/src/context/project.tsx`. Bun's parser threw a fatal (`Identifier 'sdk' has already been declared`) at module load, killing the daemon with exit code 1. Fixed in commit `494f7c61`.

**Why:** Module-load parse fatals present as daemon exit-code-1 with no UI feedback — the symptom looks like a runtime crash but is a build/parse error. This crash is DEAD; any future crash report should be verified against the daemon log before assuming recurrence.

**How to apply:** For daemon exit code 1 with no UI, check the daemon log for parser fatals first; suspect duplicate identifiers introduced by refactors that touch context providers.
