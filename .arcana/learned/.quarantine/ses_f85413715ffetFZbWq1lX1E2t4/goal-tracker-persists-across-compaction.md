---
tags: [compaction, goal-tracker, session-state]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# goal tracker persists across compaction

Compaction summarizes only the message transcript — goal tracker state persists independently, so stale goals reappear after compaction.

The goal tracker stores active goals as session state **separate from the message transcript**. Compaction summarizes/replaces messages but never clears goal records — any goal set before compaction (whatever its status) still appears afterward.

**Why:** A surviving goal whose underlying issue is already fixed reads as if the problem is still live; this session's user asked why an already-fixed crash kept showing up after compaction.

**How to apply:** Treat goals as independently persistent state: close them as soon as they are resolved, and after compaction proactively clarify the status of any goal that survives if it could look stale.
