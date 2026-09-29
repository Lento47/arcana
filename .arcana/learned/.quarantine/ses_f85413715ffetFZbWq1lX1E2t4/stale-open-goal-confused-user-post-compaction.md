---
tags: [goals, compaction, arcana]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# stale open goal confused user post compaction

Left the resolved 'Fix TUI crash' goal open (status blocked) — its active-focus injection made the crash appear still-live after compaction and confused the user

The 'Fix TUI crash' goal was set at session start and never closed, even though the crash was fixed in commit `494f7c61` (before the session). After compaction, the goal tracker's active-focus state injected 'why did the TUI crashed' into context, and the user saw the crash topic persist and asked why. The user clarified they never asked about it and was annoyed at the persistence.

**Why:** Open goal records with stale status actively inject misleading context after compaction — they don't just passively linger. The user had to explicitly say 'I didn't ask that' and 'create a new goal' to correct course.

**How to apply:** Close or update a goal the moment its underlying work is resolved. Before continuing any implementation after compaction, audit the active goal against reality and refresh it first — this was done correctly after the correction (stale goal updated, then new goal created on request, then work resumed).
