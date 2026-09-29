---
tags: [bun, tui, crash, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# bun parse fatal duplicate declaration

Duplicate const in one scope is a fatal Bun parse error at module load — daemon dies with exit code 1; the only trace is the daemon log.

Root cause of the TUI crash: `const sdk = useSDK()` was declared twice in `packages/tui/src/context/project.tsx`. Bun's parser treats a duplicate lexical declaration as a **fatal error at module load** (`Identifier 'sdk' has already been declared`), so the daemon exits with code 1 before anything renders — the UI dies with no in-app error or stack.

**Why:** A parse-level fatal leaves no runtime trace in the UI; the only evidence is in the daemon log, so the crash looks inexplicable without checking it.

**How to apply:** When the TUI/daemon dies silently (exit code 1), read the daemon log and look for parser fatals before suspecting runtime logic. Fixed in commit `494f7c61`.
