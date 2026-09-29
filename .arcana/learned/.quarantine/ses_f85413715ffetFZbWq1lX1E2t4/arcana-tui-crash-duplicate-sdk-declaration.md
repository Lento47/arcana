---
tags: [arcana, tui, debugging, bun]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana tui crash duplicate sdk declaration

TUI crash root cause was a duplicate `const sdk` declaration in project.tsx (parse-time module-graph kill), not unguarded sync.data accesses

The TUI crash that killed two daemon boots (18:16:51 with a babel parse stack, 18:25:32 instant exit) was a parse-time error: `project.tsx` declared `const sdk = useSDK()` **twice** — once in init scope, once where the workspace.status subscription was wired. Bun's parser threw `Identifier 'sdk' has already been declared` at module load, killing the entire TUI module graph before a single frame rendered. Evidence lives in `%TEMP%\arcana-daemon.log` (boot/crash records with pid, timestamp, stack). The alternative theory was implausible on inspection: the sync store initializes `message: {}`, `part: {}`, `session: []`, `provider: []` synchronously, so plain boot cannot yield undefined collections.

**Why:** A plausible narrative (unguarded `sync.data.*` accesses) had been recorded as the crash cause in a session summary; the actual crash record contradicted it.

**How to apply:** For any 'TUI crashed' report, read the daemon log crash records first before theorizing; check whether store collections are synchronously initialized to falsify undefined-collection hypotheses.
