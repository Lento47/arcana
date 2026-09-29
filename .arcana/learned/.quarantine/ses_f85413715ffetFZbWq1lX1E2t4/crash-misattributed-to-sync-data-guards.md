---
tags: [arcana, debugging, root-cause]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# crash misattributed to sync data guards

Accepted 'unguarded sync.data accesses' as the crash cause from the session summary — actual cause was a duplicate sdk declaration

The compaction summary stated the crash came from unguarded `sync.data.*` accesses, and 7 optional-chaining guards had been added on that theory. Investigating why the crash happened (store init → git history → daemon log) revealed the true cause: a duplicate `const sdk` declaration in `project.tsx`, a parse-time error that killed the module graph before any frame. The guards were harmless defensive additions but not the fix.

**Why:** Plausible narratives recorded in summaries propagate as fact; the store's synchronous init made the undefined-collection theory implausible, and the log contradicted it outright.

**How to apply:** Treat root-cause claims inherited from summaries as hypotheses; verify against the actual crash record (daemon log) and store initialization before building fixes on them.
