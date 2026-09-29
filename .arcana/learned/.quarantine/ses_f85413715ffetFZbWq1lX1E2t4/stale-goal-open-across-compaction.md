---
tags: [goal-tracker, compaction, mistake]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# stale goal open across compaction

Left the fix-TUI-crash goal open after the crash was already fixed — post-compaction it made the user think the crash was still live.

The crash was fixed in `494f7c61` before this session, but its goal record (fix TUI crash, status `blocked`) was left open — kept open only because a keep-or-revert decision on the optional-chaining guards was pending. After compaction the stale goal resurfaced and the user read it as the crash still persisting.

**Why:** Goal records survive compaction independently of the transcript; an open goal whose underlying issue is resolved becomes misinformation in context.

**How to apply:** Close or update a goal the moment its underlying issue is fixed. If a follow-up decision remains, split it into its own clearly-labeled goal or annotate it — and after any compaction, proactively state which surviving goals are stale vs. live.
