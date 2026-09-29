---
tags: [arcana, goals, compaction]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# goal tracker state survives compaction

Goal tracker records are session state separate from the message transcript — they persist across context compaction unless explicitly closed or updated

Compaction summarizes only the message transcript. Goal records (e.g. the 'Fix TUI crash' goal, status `blocked`) live in separate session state and survive compaction intact — including their 'active focus' injection into new context, which made a resolved crash appear still-live after compaction.

**Why:** This caused genuine user confusion post-compaction ('why is the crash thing persist after compaction?'). The crash was long fixed but the open goal record kept resurrecting it.

**How to apply:** When work is resolved or abandoned, close or update the goal record immediately. When resuming after compaction, refresh/update the stale goal record FIRST, before continuing implementation, so the tracker matches reality.
