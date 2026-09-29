---
tags: [workflow, editing, verification]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# verify stale flagged edits landed

When an edit is flagged [STALE], re-read the file to confirm the change actually applied before proceeding

An edit was flagged `[STALE]` mid-session. Re-reading the target file confirmed both edits had actually landed, and the test run validated the fix.

**Why:** A stale flag can mean the edit failed or the file changed underneath; proceeding on assumption risks shipping a partial fix or re-editing already-correct code.

**How to apply:** Whenever a tool flags an edit as stale, re-read the target file (or the relevant lines) to verify the intended change is present before running tests or moving on.
